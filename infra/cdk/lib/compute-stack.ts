import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as events from 'aws-cdk-lib/aws-events';
import { Construct } from 'constructs';

interface ComputeStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  dbSecret: secretsmanager.Secret;
  appSecret: secretsmanager.Secret;
  rdsEndpoint: string;
  rdsPort: string;
  redisEndpoint: string;
  redisPort: string;
  eventBus: events.EventBus;
}

export class SpeclynComputeStack extends cdk.Stack {
  public readonly cluster: ecs.Cluster;
  public readonly testGeneratorTask: ecs.FargateTaskDefinition;
  public readonly apiRunnerTask: ecs.FargateTaskDefinition;
  public readonly reporterTask: ecs.FargateTaskDefinition;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    // ── ECR Repositories ────────────────────────────────────────────────────
    const repos: Record<string, ecr.Repository> = {};
    const serviceNames = [
      'api', 'web',
      'worker-test-generator', 'worker-api-runner', 'worker-browser-runner',
      'worker-browser-test-generator', 'worker-reporter', 'worker-scheduler',
      'worker-repo-analyzer', 'worker-doc-parser', 'worker-code-analyzer',
    ];

    for (const name of serviceNames) {
      repos[name] = new ecr.Repository(this, `speclyn-${name}-repo`, {
        repositoryName: `speclyn/${name}`,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
        lifecycleRules: [{ maxImageCount: 10 }],
      });
    }

    // ── ECS Cluster ─────────────────────────────────────────────────────────
    this.cluster = new ecs.Cluster(this, 'speclyn-cluster', {
      clusterName: 'speclyn',
      vpc: props.vpc,
      containerInsights: true,
      enableFargateCapacityProviders: true,
    });

