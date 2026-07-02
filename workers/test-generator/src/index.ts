import { Worker, Queue } from 'bullmq'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getDb, endpoints, requirements, generatedTests, coverageLinks, executionRuns, credentialReferences } from '@speclyn/db'
import { eq, inArray } from 'drizzle-orm'
import { getRedisConnection } from '@speclyn/shared-types'
import type { GenerateTestsJobPayload, ExecuteTestsJobPayload } from '@speclyn/shared-types'
import {
  TestPlannerAgent, TestGeneratorAgent,
  SecurityTestAgent, AuthFlowTestAgent, ContractTestAgent,
  MultiTenantTestAgent, HIPAAComplianceAgent,
} from '@speclyn/agents'
import type { SecurityTestOutput, MultiTenantTestOutput, HIPAAComplianceOutput } from '@speclyn/agents'
import IORedis from 'ioredis'

const s3 = new S3Client({
  region: process.env['AWS_REGION'] ?? 'us-west-2',
  credentials: {
    accessKeyId: process.env['AWS_ACCESS_KEY_ID']!,
    secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY']!,
  },
})
const BUCKET = process.env['S3_BUCKET']!

const plannerAgent   = new TestPlannerAgent()
const generatorAgent = new TestGeneratorAgent()
const securityAgent  = new SecurityTestAgent()
const authFlowAgent  = new AuthFlowTestAgent()
const contractAgent      = new ContractTestAgent()
const multiTenantAgent   = new MultiTenantTestAgent()
const hipaaAgent         = new HIPAAComplianceAgent()

function getExecuteQueue(): Queue {
  return new Queue('execute-api', { connection: getRedisConnection() })
}

function getSsePublisher(): IORedis {
  return new IORedis(process.env['REDIS_URL'] ?? 'redis://localhost:6379', { maxRetriesPerRequest: null })
}

async function emit(pub: IORedis, projectId: string, runId: string, event: object) {
  await pub.publish(`project:${projectId}:run:${runId}`, JSON.stringify(event))
}

