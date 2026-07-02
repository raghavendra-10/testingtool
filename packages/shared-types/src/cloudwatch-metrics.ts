import { useAwsServices, getAwsRegion } from './aws-config.js'

/**
 * Publish custom metrics to CloudWatch (when USE_AWS_SERVICES=true).
 * Falls through silently when running locally.
 */
export async function putMetric(
  namespace: string,
  metricName: string,
  value: number,
  unit: 'Count' | 'Milliseconds' | 'Percent' | 'None' = 'None',
  dimensions?: Record<string, string>,
): Promise<void> {
  if (!useAwsServices()) return

  const { CloudWatchClient, PutMetricDataCommand } = await import('@aws-sdk/client-cloudwatch')

  const client = new CloudWatchClient({ region: getAwsRegion() })

  const dims = dimensions
    ? Object.entries(dimensions).map(([Name, Value]) => ({ Name, Value }))
    : undefined

  await client.send(new PutMetricDataCommand({
    Namespace: namespace,
    MetricData: [{
      MetricName: metricName,
      Value: value,
      Unit: unit,
      Dimensions: dims,
      Timestamp: new Date(),
    }],
  })).catch(() => {
    // non-fatal — never fail a job because of metrics
  })
}