    // ── Shared IAM Role for workers ─────────────────────────────────────────
    const workerRole = new iam.Role(this, 'speclyn-worker-role', {
      roleName: 'speclyn-worker-role',
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    // Bedrock access
    workerRole.addToPolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
      resources: ['*'],
    }));

    // S3 access
    workerRole.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject', 's3:ListBucket'],
      resources: ['arn:aws:s3:::speclyn-*', 'arn:aws:s3:::speclyn-*/*'],
    }));

    // Secrets Manager access
    props.dbSecret.grantRead(workerRole);
    props.appSecret.grantRead(workerRole);

    // EventBridge access
    workerRole.addToPolicy(new iam.PolicyStatement({
      actions: ['events:PutEvents'],
      resources: [props.eventBus.eventBusArn],
    }));

    // X-Ray tracing
    workerRole.addToPolicy(new iam.PolicyStatement({
      actions: ['xray:PutTraceSegments', 'xray:PutTelemetryRecords'],
      resources: ['*'],
    }));

    // Step Functions (for workers that trigger state machines)
    workerRole.addToPolicy(new iam.PolicyStatement({
      actions: ['states:StartExecution', 'states:DescribeExecution'],
      resources: ['arn:aws:states:*:*:stateMachine:speclyn-*'],
    }));

    // ── Execution Role ──────────────────────────────────────────────────────
    const executionRole = new iam.Role(this, 'speclyn-exec-role', {
      roleName: 'speclyn-ecs-exec-role',
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });
    props.dbSecret.grantRead(executionRole);
    props.appSecret.grantRead(executionRole);

    // ── Security Group for workers ──────────────────────────────────────────
    const workerSg = new ec2.SecurityGroup(this, 'speclyn-worker-sg', {
      vpc: props.vpc,
      securityGroupName: 'speclyn-worker-sg',
      description: 'Speclyn Fargate workers',
      allowAllOutbound: true,
    });

    // ── Shared environment variables ────────────────────────────────────────
    const sharedEnv: Record<string, string> = {
      NODE_ENV: 'production',
      AWS_REGION: cdk.Stack.of(this).region,
      REDIS_URL: `redis://${props.redisEndpoint}:${props.redisPort}`,
      EVENT_BUS_NAME: props.eventBus.eventBusName,
      USE_AWS_SERVICES: 'true', // feature flag to use AWS services vs local
    };

    const dbSecretEnv = {
      DATABASE_URL: ecs.Secret.fromSecretsManager(props.dbSecret, 'connectionString'),
    };

    // ── Helper: create task definition ───────────────────────────────────────
    const createTask = (
      name: string,
      cpu: number,
      memoryMiB: number,
      command: string[],
    ): ecs.FargateTaskDefinition => {
      const task = new ecs.FargateTaskDefinition(this, `speclyn-${name}-task`, {
        family: `speclyn-${name}`,
        cpu,
        memoryLimitMiB: memoryMiB,
        taskRole: workerRole,
        executionRole,
        runtimePlatform: {
          cpuArchitecture: ecs.CpuArchitecture.ARM64,
          operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
        },
      });

      task.addContainer(`speclyn-${name}`, {
        containerName: `speclyn-${name}`,
        image: ecs.ContainerImage.fromEcrRepository(repos[name]!),
        command,
        environment: sharedEnv,
        secrets: {
          DB_SECRET: ecs.Secret.fromSecretsManager(props.dbSecret),
          APP_SECRET: ecs.Secret.fromSecretsManager(props.appSecret),
        },
        logging: ecs.LogDriver.awsLogs({
          logGroup: new logs.LogGroup(this, `speclyn-${name}-logs`, {
            logGroupName: `/speclyn/${name}`,
            retention: logs.RetentionDays.TWO_WEEKS,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
          }),
          streamPrefix: name,
        }),
        healthCheck: {
          command: ['CMD-SHELL', 'node -e "process.exit(0)"'],
          interval: cdk.Duration.seconds(30),
          timeout: cdk.Duration.seconds(5),
          retries: 3,
        },
      });

      return task;
    };

    // ── Worker Task Definitions ─────────────────────────────────────────────

    this.testGeneratorTask = createTask('worker-test-generator', 1024, 2048,
      ['node', '--import', 'tsx/esm', 'src/index.ts']);

    this.apiRunnerTask = createTask('worker-api-runner', 512, 1024,
      ['node', '--import', 'tsx/esm', 'src/index.ts']);

    this.reporterTask = createTask('worker-reporter', 512, 1024,
      ['node', '--import', 'tsx/esm', 'src/index.ts']);

    const browserRunnerTask = createTask('worker-browser-runner', 2048, 4096,
      ['node', '--import', 'tsx/esm', 'src/index.ts']);

    const browserTestGenTask = createTask('worker-browser-test-generator', 1024, 2048,
      ['node', '--import', 'tsx/esm', 'src/index.ts']);

    const docParserTask = createTask('worker-doc-parser', 512, 1024,
      ['node', '--import', 'tsx/esm', 'src/index.ts']);

    const repoAnalyzerTask = createTask('worker-repo-analyzer', 1024, 2048,
      ['node', '--import', 'tsx/esm', 'src/index.ts']);

    const schedulerTask = createTask('worker-scheduler', 256, 512,
      ['node', '--import', 'tsx/esm', 'src/index.ts']);

    const codeAnalyzerTask = createTask('worker-code-analyzer', 1024, 2048,
      ['node', '--import', 'tsx/esm', 'src/index.ts']);

    // ── Long-running Worker Services ────────────────────────────────────────
    // These workers run continuously and poll BullMQ queues

    const workerServices = [
      { name: 'doc-parser', task: docParserTask, desired: 1 },
      { name: 'repo-analyzer', task: repoAnalyzerTask, desired: 1 },
      { name: 'scheduler', task: schedulerTask, desired: 1 },
      { name: 'test-generator', task: this.testGeneratorTask, desired: 1 },
      { name: 'api-runner', task: this.apiRunnerTask, desired: 2 },
      { name: 'browser-test-gen', task: browserTestGenTask, desired: 1 },
      { name: 'browser-runner', task: browserRunnerTask, desired: 1 },
      { name: 'reporter', task: this.reporterTask, desired: 1 },
      { name: 'code-analyzer', task: codeAnalyzerTask, desired: 1 },
    ];

    for (const svc of workerServices) {
      new ecs.FargateService(this, `speclyn-svc-${svc.name}`, {
        serviceName: `speclyn-${svc.name}`,
        cluster: this.cluster,
        taskDefinition: svc.task,
        desiredCount: svc.desired,
        assignPublicIp: false,
        securityGroups: [workerSg],
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        capacityProviderStrategies: [{
          capacityProvider: 'FARGATE_SPOT',
          weight: 80,
        }, {
          capacityProvider: 'FARGATE',
          weight: 20,
          base: 1, // at least 1 on-demand task
        }],
        circuitBreaker: { rollback: true },
      });
    }

    // ── API Service (with ALB) ──────────────────────────────────────────────
    const apiTask = new ecs.FargateTaskDefinition(this, 'speclyn-api-task', {
      family: 'speclyn-api',
      cpu: 512,
      memoryLimitMiB: 1024,
      taskRole: workerRole,
      executionRole,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    });

    apiTask.addContainer('speclyn-api', {
      containerName: 'speclyn-api',
      image: ecs.ContainerImage.fromEcrRepository(repos['api']!),
      environment: { ...sharedEnv, PORT: '3001', HOST: '0.0.0.0' },
      secrets: {
        DB_SECRET: ecs.Secret.fromSecretsManager(props.dbSecret),
        APP_SECRET: ecs.Secret.fromSecretsManager(props.appSecret),
      },
      portMappings: [{ containerPort: 3001, protocol: ecs.Protocol.TCP }],
      logging: ecs.LogDriver.awsLogs({
        logGroup: new logs.LogGroup(this, 'speclyn-api-logs', {
          logGroupName: '/speclyn/api',
          retention: logs.RetentionDays.TWO_WEEKS,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        }),
        streamPrefix: 'api',
      }),
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f http://localhost:3001/api/v1/health || exit 1'],
        interval: cdk.Duration.seconds(15),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
      },
    });

    const apiSg = new ec2.SecurityGroup(this, 'speclyn-api-sg', {
      vpc: props.vpc,
      securityGroupName: 'speclyn-api-sg',
      description: 'Speclyn API ALB',
      allowAllOutbound: true,
    });
    apiSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'HTTPS from internet');
    apiSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'HTTP redirect');

    const apiService = new ecs.FargateService(this, 'speclyn-api-service', {
      serviceName: 'speclyn-api',
      cluster: this.cluster,
      taskDefinition: apiTask,
      desiredCount: 2,
      assignPublicIp: false,
      securityGroups: [workerSg],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      circuitBreaker: { rollback: true },
    });

    const alb = new elbv2.ApplicationLoadBalancer(this, 'speclyn-alb', {
      loadBalancerName: 'speclyn-api-alb',
      vpc: props.vpc,
      internetFacing: true,
      securityGroup: apiSg,
    });

    const listener = alb.addListener('speclyn-listener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      // Add HTTPS listener with ACM certificate for production
    });

    listener.addTargets('speclyn-api-target', {
      targetGroupName: 'speclyn-api-tg',
      port: 3001,
      targets: [apiService],
      healthCheck: {
        path: '/api/v1/health',
        interval: cdk.Duration.seconds(30),
        healthyThresholdCount: 2,
      },
      deregistrationDelay: cdk.Duration.seconds(30),
    });

    // Allow ALB → workers on port 3001
    workerSg.addIngressRule(apiSg, ec2.Port.tcp(3001), 'ALB to API');

    // ── Outputs ─────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'ClusterArn', { value: this.cluster.clusterArn });
    new cdk.CfnOutput(this, 'AlbDns', { value: alb.loadBalancerDnsName });

    // Output all ECR URIs for build scripts
    for (const [name, repo] of Object.entries(repos)) {
      new cdk.CfnOutput(this, `Ecr-${name}`, { value: repo.repositoryUri });
    }
  }
}
