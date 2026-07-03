import { Worker } from 'bullmq'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { Redis } from 'ioredis'
import { getDb, sourceDocuments, requirements, endpoints, requirementDuplicates } from '@speclyn/db'
import { eq, sql } from 'drizzle-orm'
import { getRedisConnection, bootstrapWorker } from '@speclyn/shared-types'
import { extractText, truncateForContext } from './extractor.js'
import {
  RequirementsAgent,
  EndpointMatchAgent,
  isOpenApiSpec,
  isPostmanCollection,
  parseOpenApi,
  parsePostman,
  embedText,
  RequirementDeduplicationAgent,
} from '@speclyn/agents'

const redisUrl = process.env['REDIS_URL']
if (!redisUrl) throw new Error('REDIS_URL is not set')

const publisher = new Redis(redisUrl)

const s3 = new S3Client({
  region: process.env['AWS_REGION'] ?? 'us-west-2',
  credentials: {
    accessKeyId: process.env['AWS_ACCESS_KEY_ID']!,
    secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY']!,
  },
})

const BUCKET = process.env['S3_BUCKET']!

// Single agent instances — reused across jobs (stateless)
const requirementsAgent = new RequirementsAgent()
const endpointMatchAgent = new EndpointMatchAgent()
const dedupAgent = new RequirementDeduplicationAgent()

interface DocParserJob {
  documentId: string
  projectId: string
  s3Key: string
  mimeType: string
}

async function publishUpdate(projectId: string, payload: object): Promise<void> {
  await publisher.publish(`project:${projectId}:updates`, JSON.stringify(payload))
}

const worker = new Worker<DocParserJob>(
  'parse-document',
  async (job) => {
    const { documentId, projectId, s3Key, mimeType } = job.data
    const db = getDb()

    console.log(`[doc-parser] Processing document ${documentId}`)

    await db
      .update(sourceDocuments)
      .set({ status: 'processing' })
      .where(eq(sourceDocuments.id, documentId))

    await publishUpdate(projectId, {
      type: 'document.updated',
      data: { id: documentId, status: 'processing' },
    })

    try {
      // 1. Download from S3
      const s3Response = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: s3Key }))
      const chunks: Uint8Array[] = []
      for await (const chunk of s3Response.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk)
      }
      const buffer = Buffer.concat(chunks)
      const rawText = buffer.toString('utf-8')

      // 2. Route: OpenAPI spec or Postman collection → endpoint extraction
      //          Everything else → requirements extraction
      const isSpec =
        (mimeType === 'application/json' || mimeType === 'application/x-yaml' || mimeType === 'text/yaml') &&
        (isOpenApiSpec(rawText) || isPostmanCollection(rawText))

      if (isSpec) {
        await parseSpecDocument({ rawText, documentId, projectId, db })
      } else {
        await parseSrsDocument({ buffer, rawText, mimeType, documentId, projectId, db })
      }
    } catch (err) {
      console.error(`[doc-parser] Failed for document ${documentId}:`, err)
      await db
        .update(sourceDocuments)
        .set({ status: 'error', errorMessage: String(err) })
        .where(eq(sourceDocuments.id, documentId))

      await publishUpdate(projectId, {
        type: 'document.updated',
        data: { id: documentId, status: 'error' },
      })
      throw err
    }
  },
  {
    connection: getRedisConnection(),
    concurrency: 2,
  },
)

// ─── OpenAPI / Postman path ───────────────────────────────────────────────────

async function parseSpecDocument(opts: {
  rawText: string
  documentId: string
  projectId: string
  db: ReturnType<typeof getDb>
}): Promise<void> {
  const { rawText, documentId, projectId, db } = opts

  const parsed = isOpenApiSpec(rawText)
    ? parseOpenApi(rawText)
    : parsePostman(rawText)

  const source = isOpenApiSpec(rawText) ? 'openapi' : 'postman'
  console.log(`[doc-parser] Parsed ${parsed.length} endpoints from ${source} spec`)

  if (parsed.length > 0) {
    await db
      .insert(endpoints)
      .values(
        parsed.map((e) => ({
          projectId,
          method:      e.method,
          path:        e.path,
          summary:     e.summary,
          source,
          requestBody: e.requestBody,
          responses:   e.responses,
        })),
      )
      .onConflictDoNothing()

    // AI: match endpoints → requirements by module (best-effort, non-fatal)
    await matchEndpointsToRequirements(projectId, db)
  }

  await db
    .update(sourceDocuments)
    .set({ status: 'done', requirementCount: parsed.length, processedAt: new Date() })
    .where(eq(sourceDocuments.id, documentId))

  await publishUpdate(projectId, {
    type: 'document.updated',
    data: { id: documentId, status: 'done', requirementCount: parsed.length },
  })
  await publishUpdate(projectId, { type: 'endpoints.updated' })

  console.log(`[doc-parser] Done — ${parsed.length} endpoints saved`)
}

// ─── SRS / requirements path ──────────────────────────────────────────────────

