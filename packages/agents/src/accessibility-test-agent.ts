import { z } from 'zod'
import { BaseAgent } from './base-agent.js'

export interface AccessibilityTestInput {
  projectId: string
  pageUrl: string
  pageTitle: string
  knownElements: Array<{ selector: string; role: string }>
}

const AccessibilityTestSchema = z.object({
  code: z.string(),
  wcagLevel: z.enum(['A', 'AA', 'AAA']),
  checksIncluded: z.array(z.string()),
})

export type AccessibilityTestOutput = z.infer<typeof AccessibilityTestSchema>

export class AccessibilityTestAgent extends BaseAgent<AccessibilityTestInput, AccessibilityTestOutput> {
  readonly name = 'accessibility-test-agent'
  readonly outputSchema = AccessibilityTestSchema

  getSystemPrompt(): string {
    return `You are an accessibility testing expert. Generate a Playwright test that uses @axe-core/playwright to audit a web page.

Return ONLY valid JSON. No markdown.

Rules:
- Generate a complete Playwright test file as a string in the "code" field
- Use @axe-core/playwright AxeBuilder for automated audits
- Check for WCAG 2.1 AA compliance by default
- Verify aria-labels on interactive elements
- Check color contrast ratios
- Verify keyboard navigation works
- Include specific assertions, not just axe.analyze()
- List all WCAG checks included in the "checksIncluded" array`
  }

  buildPrompt(input: AccessibilityTestInput): string {
    return `Generate an accessibility test for this page.

<page_url>${input.pageUrl}</page_url>
<page_title>${input.pageTitle}</page_title>
<known_elements>
${JSON.stringify(input.knownElements, null, 2)}
</known_elements>

Return: { "code": "...", "wcagLevel": "AA", "checksIncluded": [...] }`
  }
}
