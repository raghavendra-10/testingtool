import { z } from 'zod'
import { BaseAgent } from './base-agent.js'
import type { TestCase } from './test-planner-agent.js'

export interface TestGeneratorInput {
  projectId: string
  testId: string        // UUID from DB — must appear in describe() title
  endpointMethod: string
  endpointPath: string
  testCase: TestCase
  baseUrl: string       // placeholder: process.env['SPECLYN_BASE_URL']
  credentialIds: string[] // credential IDs available for this project
}

const GeneratedTestSchema = z.object({
  code: z.string().min(50),
  imports: z.array(z.string()),
})

export type GeneratedTestOutput = z.infer<typeof GeneratedTestSchema>

export class TestGeneratorAgent extends BaseAgent<TestGeneratorInput, GeneratedTestOutput> {
  readonly name = 'test-generator-agent'
  readonly outputSchema = GeneratedTestSchema

  getSystemPrompt(): string {
    return `You are a TypeScript API test generator for Speclyn.
Generate a single Vitest test file for one test case.

STRICT RULES — violations cause compile failure:
1. Import only from: vitest, axios, @speclyn/test-harness
2. Read base URL from: process.env['SPECLYN_BASE_URL']
3. Get credentials via: getCredential('<credentialId>') — NEVER hardcode tokens/passwords
4. Use buildAuthHeader(type, value) for auth headers
5. The describe() title MUST start with the testId exactly as given
6. At least one expect() assertion
7. No top-level await — wrap in async it() blocks
8. Return pure JSON — no markdown fences

The output JSON must have:
- "code": the complete TypeScript file content as a string
- "imports": array of npm package names imported (e.g. ["vitest","axios","@speclyn/test-harness"])`
  }

  buildPrompt(input: TestGeneratorInput): string {
    const credSnippet = input.credentialIds.length > 0
      ? `Available credential IDs: ${input.credentialIds.join(', ')}\nUse getCredential('<id>') to read them.`
      : 'No credentials configured — test unauthenticated endpoints only.'

    return `Generate a TypeScript Vitest test file for this test case.

<test_case>
Method: ${input.endpointMethod}
Path: ${input.endpointPath}
Test name: ${input.testCase.name}
Scenario: ${input.testCase.scenario}
Expected HTTP status: ${input.testCase.expectedStatus}
Description: ${input.testCase.description}
</test_case>

<context>
Test ID (use as describe prefix): ${input.testId}
Base URL variable: process.env['SPECLYN_BASE_URL']
${credSnippet}
</context>

Example structure:
\`\`\`
import { describe, it, expect } from 'vitest'
import axios from 'axios'
import { getCredential, buildAuthHeader } from '@speclyn/test-harness'

const BASE_URL = process.env['SPECLYN_BASE_URL']!

describe('${input.testId}: ${input.testCase.name}', () => {
  it('${input.testCase.description}', async () => {
    // ... test code
  })
})
\`\`\`

Return JSON: { "code": "<full file content>", "imports": ["vitest", "axios"] }`
  }
}