// ─── Security test code builder ──────────────────────────────────────────────
// Generates Vitest code directly from a security test case (no extra LLM call).
function buildSecurityTestCode(
  testId: string,
  ep: { method: string; path: string; requestBody: string | null },
  sc: SecurityTestOutput['testCases'][0],
  baseUrl: string,
  credentialId: string | null,
): string {
  const credImport = credentialId ? `import { getCredential } from '@speclyn/test-harness'\n` : ''
  const authHeader = credentialId
    ? `'Authorization': \`Bearer \${getCredential('${credentialId}')}\`,`
    : ''

  const safePayload = sc.payload.replace(/`/g, "'").replace(/\\/g, '\\\\').slice(0, 120)
  const method = ep.method.toUpperCase()

  // Build fetch body/url based on injection point
  let fetchCode = ''
  if (sc.injectionPoint === 'body') {
    let bodyFields: Record<string, string> = { value: sc.payload }
    if (ep.requestBody) {
      try {
        const schema = JSON.parse(ep.requestBody)
        const props =
          schema?.properties ??
          schema?.content?.['application/json']?.schema?.properties ??
          {}
        for (const key of Object.keys(props)) {
          bodyFields[key] = sc.payload
        }
      } catch { /* use default */ }
    }
    fetchCode = `await fetch(\`\${BASE_URL}${ep.path}\`, {
      method: '${method}',
      headers: { 'Content-Type': 'application/json', ${authHeader} },
      body: JSON.stringify(${JSON.stringify(bodyFields)}),
    })`
  } else if (sc.injectionPoint === 'path') {
    const injPath = ep.path.replace(/:[^/]+/, encodeURIComponent(sc.payload.slice(0, 30)))
    fetchCode = `await fetch(\`\${BASE_URL}${injPath}\`, {
      method: '${method}',
      headers: { ${authHeader} },
    })`
  } else if (sc.injectionPoint === 'query') {
    fetchCode = `await fetch(\`\${BASE_URL}${ep.path}?q=\${encodeURIComponent('${safePayload}')}\`, {
      method: '${method}',
      headers: { ${authHeader} },
    })`
  } else {
    // header injection
    fetchCode = `await fetch(\`\${BASE_URL}${ep.path}\`, {
      method: '${method}',
      headers: { '${sc.category}': '${safePayload.slice(0, 50)}', ${authHeader} },
    })`
  }

  return `import { describe, it, expect } from 'vitest'
${credImport}
// [Security] ${sc.category} — Severity: ${sc.severity}
// Expected: ${sc.expectedBehavior}

const BASE_URL = process.env['SPECLYN_BASE_URL'] ?? '${baseUrl}'

describe('${testId}', () => {
  it('[Security] ${sc.name}', async () => {
    const res = ${fetchCode}

    // Server MUST NOT return 5xx on malicious input (indicates unhandled crash)
    expect(res.status, 'Server must not crash on malicious input').toBeLessThan(500)

    // If request succeeded (2xx/3xx), the payload must not be echoed back raw
    if (res.status < 400) {
      const body = await res.text()
      expect(body, 'Response must not reflect injected payload').not.toContain(\`${safePayload}\`)
    }
  })
})
`
}

// ─── Auth-flow test code builder ─────────────────────────────────────────────
import type { AuthFlowOutput } from '@speclyn/agents'

function buildAuthTestCode(
  testId: string,
  tc: AuthFlowOutput['testCases'][0],
  baseUrl: string,
): string {
  const stepLines = tc.steps.map((step, i) => {
    const hdrs = step.headers ? JSON.stringify(step.headers) : '{}'
    const assertLines = step.assertions.map(a => `    // ${a}`).join('\n')
    return `    // Step ${i + 1}: ${step.action}
    const res${i} = await fetch(\`\${BASE_URL}${step.path}\`, {
      method: '${step.method}',
      headers: ${hdrs},
    })
    expect(res${i}.status, '${step.action}').toBe(${step.expectedStatus})
${assertLines}`
  }).join('\n\n')

  return `import { describe, it, expect } from 'vitest'

// [Auth] ${tc.scenario}

const BASE_URL = process.env['SPECLYN_BASE_URL'] ?? '${baseUrl}'

describe('${testId}', () => {
  it('[Auth] ${tc.name}', async () => {
${stepLines}
  })
})
`
}

// ─── Worker ──────────────────────────────────────────────────────────────────
const worker = new Worker<GenerateTestsJobPayload>(
  'generate-tests',
  async (job) => {
    const { projectId, runId, endpointIds, baseUrl } = job.data
    const db  = getDb()
    const pub = getSsePublisher()

    try {
      await db.update(executionRuns)
        .set({ status: 'generating', startedAt: new Date(), lastHeartbeatAt: new Date() })
        .where(eq(executionRuns.id, runId))

      await emit(pub, projectId, runId, { type: 'run_status', status: 'generating' })

      const eps = await db.select().from(endpoints)
        .where(inArray(endpoints.id, endpointIds))

      const reqs = await db.select().from(requirements)
        .where(eq(requirements.projectId, projectId))

      const creds = await db.select({ id: credentialReferences.id })
        .from(credentialReferences)
        .where(eq(credentialReferences.projectId, projectId))
      const credentialIds = creds.map(c => c.id)

      const generatedTestIds: string[] = []

      // ── Phase 1: Functional tests (existing logic) ─────────────────────────
      for (const ep of eps) {
        const [currentRun] = await db.select({ status: executionRuns.status })
          .from(executionRuns).where(eq(executionRuns.id, runId))
        if (currentRun?.status === 'cancelled') {
          console.log(`[test-generator] Run ${runId} cancelled`)
          pub.disconnect()
          return
        }

        await db.update(executionRuns)
          .set({ lastHeartbeatAt: new Date() })
          .where(eq(executionRuns.id, runId))

        const epLabel = `${ep.method} ${ep.path}`
        await emit(pub, projectId, runId, { type: 'step_started', testName: `Planning ${epLabel}` })

        const planResult = await plannerAgent.run({
          projectId,
          endpoint: {
            method: ep.method, path: ep.path, summary: ep.summary ?? '',
            requestBody: ep.requestBody, responses: ep.responses,
          },
          requirements: reqs.map(r => ({
            id: r.id, title: r.title, type: r.type ?? 'functional', priority: r.priority,
          })),
        }, projectId)

        if (!planResult.success || !planResult.data) {
          console.error(`[test-generator] Planner failed for ${epLabel}:`, planResult.error)
          await emit(pub, projectId, runId, {
            type: 'step_failed', testName: `Planning ${epLabel}`, errorMessage: String(planResult.error),
          })
          continue
        }

        const planCount = planResult.data.testCases.length
        await emit(pub, projectId, runId, {
          type: 'step_completed', testName: `Planning ${epLabel}`,
          status: 'passed', durationMs: 0, meta: `${planCount} test cases planned`,
        })

        for (const testCase of planResult.data.testCases) {
          await emit(pub, projectId, runId, { type: 'step_started', testName: testCase.name })

          const [testRecord] = await db.insert(generatedTests).values({
            projectId, name: testCase.name, testType: 'api',
            dataLifecycle: testCase.dataLifecycle, status: 'draft', endpointId: ep.id,
          }).returning()
          if (!testRecord) continue

          const testId = testRecord.id

          const genResult = await generatorAgent.run({
            projectId, testId,
            endpointMethod: ep.method, endpointPath: ep.path,
            testCase, baseUrl, credentialIds,
          }, projectId)

          if (!genResult.success || !genResult.data) {
            console.warn(`[test-generator] Code gen failed for test ${testId}`)
            await emit(pub, projectId, runId, {
              type: 'step_failed', testName: testCase.name, errorMessage: 'Code generation failed',
            })
            continue
          }

          const code = genResult.data.code
          const hasDescribe = code.includes('describe(')
          const hasExpect   = code.includes('expect(')
          const hasHardcodedSecret = /Bearer\s+[A-Za-z0-9\-_]{20,}/.test(code) ||
            /api[_-]?key['":\s]+[A-Za-z0-9]{20,}/i.test(code)

          if (!hasDescribe || !hasExpect || hasHardcodedSecret) {
            await db.update(generatedTests)
              .set({ status: 'draft', compileError: 'Failed code validation: missing describe/expect or hardcoded secret' })
              .where(eq(generatedTests.id, testId))
            await emit(pub, projectId, runId, {
              type: 'step_failed', testName: testCase.name, errorMessage: 'Validation failed',
            })
            continue
          }

          const s3Key = `projects/${projectId}/tests/${testId}.test.ts`
          await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: s3Key, Body: code, ContentType: 'text/plain' }))

          await db.update(generatedTests)
            .set({ status: 'active', storageUrl: s3Key, codeSnapshot: code.slice(0, 2000) })
            .where(eq(generatedTests.id, testId))

          if (testCase.requirementIds.length > 0) {
            await db.insert(coverageLinks)
              .values(testCase.requirementIds.map(rId => ({ requirementId: rId, testId })))
              .onConflictDoNothing()
          }

          generatedTestIds.push(testId)
          await emit(pub, projectId, runId, { type: 'step_completed', testName: testCase.name, status: 'passed' })
          console.log(`[test-generator] Generated: ${testCase.name}`)
        }

        // ── Phase 2a: Security tests for mutation endpoints ────────────────
        if (['POST', 'PUT', 'PATCH'].includes(ep.method.toUpperCase()) && ep.requestBody) {
          await generateSecurityTests(
            db, pub, projectId, runId, ep, baseUrl, credentialIds, generatedTestIds, s3,
          )
        }

        // ── Phase 2b: Contract check for GET endpoints (probe + validate) ──
        if (ep.method.toUpperCase() === 'GET' && ep.responses) {
          await runContractCheck(pub, projectId, runId, ep, baseUrl)
        }
      }

      // ── Phase 3: Auth-flow tests (once per project if auth endpoints exist) ─
      const hasAuthEndpoints = eps.some(e =>
        ['POST', 'PUT', 'DELETE', 'PATCH'].includes(e.method.toUpperCase()),
      )
      const loginEndpoint = eps.find(e =>
        e.method.toUpperCase() === 'POST' &&
        (e.path.includes('login') || e.path.includes('auth') || e.path.includes('token')),
      )
      if (hasAuthEndpoints && loginEndpoint) {
        await generateAuthFlowTests(
          db, pub, projectId, runId, eps, loginEndpoint.path, baseUrl, generatedTestIds, s3,
        )
      }

      // ── Phase 4: Multi-tenant isolation tests ─────────────────────────────
      const hasResourceEndpoints = eps.some(e =>
        ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(e.method.toUpperCase()) &&
        (e.path.includes(':id') || e.path.includes('{id}')),
      )
      if (hasResourceEndpoints) {
        await generateMultiTenantTests(
          db, pub, projectId, runId, eps, baseUrl, generatedTestIds, s3,
        )
      }

      // ── Phase 5: HIPAA compliance tests ───────────────────────────────────
      await generateHIPAATests(
        db, pub, projectId, runId, eps, baseUrl, generatedTestIds, s3,
      )

      // ── Finalize ──────────────────────────────────────────────────────────
      await db.update(executionRuns)
        .set({ totalTests: generatedTestIds.length, lastHeartbeatAt: new Date() })
        .where(eq(executionRuns.id, runId))

      if (generatedTestIds.length === 0) {
        await db.update(executionRuns)
          .set({ status: 'failed', failureReason: 'No tests were generated', completedAt: new Date() })
          .where(eq(executionRuns.id, runId))
        await emit(pub, projectId, runId, { type: 'run_status', status: 'failed', message: 'No tests were generated' })
        pub.disconnect()
        return
      }

      await emit(pub, projectId, runId, { type: 'run_status', status: 'running', totalTests: generatedTestIds.length })

      await getExecuteQueue().add('execute', {
        projectId, runId, environmentId: '', testIds: generatedTestIds, workerType: 'api', ownerId: job.data.ownerId, baseUrl,
      } satisfies ExecuteTestsJobPayload, { attempts: 1 })

      pub.disconnect()
      console.log(`[test-generator] Done — ${generatedTestIds.length} tests queued for run ${runId}`)
    } catch (err) {
      await db.update(executionRuns)
        .set({ status: 'error', failureReason: String(err).slice(0, 1000), completedAt: new Date() })
        .where(eq(executionRuns.id, runId))
      await emit(pub, projectId, runId, { type: 'run_status', status: 'error', message: String(err).slice(0, 200) })
      pub.disconnect()
      throw err
    }
  },
  { connection: getRedisConnection(), concurrency: 1 },
)

