import { getDb, repoFileIndex } from '@speclyn/db'
import { eq, sql, and } from 'drizzle-orm'
import { embedText } from './embeddings.js'

export interface SearchResult {
  filePath: string
  category: string
  summary: string | null
  symbols: string | null
  similarity: number
}

/**
 * Search the repo file index using semantic similarity.
 * Requires pgvector extension and embeddings in repo_file_index.
 *
 * Falls back to keyword search when embeddings are not available.
 */
export async function searchRepo(
  projectId: string,
  query: string,
  topK: number = 8,
): Promise<SearchResult[]> {
  const db = getDb()

  // Try semantic search first (requires pgvector + embeddings)
  try {
    const queryEmbedding = await embedText(query)
    if (queryEmbedding) {
      const vectorStr = `[${queryEmbedding.join(',')}]`
      const results = await db.execute(sql`
        SELECT file_path, category, summary, symbols,
               1 - (embedding <=> ${vectorStr}::vector) as similarity
        FROM repo_file_index
        WHERE project_id = ${projectId}
          AND embedding IS NOT NULL
        ORDER BY embedding <=> ${vectorStr}::vector
        LIMIT ${topK}
      `)

      if (Array.isArray(results) && results.length > 0) {
        return results.map((r: Record<string, unknown>) => ({
          filePath: String(r['file_path'] ?? ''),
          category: String(r['category'] ?? ''),
          summary: r['summary'] as string | null,
          symbols: r['symbols'] as string | null,
          similarity: Number(r['similarity'] ?? 0),
        }))
      }
    }
  } catch {
    // pgvector not available or embeddings not populated — fall back to keyword search
  }

  // Fallback: keyword search on file paths and symbols
  const keywords = query.toLowerCase().split(/\s+/).filter(Boolean)
  const allFiles = await db.select({
    filePath: repoFileIndex.filePath,
    category: repoFileIndex.category,
    summary: repoFileIndex.summary,
    symbols: repoFileIndex.symbols,
  }).from(repoFileIndex)
    .where(eq(repoFileIndex.projectId, projectId))

  const scored = allFiles.map(f => {
    let score = 0
    const searchable = `${f.filePath} ${f.symbols ?? ''} ${f.summary ?? ''}`.toLowerCase()
    for (const kw of keywords) {
      if (searchable.includes(kw)) score += 1
    }
    return { ...f, similarity: score / Math.max(keywords.length, 1) }
  }).filter(f => f.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK)

  return scored
}

/**
 * Lazily generate summaries for files that don't have them yet.
 * Called in batches during code analysis.
 */
export async function summarizeFiles(
  projectId: string,
  files: Array<{ filePath: string; content: string }>,
): Promise<void> {
  const db = getDb()

  for (const file of files) {
    // Simple extractive summary: first comment block + export names
    const lines = file.content.split('\n')
    const exports = lines
      .filter(l => l.startsWith('export '))
      .map(l => l.replace(/^export\s+(default\s+)?/, '').split(/[({=]/)[0]?.trim())
      .filter(Boolean)
      .slice(0, 10)

    const summary = exports.length > 0
      ? `Exports: ${exports.join(', ')}`
      : `${file.filePath.split('/').pop() ?? file.filePath} (${lines.length} lines)`

    await db.update(repoFileIndex)
      .set({ summary, updatedAt: new Date() })
      .where(and(eq(repoFileIndex.projectId, projectId), eq(repoFileIndex.filePath, file.filePath)))
      .catch(() => {}) // non-fatal
  }
}
