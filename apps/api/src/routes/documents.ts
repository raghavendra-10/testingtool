import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { getDb, projects, sourceDocuments } from '@speclyn/db'
import { clerkAuth } from '../middleware/clerk-auth.js'
import type { AuthenticatedRequest } from '../middleware/clerk-auth.js'
import { uploadToS3, getDownloadUrl } from '../lib/s3.js'
import { Queue } from 'bullmq'
import { getRedisConnection } from '@speclyn/shared-types'
import { validatePublicUrl } from '../lib/url-validator.js'

const ALLOWED_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/json': 'json',
  'application/x-yaml': 'yaml',
  'text/yaml': 'yaml',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/x-markdown': 'md',
  'application/octet-stream': 'bin', // fallback for .md files some browsers send as octet-stream
}

const MAX_BYTES = 20 * 1024 * 1024 // 20 MB

let _queue: Queue | null = null
function getDocParserQueue(): Queue {
  if (_queue) return _queue
  _queue = new Queue('parse-document', { connection: getRedisConnection() })
  return _queue
}

export async function documentRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', clerkAuth)

  // POST /api/v1/projects/:projectId/documents
  app.post('/api/v1/projects/:projectId/documents', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }

    const db = getDb()
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const data = await req.file({ limits: { fileSize: MAX_BYTES } })
    if (!data) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'No file uploaded' } })

    const mimeType = data.mimetype
    const docType = ALLOWED_TYPES[mimeType]
    if (!docType) {
      return reply.code(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: `Unsupported file type: ${mimeType}. Allowed: PDF, DOCX, JSON, YAML` },
      })
    }

    const fileBuffer = await data.toBuffer()
    if (fileBuffer.length === 0) {
      return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'File is empty' } })
    }

    const s3Key = `projects/${projectId}/docs/${randomUUID()}-${data.filename}`
    await uploadToS3(s3Key, fileBuffer, mimeType)

    const [doc] = await db
      .insert(sourceDocuments)
      .values({ projectId, filename: data.filename, mimeType, sizeBytes: fileBuffer.length, s3Key, status: 'pending' })
      .returning()

    await getDocParserQueue().add(
      'parse',
      { documentId: doc!.id, projectId, s3Key, mimeType },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    )

    reply.code(201).send({ success: true, data: doc })
  })

  // GET /api/v1/projects/:projectId/documents
  app.get('/api/v1/projects/:projectId/documents', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }

    const db = getDb()
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const docs = await db
      .select()
      .from(sourceDocuments)
      .where(eq(sourceDocuments.projectId, projectId))

    reply.send({ success: true, data: docs })
  })

  // GET /api/v1/projects/:projectId/documents/:docId/download
  app.get('/api/v1/projects/:projectId/documents/:docId/download', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId, docId } = req.params as { projectId: string; docId: string }

    const db = getDb()
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const [doc] = await db
      .select()
      .from(sourceDocuments)
      .where(and(eq(sourceDocuments.id, docId), eq(sourceDocuments.projectId, projectId)))
    if (!doc) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const url = await getDownloadUrl(doc.s3Key)
    reply.send({ success: true, data: { url } })
  })

  // POST /api/v1/projects/:projectId/documents/import-url
  app.post('/api/v1/projects/:projectId/documents/import-url', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    const body = z.object({
      url: z.string().url(),
      type: z.enum(['swagger', 'postman', 'auto']).default('auto'),
    }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', issues: body.error.issues } })

    const db = getDb()
    const [project] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    // SSRF protection
    const validation = await validatePublicUrl(body.data.url)
    if (!validation.valid) {
      return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: validation.error } })
    }

    // Fetch URL content
    const response = await fetch(body.data.url, { signal: AbortSignal.timeout(30_000) })
    if (!response.ok) {
      return reply.code(400).send({ success: false, error: { code: 'FETCH_ERROR', message: `Failed to fetch URL: ${response.status}` } })
    }

    const contentType = response.headers.get('content-type') ?? 'application/json'
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length > MAX_BYTES) {
      return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Fetched content exceeds 20MB limit' } })
    }

    const ext = contentType.includes('yaml') ? 'yaml' : 'json'
    const mimeType = contentType.includes('yaml') ? 'application/x-yaml' : 'application/json'
    const filename = `url-import-${body.data.type}.${ext}`
    const s3Key = `projects/${projectId}/docs/${randomUUID()}-${filename}`
    await uploadToS3(s3Key, buffer, mimeType)

    const [doc] = await db.insert(sourceDocuments)
      .values({ projectId, filename, mimeType, sizeBytes: buffer.length, s3Key, status: 'pending' })
      .returning()

    await getDocParserQueue().add('parse', { documentId: doc!.id, projectId, s3Key, mimeType },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } })

    reply.code(201).send({ success: true, data: doc })
  })

  // POST /api/v1/projects/:projectId/documents/import-text
  app.post('/api/v1/projects/:projectId/documents/import-text', async (req, reply) => {
    const { userId } = req as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    const body = z.object({
      content: z.string().min(10).max(MAX_BYTES),
      name: z.string().min(1).max(255),
    }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', issues: body.error.issues } })

    const db = getDb()
    const [project] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } })

    const buffer = Buffer.from(body.data.content, 'utf-8')
    const filename = `${body.data.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.txt`
    const s3Key = `projects/${projectId}/docs/${randomUUID()}-${filename}`
    await uploadToS3(s3Key, buffer, 'text/plain')

    const [doc] = await db.insert(sourceDocuments)
      .values({ projectId, filename, mimeType: 'text/plain', sizeBytes: buffer.length, s3Key, status: 'pending' })
      .returning()

    await getDocParserQueue().add('parse', { documentId: doc!.id, projectId, s3Key, mimeType: 'text/plain' },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } })

    reply.code(201).send({ success: true, data: doc })
  })
}