// ─── Security test generation ─────────────────────────────────────────────────
async function generateSecurityTests(
  db: ReturnType<typeof getDb>,
  pub: IORedis,
  projectId: string,
  runId: string,
  ep: { id: string; method: string; path: string; requestBody: string | null },
  baseUrl: string,
  credentialIds: string[],
  generatedTestIds: string[],
  s3: S3Client,
) {
  const epLabel = `${ep.method} ${ep.path}`
  await emit(pub, projectId, runId, { type: 'step_started', testName: `[Security] Scanning ${epLabel}` })

  try {
    const result = await securityAgent.run({
      projectId,
      endpointMethod: ep.method,
      endpointPath: ep.path,
      requestBody: ep.requestBody,
      authType: credentialIds.length > 0 ? 'bearer' : null,
    }, projectId)

    if (!result.success || !result.data) {
      await emit(pub, projectId, runId, {
        type: 'step_failed', testName: `[Security] Scanning ${epLabel}`, errorMessage: 'Security agent failed',
      })
      return
    }

    const cases = result.data.testCases
    await emit(pub, projectId, runId, {
      type: 'step_completed', testName: `[Security] Scanning ${epLabel}`,
      status: 'passed', meta: `${cases.length} security tests planned`,
    })

    const credId = credentialIds[0] ?? null

    for (const sc of cases) {
      const testName = `[Security/${sc.severity.toUpperCase()}] ${sc.name}`
      await emit(pub, projectId, runId, { type: 'step_started', testName })

      const [testRecord] = await db.insert(generatedTests).values({
        projectId,
        name: testName,
        testType: 'api',
        dataLifecycle: 'read_only',
        status: 'draft',
        endpointId: ep.id,
      }).returning()
      if (!testRecord) continue

      const code = buildSecurityTestCode(testRecord.id, ep, sc, baseUrl, credId)
      const s3Key = `projects/${projectId}/tests/${testRecord.id}.test.ts`
      await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: s3Key, Body: code, ContentType: 'text/plain' }))

      await db.update(generatedTests)
        .set({ status: 'active', storageUrl: s3Key, codeSnapshot: code.slice(0, 2000) })
        .where(eq(generatedTests.id, testRecord.id))

      generatedTestIds.push(testRecord.id)
      await emit(pub, projectId, runId, { type: 'step_completed', testName, status: 'passed' })
      console.log(`[test-generator] Security test generated: ${testName}`)
    }
  } catch (err) {
    console.warn(`[test-generator] Security scan failed for ${epLabel} (non-fatal):`, String(err).slice(0, 200))
    await emit(pub, projectId, runId, {
      type: 'step_failed', testName: `[Security] Scanning ${epLabel}`,
      errorMessage: `Security scan error: ${String(err).slice(0, 150)}`,
    })
  }
}

