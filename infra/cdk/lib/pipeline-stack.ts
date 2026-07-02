import * as cdk from 'aws-cdk-lib';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as events from 'aws-cdk-lib/aws-events';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

interface PipelineStackProps extends cdk.StackProps {
  cluster: ecs.Cluster;
  testGeneratorTask: ecs.FargateTaskDefinition;
  apiRunnerTask: ecs.FargateTaskDefinition;
  reporterTask: ecs.FargateTaskDefinition;
  eventBus: events.EventBus;
}

export class SpeclynPipelineStack extends cdk.Stack {
  public readonly stateMachine: sfn.StateMachine;

  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    // ── Step 1: Generate Tests ──────────────────────────────────────────────
    // The test generator runs all 5 phases: functional, security, auth, multi-tenant, HIPAA
    const generateTests = new tasks.EcsRunTask(this, 'GenerateTests', {
      comment: 'Generate all test types (functional, security, auth, multi-tenant, HIPAA)',
      integrationPattern: sfn.IntegrationPattern.RUN_JOB,
      cluster: props.cluster,
      taskDefinition: props.testGeneratorTask,
      launchTarget: new tasks.EcsFargateLaunchTarget({
        platformVersion: ecs.FargatePlatformVersion.LATEST,
      }),
      containerOverrides: [{
        containerDefinition: props.testGeneratorTask.defaultContainer!,
        environment: [
          { name: 'PROJECT_ID', value: sfn.JsonPath.stringAt('$.projectId') },
          { name: 'RUN_ID', value: sfn.JsonPath.stringAt('$.runId') },
          { name: 'BASE_URL', value: sfn.JsonPath.stringAt('$.baseUrl') },
          { name: 'OWNER_ID', value: sfn.JsonPath.stringAt('$.ownerId') },
        ],
      }],
      resultPath: '$.generateResult',
    });

    // ── Step 2: Execute Tests ───────────────────────────────────────────────
    const executeTests = new tasks.EcsRunTask(this, 'ExecuteTests', {
      comment: 'Execute generated tests via Vitest',
      integrationPattern: sfn.IntegrationPattern.RUN_JOB,
      cluster: props.cluster,
      taskDefinition: props.apiRunnerTask,
      launchTarget: new tasks.EcsFargateLaunchTarget({
        platformVersion: ecs.FargatePlatformVersion.LATEST,
      }),
      containerOverrides: [{
        containerDefinition: props.apiRunnerTask.defaultContainer!,
        environment: [
          { name: 'PROJECT_ID', value: sfn.JsonPath.stringAt('$.projectId') },
          { name: 'RUN_ID', value: sfn.JsonPath.stringAt('$.runId') },
          { name: 'BASE_URL', value: sfn.JsonPath.stringAt('$.baseUrl') },
        ],
      }],
      resultPath: '$.executeResult',
    });

    // ── Step 3: Generate Report ─────────────────────────────────────────────
    const generateReport = new tasks.EcsRunTask(this, 'GenerateReport', {
      comment: 'Classify failures, compute coverage, fire webhooks',
      integrationPattern: sfn.IntegrationPattern.RUN_JOB,
      cluster: props.cluster,
      taskDefinition: props.reporterTask,
      launchTarget: new tasks.EcsFargateLaunchTarget({
        platformVersion: ecs.FargatePlatformVersion.LATEST,
      }),
      containerOverrides: [{
        containerDefinition: props.reporterTask.defaultContainer!,
        environment: [
          { name: 'PROJECT_ID', value: sfn.JsonPath.stringAt('$.projectId') },
          { name: 'RUN_ID', value: sfn.JsonPath.stringAt('$.runId') },
        ],
      }],
      resultPath: '$.reportResult',
    });

    // ── Step 4: Emit completion event ───────────────────────────────────────
    const emitCompletion = new tasks.EventBridgePutEvents(this, 'EmitRunCompleted', {
      entries: [{
        eventBus: props.eventBus,
        source: 'speclyn.pipeline',
        detailType: 'RunCompleted',
        detail: sfn.TaskInput.fromObject({
          projectId: sfn.JsonPath.stringAt('$.projectId'),
          runId: sfn.JsonPath.stringAt('$.runId'),
          status: 'completed',
        }),
      }],
      resultPath: sfn.JsonPath.DISCARD,
    });

    // ── Error handling ──────────────────────────────────────────────────────
    const markFailed = new tasks.EventBridgePutEvents(this, 'EmitRunFailed', {
      entries: [{
        eventBus: props.eventBus,
        source: 'speclyn.pipeline',
        detailType: 'RunFailed',
        detail: sfn.TaskInput.fromObject({
          projectId: sfn.JsonPath.stringAt('$.projectId'),
          runId: sfn.JsonPath.stringAt('$.runId'),
          status: 'error',
          error: sfn.JsonPath.stringAt('$.error'),
        }),
      }],
      resultPath: sfn.JsonPath.DISCARD,
    });

    const failState = new sfn.Fail(this, 'PipelineFailed', {
      cause: 'Test pipeline failed',
      error: 'PIPELINE_ERROR',
    });

    // ── Chain ───────────────────────────────────────────────────────────────
    const handleError = markFailed.next(failState);

    generateTests.addCatch(handleError, { resultPath: '$.error' });
    executeTests.addCatch(handleError, { resultPath: '$.error' });
    generateReport.addCatch(handleError, { resultPath: '$.error' });

    const definition = generateTests
      .next(executeTests)
      .next(generateReport)
      .next(emitCompletion)
      .next(new sfn.Succeed(this, 'PipelineComplete'));

    // ── State Machine ───────────────────────────────────────────────────────
    this.stateMachine = new sfn.StateMachine(this, 'speclyn-test-pipeline', {
      stateMachineName: 'speclyn-test-pipeline',
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      timeout: cdk.Duration.hours(1),
      tracingEnabled: true, // X-Ray
      logs: {
        destination: new logs.LogGroup(this, 'speclyn-pipeline-logs', {
          logGroupName: '/speclyn/pipeline',
          retention: logs.RetentionDays.TWO_WEEKS,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        }),
        level: sfn.LogLevel.ALL,
        includeExecutionData: true,
      },
    });

    // ── Outputs ─────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'StateMachineArn', { value: this.stateMachine.stateMachineArn });
    new cdk.CfnOutput(this, 'StateMachineName', { value: this.stateMachine.stateMachineName });
  }
}
