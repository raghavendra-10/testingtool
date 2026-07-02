import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'

const client = new BedrockRuntimeClient({
  region: process.env['BEDROCK_REGION'] ?? 'us-west-2',
  credentials: {
    accessKeyId: process.env['AWS_ACCESS_KEY_ID']!,
    secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY']!,
  },
})

const EMBED_MODEL = 'amazon.titan-embed-text-v2:0'

/**
 * Generate a 1024-dimensional embedding vector for the given text.
 * Uses Amazon Titan Embed Text v2 via Bedrock.
 */
export async function embedText(text: string): Promise<number[]> {
  const body = JSON.stringify({
    inputText: text.slice(0, 8000), // Titan max input ~8k chars
    dimensions: 1024,
    normalize: true,
  })

  const command = new InvokeModelCommand({
    modelId: EMBED_MODEL,
    contentType: 'application/json',
    accept: 'application/json',
    body,
  })

  const response = await client.send(command)
  const result = JSON.parse(new TextDecoder().decode(response.body)) as {
    embedding: number[]
  }

  return result.embedding
}

/**
 * Batch embed multiple texts. Calls embedText sequentially to avoid rate limits.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const results: number[][] = []
  for (const text of texts) {
    results.push(await embedText(text))
  }
  return results
}
