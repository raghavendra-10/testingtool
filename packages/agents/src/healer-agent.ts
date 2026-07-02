import { z } from 'zod'
import { BaseAgent } from './base-agent.js'

export interface HealerInput {
  projectId: string
  testId: string
  failedSelector: string
  pageHtml: string
  originalContext: string
}

const HealerSchema = z.object({
  proposedSelector: z.string(),
  confidence: z.number().min(0).max(1),
  strategy: z.enum(['data-testid', 'getByRole', 'getByText', 'css', 'xpath']),
  explanation: z.string(),
  requiresReview: z.boolean(),
})

export type HealerOutput = z.infer<typeof HealerSchema>

export class HealerAgent extends BaseAgent<HealerInput, HealerOutput> {
  readonly name = 'healer-agent'
  readonly outputSchema = HealerSchema
  protected override modelTier = 'haiku' as const

  getSystemPrompt(): string {
    return `You are a test self-healing expert for Speclyn. A Playwright test selector failed. Analyze the current page HTML and propose a fixed selector.

Return ONLY valid JSON. No markdown.

Rules:
- Look for the element that was previously matched by the old selector
- Prefer data-testid selectors (most stable)
- Fall back to getByRole, getByText, then CSS
- Set confidence between 0.0 and 1.0 based on how certain you are
- Set requiresReview: true if confidence < 0.8
- Never propose an XPath selector unless absolutely necessary
- Explain what changed (e.g. "class renamed from btn-primary to btn-main")`
  }

  buildPrompt(input: HealerInput): string {
    return `A Playwright selector failed. Propose a fix.

<failed_selector>${input.failedSelector}</failed_selector>
<original_context>${input.originalContext}</original_context>
<current_html>
${input.pageHtml.slice(0, 6000)}
</current_html>

Return: { "proposedSelector": "...", "confidence": 0.0-1.0, "strategy": "...", "explanation": "...", "requiresReview": true/false }`
  }
}