// ─── Auth-flow test generation ────────────────────────────────────────────────
async function generateAuthFlowTests(
  db: ReturnType<typeof getDb>,
  pub: IORedis,
  projectId: string,
  runId: string,
  eps: Array<{ method: string; path: string }>,
  tokenEndpoint: string,
  baseUrl: string,
  generatedTestIds: string[],
  s3: S3Client,
) {
  await emit(pub, projectId, runId, { type: 'step_started', testName: '[Auth Flow] Planning auth scenarios' })

  try {
    const result = await authFlowAgent.run({
      projectId,
      authType: 'bearer_token',
      tokenEndpoint,
      endpoints: eps.map(e => ({
        method: e.method,
        path: e.path,
        requiresAuth: ['POST', 'PUT', 'PATCH', 'DELETE'].includes(e.method.toUpperCase()),
      })),
    }, projectId)

    if (!result.success || !result.data) {
      await emit(pub, projectId, runId, {
        type: 'step_failed', testName: '[Auth Flow] Planning auth scenarios', errorMessage: 'Auth flow agent failed',
      })
      return
    }

    const cases = result.data.testCases
    await emit(pub, projectId, runId, {
      type: 'step_completed', testName: '[Auth Flow] Planning auth scenarios',
      status: 'passed', meta: `${cases.length} auth flow tests planned`,
    })

    for (const tc of cases) {
      const testName = `[Auth] ${tc.name}`
      await emit(pub, projectId, runId, { type: 'step_started', testName })

      const [testRecord] = await db.insert(generatedTests).values({
        projectId,
        name: testName,
        testType: 'api',
        dataLifecycle: 'read_only',
        status: 'draft',
      }).returning()
      if (!testRecord) continue

      const code = buildAuthTestCode(testRecord.id, tc, baseUrl)
      const s3Key = `projects/${projectId}/tests/${testRecord.id}.test.ts`
      await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: s3Key, Body: code, ContentType: 'text/plain' }))

      await db.update(generatedTests)
        .set({ status: 'active', storageUrl: s3Key, codeSnapshot: code.slice(0, 2000) })
        .where(eq(generatedTests.id, testRecord.id))

      generatedTestIds.push(testRecord.id)
      await emit(pub, projectId, runId, { type: 'step_completed', testName, status: 'passed' })
      console.log(`[test-generator] Auth test generated: ${testName}`)
    }
  } catch (err) {
    console.warn('[test-generator] Auth flow generation failed (non-fatal):', String(err).slice(0, 200))
    await emit(pub, projectId, runId, {
      type: 'step_failed', testName: '[Auth Flow] Planning auth scenarios',
      errorMessage: `Auth flow error: ${String(err).slice(0, 150)}`,
    })
  }
}

