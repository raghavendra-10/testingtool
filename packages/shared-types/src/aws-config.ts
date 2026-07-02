/**
 * AWS service integration helpers.
 * When USE_AWS_SERVICES=true, workers use Step Functions, EventBridge, Secrets Manager.
 * When false (local dev), they use BullMQ + Redis as before.
 */

export function useAwsServices(): boolean {
  return process.env['USE_AWS_SERVICES'] === 'true'
}

export function getEventBusName(): string {
  return process.env['EVENT_BUS_NAME'] ?? 'speclyn-events'
}

export function getStateMachineArn(): string | undefined {
  return process.env['STATE_MACHINE_ARN']
}

export function getAwsRegion(): string {
  return process.env['AWS_REGION'] ?? 'us-west-2'
}
