import { z } from 'zod'
import { BaseAgent } from './base-agent.js'

export interface BrowserTestInput {
  projectId: string
  testId: string
  pageUrl: string
  requirement: { title: string; description: string | null }
  authType: string | null
  elementInventory: Array<{ selector: string; role: string; text: string }>
}

const BrowserTestSchema = z.object({
  code: z.string(),
  imports: z.array(z.string()),
})

export type BrowserTestOutput = z.infer<typeof BrowserTestSchema>

export class BrowserTestAgent extends BaseAgent<BrowserTestInput, BrowserTestOutput> {
  readonly name = 'browser-test-agent'
  readonly outputSchema = BrowserTestSchema

  getSystemPrompt(): string {
    return `You are a Playwright test generation expert for Speclyn. Generate browser E2E test code.

Return ONLY valid JSON. No markdown.

Rules:
- Use @playwright/test imports (test, expect, Page)
- Prefer selectors in this order: data-testid → getByRole → getByText → CSS (last resort)
- Wrap in test.describe() with the testId as prefix in the title
- Use page.goto(), page.click(), page.fill(), page.getByRole(), page.getByTestId()
- Add expect() assertions for visible text, element states, URL changes
- Take screenshots at key assertion points: page.screenshot()
- Never hardcode credentials — use process.env['SPECLYN_CRED_*']
- No video recording — only screenshots
- Each test should be self-contained and idempotent
- Use process.env['SPECLYN_BASE_URL'] for the base URL`
  }

  buildPrompt(input: BrowserTestInput): string {
    return `Generate a Playwright E2E test for this requirement.

<test_id>${input.testId}</test_id>
<page_url>${input.pageUrl}</page_url>
<requirement>
Title: ${input.requirement.title}
Description: ${input.requirement.description ?? 'N/A'}
</requirement>
<auth_type>${input.authType ?? 'none'}</auth_type>
<element_inventory>
${JSON.stringify(input.elementInventory.slice(0, 20), null, 2)}
</element_inventory>

Return: { "code": "...", "imports": ["@playwright/test"] }`
  }
}