// ─── Contract check (probe GET endpoint, validate schema) ─────────────────────
async function runContractCheck(
  pub: IORedis,
  projectId: string,
  runId: string,
  ep: { method: string; path: string; responses: string | null },
  baseUrl: string,
) {
  if (!ep.responses) return

  const epLabel = `${ep.method} ${ep.path}`
  const probeUrl = `${baseUrl}${ep.path.replace(/:[^/]+/g, '1')}` // replace :id with '1'

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(probeUrl, { signal: controller.signal })
    clearTimeout(timeout)

    if (!res.ok) return // Only validate 200 responses

    const actualBody = await res.text()
    let actualJson: unknown
    try { actualJson = JSON.parse(actualBody) } catch { return } // Not JSON, skip

    const result = await contractAgent.run({
      projectId,
      endpointMethod: ep.method,
      endpointPath: ep.path,
      openApiSchema: ep.responses,
      actualResponse: JSON.stringify(Array.isArray(actualJson) ? actualJson[0] : actualJson),
      statusCode: res.status,
    }, projectId)

    if (!result.success || !result.data) return

    const { violations, isCompliant, summary } = result.data
    const errors = violations.filter(v => v.severity === 'error')
    const warnings = violations.filter(v => v.severity === 'warning')

    if (!isCompliant || violations.length > 0) {
      await emit(pub, projectId, runId, {
        type: 'contract_check',
        endpoint: epLabel,
        isCompliant,
        summary,
        errors: errors.length,
        warnings: warnings.length,
        violations: violations.slice(0, 5),
      })
      console.log(`[test-generator] Contract check ${epLabel}: ${isCompliant ? 'OK' : 'VIOLATIONS'} — ${summary}`)
    }
  } catch (err: unknown) {
    if ((err as Error)?.name !== 'AbortError') {
      console.warn(`[test-generator] Contract probe for ${epLabel} failed (non-fatal):`, String(err).slice(0, 150))
    }
  }
}

