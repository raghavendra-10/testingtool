import { useAwsServices, getEventBusName, getAwsRegion } from './aws-config.js'

/**
 * Publish an event to EventBridge (when USE_AWS_SERVICES=true).
 * Falls through silently when running locally.
 */
export async function publishEvent(
  source: string,
  detailType: string,
  detail: Record<string, unknown>,
): Promise<void> {
  if (!useAwsServices()) return

  // Dynamic import to avoid loading AWS SDK in local dev
  const { EventBridgeClient, PutEventsCommand } = await import('@aws-sdk/client-eventbridge')

  const client = new EventBridgeClient({ region: getAwsRegion() })

  await client.send(new PutEventsCommand({
    Entries: [{
      EventBusName: getEventBusName(),
      Source: source,
      DetailType: detailType,
      Detail: JSON.stringify(detail),
    }],
  }))
}
