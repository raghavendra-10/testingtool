import { z } from 'zod'
import { BaseAgent } from './base-agent.js'

export interface DedupInput {
  projectId: string
  reqA: { id: string; title: string; description: string | null }
  reqB: { id: string; title: string; description: string | null }
  similarity: number
}

const DedupSchema = z.object({
  isDuplicate: z.boolean(),
  explanation: z.string(),
  suggestedAction: z.enum(['merge', 'keep_both', 'review']),
})

export type DedupOutput = z.infer<typeof DedupSchema>

export class RequirementDeduplicationAgent extends BaseAgent<DedupInput, DedupOutput> {
  readonly name = 'requirement-dedup-agent'
  readonly outputSchema = DedupSchema
  protected override modelTier = 'haiku' as const

  getSystemPrompt(): string {
    return `You are a requirements analyst for Speclyn. Given two requirements that are semantically similar, determine if they are duplicates.

Return ONLY a valid JSON object. No markdown.

Rules:
- "merge": requirements are clearly the same thing, stated differently
- "keep_both": they look similar but test different aspects or edge cases
- "review": ambiguous — flag for human review
- Be conservative: if in doubt, suggest "review" not "merge"`
  }

  buildPrompt(input: DedupInput): string {
    return `Are these two requirements duplicates? Similarity: ${(input.similarity * 100).toFixed(1)}%

<requirement_a>
Title: ${input.reqA.title}
Description: ${input.reqA.description ?? 'N/A'}
</requirement_a>

<requirement_b>
Title: ${input.reqB.title}
Description: ${input.reqB.description ?? 'N/A'}
</requirement_b>

Return: { "isDuplicate": true/false, "explanation": "...", "suggestedAction": "merge|keep_both|review" }`
  }
}
