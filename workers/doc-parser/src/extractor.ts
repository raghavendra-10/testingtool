import pdfParse from 'pdf-parse'
import mammoth from 'mammoth'
import yaml from 'js-yaml'

/**
 * Extracts raw text from a document buffer based on MIME type.
 * For OpenAPI (JSON/YAML), returns pretty-printed JSON for better AI parsing.
 */
export async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  switch (mimeType) {
    case 'application/pdf': {
      const result = await pdfParse(buffer)
      return result.text
    }

    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
      const result = await mammoth.extractRawText({ buffer })
      return result.value
    }

    case 'application/json': {
      const parsed = JSON.parse(buffer.toString('utf-8'))
      return JSON.stringify(parsed, null, 2)
    }

    case 'application/x-yaml':
    case 'text/yaml': {
      // Parse YAML then convert to JSON string for consistent AI input
      const parsed = yaml.load(buffer.toString('utf-8'))
      return JSON.stringify(parsed, null, 2)
    }

    case 'text/plain':
    case 'text/markdown':
    case 'text/x-markdown':
    case 'application/octet-stream': // fallback for .md files some browsers send
    default:
      return buffer.toString('utf-8')
  }
}

/** Truncates text to fit within Bedrock context window (leaving room for prompt + output) */
export function truncateForContext(text: string, maxChars = 80_000): string {
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars) + '\n\n[...document truncated for length...]'
}
