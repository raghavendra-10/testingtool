import { z } from 'zod'
import { BaseAgent } from './base-agent.js'

export interface UIExplorerInput {
  projectId: string
  pageUrl: string
  pageHtml: string
}

const UIExplorerSchema = z.object({
  elements: z.array(z.object({
    selector: z.string(),
    selectorStrategy: z.enum(['data-testid', 'getByRole', 'getByText', 'css']),
    role: z.string(),
    text: z.string(),
    interactable: z.boolean(),
    elementType: z.enum(['button', 'link', 'input', 'select', 'textarea', 'form', 'navigation', 'heading', 'other']),
  })),
  pageTitle: z.string(),
  forms: z.array(z.object({
    action: z.string(),
    method: z.string(),
    fields: z.array(z.object({ name: z.string(), type: z.string(), required: z.boolean() })),
  })),
})

export type UIExplorerOutput = z.infer<typeof UIExplorerSchema>

export class UIExplorerAgent extends BaseAgent<UIExplorerInput, UIExplorerOutput> {
  readonly name = 'ui-explorer-agent'
  readonly outputSchema = UIExplorerSchema
  protected override modelTier = 'haiku' as const

  getSystemPrompt(): string {
    return `You are a UI analysis expert for Speclyn. Analyze a web page's HTML to build an element inventory.

Return ONLY valid JSON. No markdown.

Rules:
- Identify all interactive elements: buttons, links, inputs, selects, textareas
- For each element, determine the most stable selector:
  1. data-testid attribute (best)
  2. getByRole with accessible name (good)
  3. getByText for unique visible text (acceptable)
  4. CSS selector (last resort)
- Identify forms and their fields
- Detect the page title
- Limit to the most important 30 elements
- Mark elements as interactable: true if they can be clicked/typed into`
  }

  buildPrompt(input: UIExplorerInput): string {
    return `Analyze this web page HTML and build an element inventory.

<page_url>${input.pageUrl}</page_url>
<html>
${input.pageHtml.slice(0, 6000)}
</html>

Return: { "elements": [...], "pageTitle": "...", "forms": [...] }`
  }
}
