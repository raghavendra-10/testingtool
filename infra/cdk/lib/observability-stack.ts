import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as events from 'aws-cdk-lib/aws-events';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Construct } from 'constructs';

interface ObservabilityStackProps extends cdk.StackProps {
  cluster: ecs.Cluster;
  stateMachine: sfn.StateMachine;
  eventBus: events.EventBus;
}

export class SpeclynObservabilityStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props);

    // ── SNS Topic for alerts ────────────────────────────────────────────────
    const alertTopic = new sns.Topic(this, 'speclyn-alerts', {
      topicName: 'speclyn-alerts',
      displayName: 'Speclyn Platform Alerts',
    });

    // ── CloudWatch Dashboard ────────────────────────────────────────────────
    const dashboard = new cloudwatch.Dashboard(this, 'speclyn-dashboard', {
      dashboardName: 'speclyn-platform',
      periodOverride: cloudwatch.PeriodOverride.AUTO,
    });

    // ── Pipeline Metrics ────────────────────────────────────────────────────
    const pipelineStarted = props.stateMachine.metricStarted({ period: cdk.Duration.minutes(5) });
    const pipelineSucceeded = props.stateMachine.metricSucceeded({ period: cdk.Duration.minutes(5) });
    const pipelineFailed = props.stateMachine.metricFailed({ period: cdk.Duration.minutes(5) });
    const pipelineDuration = props.stateMachine.metricTime({ period: cdk.Duration.minutes(5) });

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Test Pipeline Executions',
        width: 12,
        left: [pipelineStarted, pipelineSucceeded, pipelineFailed],
      }),
      new cloudwatch.GraphWidget({
        title: 'Pipeline Duration (ms)',
        width: 12,
        left: [pipelineDuration],
      }),
    );

    // ── ECS Cluster Metrics ─────────────────────────────────────────────────
    const cpuMetric = new cloudwatch.Metric({
      namespace: 'AWS/ECS',
      metricName: 'CPUUtilization',
      dimensionsMap: { ClusterName: props.cluster.clusterName },
      period: cdk.Duration.minutes(5),
      statistic: 'Average',
    });

    const memoryMetric = new cloudwatch.Metric({
      namespace: 'AWS/ECS',
      metricName: 'MemoryUtilization',
      dimensionsMap: { ClusterName: props.cluster.clusterName },
      period: cdk.Duration.minutes(5),
      statistic: 'Average',
    });

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'ECS Cluster — CPU Utilization',
        width: 12,
        left: [cpuMetric],
      }),
      new cloudwatch.GraphWidget({
        title: 'ECS Cluster — Memory Utilization',
        width: 12,
        left: [memoryMetric],
      }),
    );

    // ── Worker-level Metrics (from custom log metrics) ──────────────────────
    const workerNames = [
      'test-generator', 'api-runner', 'browser-runner',
      'reporter', 'code-analyzer', 'doc-parser',
    ];

    const errorWidgets = workerNames.map(name => {
      const errorMetric = new cloudwatch.Metric({
        namespace: 'Speclyn/Workers',
        metricName: 'Errors',
        dimensionsMap: { Worker: name },
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      });
      return errorMetric;
    });

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Worker Errors',
        width: 24,
        left: errorWidgets,
      }),
    );

    // ── AI Agent Metrics ────────────────────────────────────────────────────
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Bedrock API Latency',
        width: 12,
        left: [new cloudwatch.Metric({
          namespace: 'Speclyn/Agents',
          metricName: 'Latency',
          period: cdk.Duration.minutes(5),
          statistic: 'p95',
        })],
      }),
      new cloudwatch.GraphWidget({
        title: 'Bedrock Token Usage',
        width: 12,
        left: [
          new cloudwatch.Metric({
            namespace: 'Speclyn/Agents',
            metricName: 'InputTokens',
            period: cdk.Duration.minutes(5),
            statistic: 'Sum',
          }),
          new cloudwatch.Metric({
            namespace: 'Speclyn/Agents',
            metricName: 'OutputTokens',
            period: cdk.Duration.minutes(5),
            statistic: 'Sum',
          }),
        ],
      }),
    );

    // ── Test Results Dashboard ───────────────────────────────────────────────
    dashboard.addWidgets(
      new cloudwatch.SingleValueWidget({
        title: 'Test Pass Rate (24h)',
        width: 8,
        metrics: [new cloudwatch.Metric({
          namespace: 'Speclyn/Tests',
          metricName: 'PassRate',
          period: cdk.Duration.hours(24),
          statistic: 'Average',
        })],
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Total Tests Run (24h)',
        width: 8,
        metrics: [new cloudwatch.Metric({
          namespace: 'Speclyn/Tests',
          metricName: 'TestsExecuted',
          period: cdk.Duration.hours(24),
          statistic: 'Sum',
        })],
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Defects Created (24h)',
        width: 8,
        metrics: [new cloudwatch.Metric({
          namespace: 'Speclyn/Tests',
          metricName: 'DefectsCreated',
          period: cdk.Duration.hours(24),
          statistic: 'Sum',
        })],
      }),
    );

    // ── Alarms ──────────────────────────────────────────────────────────────

    // Pipeline failure rate > 50%
    const pipelineFailAlarm = new cloudwatch.Alarm(this, 'pipeline-fail-alarm', {
      alarmName: 'speclyn-pipeline-high-failure-rate',
      alarmDescription: 'Test pipeline failure rate exceeds 50%',
      metric: pipelineFailed,
      threshold: 3,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    pipelineFailAlarm.addAlarmAction(new actions.SnsAction(alertTopic));

    // ECS CPU > 80%
    const cpuAlarm = new cloudwatch.Alarm(this, 'ecs-cpu-alarm', {
      alarmName: 'speclyn-ecs-high-cpu',
      alarmDescription: 'ECS cluster CPU > 80%',
      metric: cpuMetric,
      threshold: 80,
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
    cpuAlarm.addAlarmAction(new actions.SnsAction(alertTopic));

    // ECS Memory > 85%
    const memAlarm = new cloudwatch.Alarm(this, 'ecs-memory-alarm', {
      alarmName: 'speclyn-ecs-high-memory',
      alarmDescription: 'ECS cluster memory > 85%',
      metric: memoryMetric,
      threshold: 85,
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
    memAlarm.addAlarmAction(new actions.SnsAction(alertTopic));

    // ── Outputs ─────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: `https://${cdk.Stack.of(this).region}.console.aws.amazon.com/cloudwatch/home?region=${cdk.Stack.of(this).region}#dashboards:name=speclyn-platform`,
    });
    new cdk.CfnOutput(this, 'AlertTopicArn', { value: alertTopic.topicArn });
  }
}
