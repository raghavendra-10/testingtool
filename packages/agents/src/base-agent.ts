import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'
import { z } from 'zod'
import { getDb, agentDecisionLogs } from '@speclyn/db'
import { putMetric } from '@speclyn/shared-types'

const bedrockClient = new BedrockRuntimeClient({
  region: process.env['BEDROCK_REGION'] ?? 'us-west-2',
  credentials: {
    accessKeyId: process.env['AWS_ACCESS_KEY_ID']!,
    secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY']!,
  },
})

// Model tiers — critical agents use Sonnet, lightweight agents use Haiku (12x cheaper)
const SONNET_MODEL = process.env['BEDROCK_MODEL_ID'] ?? 'anthropic.claude-sonnet-4-20250514-v1:0'
const HAIKU_MODEL = process.env['BEDROCK_HAIKU_MODEL_ID'] ?? 'anthropic.claude-haiku-4-5-20251001-v1:0'

export type ModelTier = 'sonnet' | 'haiku'

export interface AgentResult<T> {
  success: boolean
  data?: T
  error?: Error
  latencyMs?: number
  flagForReview?: boolean
}

export abstract class BaseAgent<TInput, TOutput> {
  abstract readonly name: string
  abstract readonly outputSchema: z.ZodType<TOutput, z.ZodTypeDef, unknown>
  abstract buildPrompt(input: TInput): string
  abstract getSystemPrompt(): string

  /** Override to 'haiku' for lightweight agents (12x cheaper). Default: 'sonnet' */
  protected modelTier: ModelTier = 'sonnet'
  protected maxRetries = 2
  protected maxTokens = 8192

  private get modelId(): string {
    return this.modelTier === 'haiku' ? HAIKU_MODEL : SONNET_MODEL
  }

  async run(input: TInput, projectId?: string): Promise<AgentResult<TOutput>> {
    const startTime = Date.now()
    let lastError: Error | null = null
    const modelId = this.modelId

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const body = JSON.stringify({
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens: this.maxTokens,
          system: this.getSystemPrompt(),
          messages: [{ role: 'user', content: this.buildPrompt(input) }],
        })

        const command = new InvokeModelCommand({
          modelId,
          contentType: 'application/json',
          accept: 'application/json',
          body,
        })

        const response = await bedrockClient.send(command)
        const responseBody = JSON.parse(new TextDecoder().decode(response.body)) as {
          content: Array<{ text: string }>
          usage?: { input_tokens?: number; output_tokens?: number }
        }
        const text = responseBody.content[0]!.text.trim()
        const inputTokens = responseBody.usage?.input_tokens ?? 0
        const outputTokens = responseBody.usage?.output_tokens ?? 0

        // Strip markdown fences if model wrapped the JSON
        const json = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim()
        const parsed = this.outputSchema.safeParse(JSON.parse(json))

        if (!parsed.success) {
          throw new Error(`Zod validation failed: ${parsed.error.message}`)
        }

        const latencyMs = Date.now() - startTime
        await this.logDecision({ projectId, inputTokens, outputTokens, latencyMs, output: parsed.data })

        // Publish CloudWatch metrics (non-fatal)
        void putMetric('Speclyn/Agents', 'Latency', latencyMs, 'Milliseconds', { Agent: this.name }).catch(() => {})
        void putMetric('Speclyn/Agents', 'InputTokens', inputTokens, 'Count', { Agent: this.name }).catch(() => {})
        void putMetric('Speclyn/Agents', 'OutputTokens', outputTokens, 'Count', { Agent: this.name }).catch(() => {})

        return { success: true, data: parsed.data, latencyMs }
      } catch (err) {
        lastError = err as Error
        if (attempt < this.maxRetries) {
          await new Promise<void>((r) => setTimeout(r, 1000 * Math.pow(2, attempt)))
        }
      }
    }

    return { success: false, error: lastError!, flagForReview: true }
  }

  private async logDecision(opts: {
    projectId: string | undefined
    inputTokens: number
    outputTokens: number
    latencyMs: number
    output: TOutput
  }): Promise<void> {
    try {
      await getDb().insert(agentDecisionLogs).values({
        projectId: opts.projectId ?? null,
        agentType: this.name,
        modelUsed: this.modelId,
        inputSummary: this.name,
        outputSummary: JSON.stringify(opts.output).slice(0, 500),
        tokensInput: opts.inputTokens,
        tokensOutput: opts.outputTokens,
        latencyMs: opts.latencyMs,
        confidenceScore: 1.0,
      })
    } catch {
      // non-fatal — never fail a job because of logging
    }
  }
}