// ─── Multi-tenant test code builder ──────────────────────────────────────────
function buildMultiTenantTestCode(
  testId: string,
  tc: MultiTenantTestOutput['testCases'][0],
  baseUrl: string,
): string {
  const stepLines = tc.steps.map((step, i) => {
    const hdrs = JSON.stringify(step.headers)
    const bodyLine = step.body ? `body: ${step.body},` : ''
    return `    // Step ${i + 1}: ${step.action}
    const res${i} = await fetch(\`\${BASE_URL}${step.path}\`, {
      method: '${step.method}',
      headers: ${hdrs},
      ${bodyLine}
    })
    expect(res${i}.status, '${step.assertion}').toBe(${step.expectedStatus})`
  }).join('\n\n')

  return `import { describe, it, expect } from 'vitest'

// [Multi-Tenant] ${tc.category} — Severity: ${tc.severity}
// Scenario: ${tc.scenario}

const BASE_URL = process.env['SPECLYN_BASE_URL'] ?? '${baseUrl}'

describe('${testId}', () => {
  it('[Multi-Tenant] ${tc.name}', async () => {
${stepLines}
  })
})
`
}

// ─── HIPAA compliance test code builder ──────────────────────────────────────
function buildHIPAATestCode(
  testId: string,
  tc: HIPAAComplianceOutput['testCases'][0],
  baseUrl: string,
): string {
  const stepLines = tc.steps.map((step, i) => {
    const hdrs = JSON.stringify(step.headers)
    const bodyLine = step.body ? `body: ${step.body},` : ''
    return `    // Step ${i + 1}: ${step.action}
    const res${i} = await fetch(\`\${BASE_URL}${step.path}\`, {
      method: '${step.method}',
      headers: ${hdrs},
      ${bodyLine}
    })
    expect(res${i}.status, '${step.assertion}').toBe(${step.expectedStatus})`
  }).join('\n\n')

  return `import { describe, it, expect } from 'vitest'

// [HIPAA] ${tc.category} — Rule: ${tc.hipaaRule}
// ${tc.description}

const BASE_URL = process.env['SPECLYN_BASE_URL'] ?? '${baseUrl}'

describe('${testId}', () => {
  it('[HIPAA] ${tc.name}', async () => {
${stepLines}
  })
})
`
}

// ─── Multi-tenant test generation ────────────────────────────────────────────
async function generateMultiTenantTests(
  db: ReturnType<typeof getDb>,
  pub: IORedis,
  projectId: string,
  runId: string,
  eps: Array<{ method: string; path: string; requestBody: string | null }>,
  baseUrl: string,
  generatedTestIds: string[],
  s3: S3Client,
) {
  await emit(pub, projectId, runId, { type: 'step_started', testName: '[Multi-Tenant] Planning isolation tests' })

  try {
    const result = await multiTenantAgent.run({
      projectId,
      endpoints: eps.map(e => ({
        method: e.method,
        path: e.path,
        authType: 'bearer',
        requestBody: e.requestBody,
      })),
      tenantIdField: 'organizationId',
    }, projectId)

    if (!result.success || !result.data) {
      await emit(pub, projectId, runId, {
        type: 'step_failed', testName: '[Multi-Tenant] Planning isolation tests',
        errorMessage: 'Multi-tenant agent failed',
      })
      return
    }

    const cases = result.data.testCases
    await emit(pub, projectId, runId, {
      type: 'step_completed', testName: '[Multi-Tenant] Planning isolation tests',
      status: 'passed', meta: `${cases.length} isolation tests planned`,
    })

    for (const tc of cases) {
      const testName = `[Multi-Tenant/${tc.severity.toUpperCase()}] ${tc.name}`
      await emit(pub, projectId, runId, { type: 'step_started', testName })

      const [testRecord] = await db.insert(generatedTests).values({
        projectId,
        name: testName,
        testType: 'api',
        dataLifecycle: 'read_only',
        status: 'draft',
      }).returning()
      if (!testRecord) continue

      const code = buildMultiTenantTestCode(testRecord.id, tc, baseUrl)
      const s3Key = `projects/${projectId}/tests/${testRecord.id}.test.ts`
      await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: s3Key, Body: code, ContentType: 'text/plain' }))

      await db.update(generatedTests)
        .set({ status: 'active', storageUrl: s3Key, codeSnapshot: code.slice(0, 2000) })
        .where(eq(generatedTests.id, testRecord.id))

      generatedTestIds.push(testRecord.id)
      await emit(pub, projectId, runId, { type: 'step_completed', testName, status: 'passed' })
      console.log(`[test-generator] Multi-tenant test generated: ${testName}`)
    }
  } catch (err) {
    console.warn('[test-generator] Multi-tenant test generation failed (non-fatal):', String(err).slice(0, 200))
    await emit(pub, projectId, runId, {
      type: 'step_failed', testName: '[Multi-Tenant] Planning isolation tests',
      errorMessage: `Multi-tenant error: ${String(err).slice(0, 150)}`,
    })
  }
}

