/**
 * Split large source files on declaration boundaries for AI analysis.
 * Each chunk ≤ targetLines, with a header comment showing surrounding context.
 */

const DECLARATION_PATTERNS = [
  /^(?:export\s+)?(?:abstract\s+)?class\s+/m,
  /^(?:export\s+)?(?:async\s+)?function\s+/m,
  /^(?:export\s+)?(?:const|let|var)\s+\w+\s*=/m,
  /^(?:export\s+)?interface\s+/m,
  /^(?:export\s+)?type\s+/m,
  /^(?:export\s+)?enum\s+/m,
  // Java/Kotlin
  /^(?:public|private|protected)?\s*(?:static\s+)?(?:abstract\s+)?(?:class|interface|enum)\s+/m,
  /^(?:public|private|protected)?\s*(?:static\s+)?(?:\w+\s+)+\w+\s*\(/m,
  // Python
  /^(?:class|def|async\s+def)\s+/m,
  // Go
  /^func\s+/m,
  /^type\s+\w+\s+struct/m,
]

interface Chunk {
  content: string
  startLine: number
  endLine: number
  header: string
}

export function chunkOnDeclarationBoundaries(
  content: string,
  filePath: string,
  targetLines: number = 400,
  overlapLines: number = 20,
): Chunk[] {
  const lines = content.split('\n')

  // Small files: return as single chunk
  if (lines.length <= targetLines + 50) {
    return [{
      content,
      startLine: 1,
      endLine: lines.length,
      header: `// FILE: ${filePath} — FULL FILE (${lines.length} lines)`,
    }]
  }

  // Find declaration boundaries
  const boundaries: number[] = [0]
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!
    if (DECLARATION_PATTERNS.some(p => p.test(line))) {
      boundaries.push(i)
    }
  }
  boundaries.push(lines.length)

  // Build chunks by grouping declarations up to targetLines
  const chunks: Chunk[] = []
  let chunkStart = 0

  // Extract imports/header (first 30 lines or until first declaration)
  const headerEnd = Math.min(boundaries[1] ?? 30, 30)
  const headerLines = lines.slice(0, headerEnd).join('\n')

  for (let bi = 0; bi < boundaries.length - 1; bi++) {
    const declStart = boundaries[bi]!
    let declEnd = boundaries[bi + 1]!

    // Accumulate declarations until target reached
    if (declEnd - chunkStart < targetLines && bi < boundaries.length - 2) {
      continue
    }

    // Build chunk
    const chunkLines = lines.slice(chunkStart, declEnd)
    const chunkNum = chunks.length + 1
    const totalChunks = Math.ceil(lines.length / targetLines)

    // Add overlap from previous chunk
    let chunkContent = ''
    if (chunkStart > 0 && chunkStart >= overlapLines) {
      const overlapContent = lines.slice(chunkStart - overlapLines, chunkStart).join('\n')
      chunkContent = `// --- overlap from previous chunk ---\n${overlapContent}\n// --- chunk content ---\n`
    }

    // Prepend header (imports) to first chunk
    if (chunkNum === 1) {
      chunkContent += chunkLines.join('\n')
    } else {
      chunkContent = `// FILE: ${filePath} — CHUNK ${chunkNum}/${totalChunks}\n${headerLines}\n\n${chunkContent}${chunkLines.join('\n')}`
    }

    chunks.push({
      content: chunkNum === 1 ? `// FILE: ${filePath} — CHUNK 1/${totalChunks}\n${chunkLines.join('\n')}` : chunkContent,
      startLine: chunkStart + 1,
      endLine: declEnd,
      header: `CHUNK ${chunkNum}/${totalChunks} (lines ${chunkStart + 1}-${declEnd})`,
    })

    chunkStart = declEnd
  }

  // Handle remaining lines
  if (chunkStart < lines.length) {
    const remaining = lines.slice(chunkStart)
    chunks.push({
      content: `// FILE: ${filePath} — CHUNK ${chunks.length + 1}/${chunks.length + 1}\n${headerLines}\n\n${remaining.join('\n')}`,
      startLine: chunkStart + 1,
      endLine: lines.length,
      header: `CHUNK ${chunks.length + 1} (lines ${chunkStart + 1}-${lines.length})`,
    })
  }

  return chunks.length > 0 ? chunks : [{
    content,
    startLine: 1,
    endLine: lines.length,
    header: `// FILE: ${filePath} — FULL FILE`,
  }]
}