async function parseSrsDocument(opts: {
  buffer: Buffer
  rawText: string
  mimeType: string
  documentId: string
  projectId: string
  db: ReturnType<typeof getDb>
}): Promise<void> {
  const { buffer, mimeType, documentId, projectId, db } = opts

  const rawExtracted = await extractText(buffer, mimeType)
  const text = truncateForContext(rawExtracted)
  console.log(`[doc-parser] Extracted ${rawExtracted.length} chars, sending to Bedrock...`)

  const extracted = await requirementsAgent.extractRequirements({
    text,
    projectId,
    documentId,
  })
  console.log(`[doc-parser] Extracted ${extracted.length} requirements`)

  if (extracted.length > 0) {
    await db
      .insert(requirements)
      .values(
        extracted.map((r) => ({
          projectId,
          sourceDocumentId: documentId,
          externalId:   r.externalId,
          title:        r.title,
          description:  r.description,
          type:         r.type,
          module:       r.module ?? '',
          priority:     r.priority,
          sourceSection: r.sourceSection,
          confidenceScore: r.confidenceScore,
          status: 'active' as const,
        })),
      )
      .onConflictDoNothing()
  }

  // Generate embeddings for semantic search (non-fatal)
  try {
    const allReqs = await db.select({ id: requirements.id, title: requirements.title, description: requirements.description })
      .from(requirements)
      .where(eq(requirements.projectId, projectId))

    let embedded = 0
    for (const req of allReqs) {
      const text = `${req.title}${req.description ? '. ' + req.description : ''}`
      const vector = await embedText(text)
      const vectorStr = `[${vector.join(',')}]`
      await db.execute(sql`UPDATE requirements SET embedding = ${vectorStr}::vector WHERE id = ${req.id}`)
      embedded++
    }
    console.log(`[doc-parser] Embedded ${embedded} requirements`)

    // Deduplication: find pairs with >0.85 cosine similarity
    const dupPairs = await db.execute(sql`
      SELECT a.id AS a_id, a.title AS a_title, a.description AS a_desc,
             b.id AS b_id, b.title AS b_title, b.description AS b_desc,
             1 - (a.embedding <=> b.embedding) AS similarity
      FROM requirements a
      JOIN requirements b ON a.project_id = b.project_id AND a.id < b.id
      WHERE a.project_id = ${projectId}
        AND a.embedding IS NOT NULL AND b.embedding IS NOT NULL
        AND 1 - (a.embedding <=> b.embedding) > 0.85
      ORDER BY similarity DESC
      LIMIT 20
    `)

    if (dupPairs.rows.length > 0) {
      console.log(`[doc-parser] Found ${dupPairs.rows.length} potential duplicates, classifying...`)
      for (const pair of dupPairs.rows) {
        const row = pair as Record<string, unknown>
        const result = await dedupAgent.run({
          projectId,
          reqA: { id: row['a_id'] as string, title: row['a_title'] as string, description: row['a_desc'] as string | null },
          reqB: { id: row['b_id'] as string, title: row['b_title'] as string, description: row['b_desc'] as string | null },
          similarity: row['similarity'] as number,
        }, projectId)

        if (result.success && result.data) {
          await db.insert(requirementDuplicates).values({
            projectId,
            requirementAId: row['a_id'] as string,
            requirementBId: row['b_id'] as string,
            similarity: row['similarity'] as number,
            isDuplicate: String(result.data.isDuplicate),
            explanation: result.data.explanation,
            suggestedAction: result.data.suggestedAction,
          }).onConflictDoNothing()
        }
      }
      console.log(`[doc-parser] Deduplication complete`)
    }
  } catch (err) {
    console.warn('[doc-parser] Embedding/dedup failed (non-fatal):', err)
  }

  await db
    .update(sourceDocuments)
    .set({ status: 'done', requirementCount: extracted.length, processedAt: new Date() })
    .where(eq(sourceDocuments.id, documentId))

  await publishUpdate(projectId, {
    type: 'document.updated',
    data: { id: documentId, status: 'done', requirementCount: extracted.length },
  })
  await publishUpdate(projectId, { type: 'requirements.updated' })

  console.log(`[doc-parser] Done — ${extracted.length} requirements saved`)
}

// ─── Endpoint ↔ requirement matching (AI, best-effort) ───────────────────────

async function matchEndpointsToRequirements(
  projectId: string,
  db: ReturnType<typeof getDb>,
): Promise<void> {
  try {
    const [allEndpoints, allRequirements] = await Promise.all([
      db.select().from(endpoints).where(eq(endpoints.projectId, projectId)),
      db.select().from(requirements).where(eq(requirements.projectId, projectId)),
    ])

    if (allEndpoints.length === 0 || allRequirements.length === 0) return

    const result = await endpointMatchAgent.run(
      {
        projectId,
        endpoints: allEndpoints.map((e) => ({
          id: e.id, method: e.method, path: e.path, summary: e.summary ?? '',
        })),
        requirements: allRequirements.map((r) => ({
          id: r.id, title: r.title, module: r.module ?? '', type: r.type ?? 'functional',
        })),
      },
      projectId,
    )

    if (!result.success || !result.data) return

    // Store matched module tags back onto endpoints (non-fatal if fails)
    // For now, just log — full coverage_links come in Slice 3
    console.log(`[doc-parser] Matched ${result.data.matches.length} endpoint-requirement links`)
  } catch (err) {
    // Non-fatal — matching is best-effort
    console.warn('[doc-parser] Endpoint matching failed (non-fatal):', err)
  }
}

// ─── Worker lifecycle ─────────────────────────────────────────────────────────

worker.on('completed', (job) => console.log(`[doc-parser] Job ${job.id} completed`))
worker.on('failed', (job, err) => console.error(`[doc-parser] Job ${job?.id} failed:`, err.message))

console.log('[doc-parser] Worker started, waiting for jobs...')

process.on('SIGTERM', async () => {
  await worker.close()
  await publisher.quit()
  process.exit(0)
})