// ─── HIPAA compliance test generation ────────────────────────────────────────
async function generateHIPAATests(
  db: ReturnType<typeof getDb>,
  pub: IORedis,
  projectId: string,
  runId: string,
  eps: Array<{ method: string; path: string; requestBody: string | null; responses: string | null }>,
  baseUrl: string,
  generatedTestIds: string[],
  s3: S3Client,
) {
  await emit(pub, projectId, runId, { type: 'step_started', testName: '[HIPAA] Planning compliance tests' })

  try {
    const result = await hipaaAgent.run({
      projectId,
      endpoints: eps.map(e => ({
        method: e.method,
        path: e.path,
        requestBody: e.requestBody,
        responses: e.responses,
      })),
      hasAuditLog: true,
    }, projectId)

    if (!result.success || !result.data) {
      await emit(pub, projectId, runId, {
        type: 'step_failed', testName: '[HIPAA] Planning compliance tests',
        errorMessage: 'HIPAA agent failed',
      })
      return
    }

    const cases = result.data.testCases
    await emit(pub, projectId, runId, {
      type: 'step_completed', testName: '[HIPAA] Planning compliance tests',
      status: 'passed', meta: `${cases.length} HIPAA tests planned, ${result.data.recommendations.length} recommendations`,
    })

    for (const tc of cases) {
      const testName = `[HIPAA/${tc.severity.toUpperCase()}] ${tc.name}`
      await emit(pub, projectId, runId, { type: 'step_started', testName })

      const [testRecord] = await db.insert(generatedTests).values({
        projectId,
        name: testName,
        testType: 'api',
        dataLifecycle: 'read_only',
        status: 'draft',
      }).returning()
      if (!testRecord) continue

      const code = buildHIPAATestCode(testRecord.id, tc, baseUrl)
      const s3Key = `projects/${projectId}/tests/${testRecord.id}.test.ts`
      await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: s3Key, Body: code, ContentType: 'text/plain' }))

      await db.update(generatedTests)
        .set({ status: 'active', storageUrl: s3Key, codeSnapshot: code.slice(0, 2000) })
        .where(eq(generatedTests.id, testRecord.id))

      generatedTestIds.push(testRecord.id)
      await emit(pub, projectId, runId, { type: 'step_completed', testName, status: 'passed' })
      console.log(`[test-generator] HIPAA test generated: ${testName}`)
    }
  } catch (err) {
    console.warn('[test-generator] HIPAA test generation failed (non-fatal):', String(err).slice(0, 200))
    await emit(pub, projectId, runId, {
      type: 'step_failed', testName: '[HIPAA] Planning compliance tests',
      errorMessage: `HIPAA error: ${String(err).slice(0, 150)}`,
    })
  }
}

worker.on('completed', job => console.log(`[test-generator] Job ${job.id} completed`))
worker.on('failed', (job, err) => console.error(`[test-generator] Job ${job?.id} failed:`, err.message))
console.log('[test-generator] Worker started')
process.on('SIGTERM', async () => { await worker.close(); process.exit(0) })
