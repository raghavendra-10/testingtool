import * as cdk from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';

export class SpeclynEventStack extends cdk.Stack {
  public readonly eventBus: events.EventBus;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── Event Bus ───────────────────────────────────────────────────────────
    this.eventBus = new events.EventBus(this, 'speclyn-bus', {
      eventBusName: 'speclyn-events',
    });

    // Archive all events for 30 days (replay/debugging)
    this.eventBus.archive('speclyn-archive', {
      archiveName: 'speclyn-event-archive',
      description: 'Archive all Speclyn events for 30 days',
      eventPattern: { source: [{ prefix: 'speclyn' }] as any },
      retention: cdk.Duration.days(30),
    });

    // ── Log all events to CloudWatch (for debugging) ────────────────────────
    const eventLogGroup = new logs.LogGroup(this, 'speclyn-event-log', {
      logGroupName: '/speclyn/events',
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    new events.Rule(this, 'log-all-events', {
      eventBus: this.eventBus,
      ruleName: 'speclyn-log-all',
      description: 'Log all Speclyn events to CloudWatch',
      eventPattern: {
        source: [{ prefix: 'speclyn' }] as any,
      },
      targets: [new targets.CloudWatchLogGroup(eventLogGroup)],
    });

    // ── Event rules for specific patterns ───────────────────────────────────

    // Rule: Run completed → could trigger notifications, webhooks
    new events.Rule(this, 'run-completed-rule', {
      eventBus: this.eventBus,
      ruleName: 'speclyn-run-completed',
      description: 'Fires when a test run completes',
      eventPattern: {
        source: ['speclyn.runner'],
        detailType: ['RunCompleted'],
      },
      // Targets added later (Lambda for email, SQS for webhook delivery, etc.)
    });

    // Rule: Critical defect created
    new events.Rule(this, 'critical-defect-rule', {
      eventBus: this.eventBus,
      ruleName: 'speclyn-critical-defect',
      description: 'Fires when a critical defect is created',
      eventPattern: {
        source: ['speclyn.reporter'],
        detailType: ['DefectCreated'],
        detail: { severity: ['critical'] },
      },
    });

    // Rule: Code analysis completed
    new events.Rule(this, 'code-analysis-completed-rule', {
      eventBus: this.eventBus,
      ruleName: 'speclyn-code-analysis-completed',
      description: 'Fires when code analysis completes',
      eventPattern: {
        source: ['speclyn.analyzer'],
        detailType: ['CodeAnalysisCompleted'],
      },
    });

    // ── Outputs ─────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'EventBusArn', { value: this.eventBus.eventBusArn });
    new cdk.CfnOutput(this, 'EventBusName', { value: this.eventBus.eventBusName });
  }
}
