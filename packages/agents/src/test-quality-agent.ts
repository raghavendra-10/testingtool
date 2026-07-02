import { z } from 'zod'
import { BaseAgent } from './base-agent.js'

export interface TestQualityInput {
  projectId: string
  testCode: string
  testName: string
  requirementTitle: string | null
  endpointMethod: string
  endpointPath: string
}

const TestQualitySchema = z.object({
  score: z.number().int().min(1).max(5),
  reasoning: z.string(),
  suggestions: z.array(z.string()),
})

export type TestQualityOutput = z.infer<typeof TestQualitySchema>

export class TestQualityAgent extends BaseAgent<TestQualityInput, TestQualityOutput> {
  readonly name = 'test-quality-agent'
  readonly outputSchema = TestQualitySchema
  protected override modelTier = 'haiku' as const

  getSystemPrompt(): string {
    return `You are a test quality reviewer for Speclyn. Rate the quality of an API test on a 1-5 scale.

Return ONLY a valid JSON object. No markdown.

Scoring criteria:
- 5: Covers happy path + edge cases, validates response schema, handles errors, meaningful assertions
- 4: Good coverage, validates response body, handles main error cases
- 3: Tests basic functionality, some assertions, missing edge cases
- 2: Minimal test, only checks status code, no body validation
- 1: Trivial or broken test, hardcoded values, no real validation

Provide specific, actionable suggestions for improvement.`
  }

  buildPrompt(input: TestQualityInput): string {
    return `Rate this API test for quality.

<endpoint>${input.endpointMethod} ${input.endpointPath}</endpoint>
<requirement>${input.requirementTitle ?? 'No linked requirement'}</requirement>
<test_code>
${input.testCode}
</test_code>

Return: { "score": 1-5, "reasoning": "...", "suggestions": ["...", "..."] }`
  }
}
