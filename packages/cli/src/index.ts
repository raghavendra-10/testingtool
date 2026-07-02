#!/usr/bin/env node

import { program } from 'commander'
import { EventSource } from 'eventsource'

const VERSION = '0.1.0'

interface RunResponse {
  success: boolean
  data: { id: string; status: string }
}

interface StreamTokenResponse {
  success: boolean
  data: { token: string }
}

interface StepEvent {
  type: string
  testName?: string
  status?: string
  durationMs?: number
  errorMessage?: string
  totalTests?: number
  message?: string
  passed?: number
  failed?: number
  coveragePercent?: number
}

function log(icon: string, msg: string) {
  process.stdout.write(`${icon} ${msg}\n`)
}

program
  .name('speclyn')
  .description('Speclyn CLI — AI-powered API testing')
  .version(VERSION)

program
  .command('run')
  .description('Run tests for a project')
  .requiredOption('--project <id>', 'Project ID')
  .requiredOption('--api-key <key>', 'API key (sk_live_...)')
  .option('--base-url <url>', 'Base URL to test against', 'http://localhost:3000')
  .option('--api <url>', 'Speclyn API URL', 'http://localhost:3001')
  .option('--threshold <n>', 'Minimum coverage % to pass', '0')
  .option('--json', 'Output results as JSON')
  .action(async (opts: {
    project: string; apiKey: string; baseUrl: string; api: string; threshold: string; json?: boolean
  }) => {
    const { project, apiKey, baseUrl, api, threshold, json } = opts
    const apiBase = api.replace(/\/$/, '')
    const headers = { 'X-API-Key': apiKey, 'Content-Type': 'application/json' }

    if (!json) log('🚀', `Starting test run for project ${project}`)
    if (!json) log('🔗', `Target: ${baseUrl}`)

    // 1. Create run
    let runId: string
    try {
      const res = await fetch(`${apiBase}/api/v1/projects/${project}/runs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ baseUrl }),
      })
      if (!res.ok) {
        const err = await res.text()
        console.error(`Failed to create run: ${res.status} ${err}`)
        process.exit(1)
      }
      const body = await res.json() as RunResponse
      runId = body.data.id
      if (!json) log('✅', `Run created: ${runId}`)
    } catch (err) {
      console.error(`Connection failed: ${err}`)
      process.exit(1)
    }

    // 2. Get stream token
    let token: string
    try {
      const res = await fetch(`${apiBase}/api/v1/projects/${project}/runs/${runId}/stream-token`, {
        method: 'POST',
        headers,
      })
      const body = await res.json() as StreamTokenResponse
      token = body.data.token
    } catch {
      console.error('Failed to get stream token')
      process.exit(1)
    }

    // 3. Stream events
    let passed = 0
    let failed = 0
    let totalTests = 0

    await new Promise<void>((resolve) => {
      const es = new EventSource(
        `${apiBase}/api/v1/projects/${project}/runs/${runId}/events?token=${token}`,
      )

      es.addEventListener('step', (e: MessageEvent) => {
        const event = JSON.parse(e.data as string) as StepEvent

        if (event.type === 'run_status') {
          if (!json) log('📊', `Status: ${event.status}`)
          if (event.totalTests) totalTests = event.totalTests
          return
        }

        if (event.type === 'step_started') {
          if (!json) log('⏳', event.testName ?? '')
          return
        }

        if (event.type === 'step_completed') {
          passed++
          if (!json) log('✅', `${event.testName} ${event.durationMs ? `(${event.durationMs}ms)` : ''}`)
          return
        }

        if (event.type === 'step_failed') {
          failed++
          if (!json) {
            log('❌', `${event.testName} ${event.durationMs ? `(${event.durationMs}ms)` : ''}`)
            if (event.errorMessage) log('  ', `  ${event.errorMessage.slice(0, 200)}`)
          }
          return
        }
      })

      es.addEventListener('done', () => {
        es.close()
        resolve()
      })

      es.onerror = () => {
        es.close()
        resolve()
      }
    })

    // 4. Fetch final run status
    const runRes = await fetch(`${apiBase}/api/v1/projects/${project}/runs/${runId}`, { headers })
    const runData = await runRes.json() as { success: boolean; data: { status: string; coveragePercent: number | null; passed: number; failed: number; totalTests: number } }
    const run = runData.data

    const coveragePercent = run.coveragePercent ?? 0
    const thresholdNum = parseInt(threshold, 10)
    const gatePass = coveragePercent >= thresholdNum

    if (json) {
      console.log(JSON.stringify({
        runId,
        status: run.status,
        totalTests: run.totalTests,
        passed: run.passed,
        failed: run.failed,
        coveragePercent,
        threshold: thresholdNum,
        gatePass,
      }))
    } else {
      console.log('')
      log('📋', `Results: ${run.passed} passed, ${run.failed} failed, ${run.totalTests} total`)
      log('📊', `Coverage: ${coveragePercent}%`)
      if (thresholdNum > 0) {
        log(gatePass ? '✅' : '❌', `Coverage gate: ${coveragePercent}% ${gatePass ? '>=' : '<'} ${thresholdNum}%`)
      }
      log(run.status === 'passed' ? '✅' : '❌', `Run ${run.status}`)
    }

    process.exit(run.failed > 0 || !gatePass ? 1 : 0)
  })

program.parse()
