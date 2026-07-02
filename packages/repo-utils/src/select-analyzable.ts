import type { RepoFile } from './file-discovery.js'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

export type FileCategory =
  | 'route_candidate' | 'model' | 'middleware' | 'config' | 'test' | 'migration' | 'other'

export interface SelectedFile extends RepoFile {
  category: FileCategory
  language: string | null
}

const SKIP_DIRS = new Set([
  'node_modules', 'vendor', 'dist', 'build', 'out', '.next', 'coverage',
  '__snapshots__', '.git', '.idea', '.vscode', '__pycache__', 'target',
  '.gradle', '.mvn', 'bin', 'obj',
])

const SKIP_EXTENSIONS = new Set([
  '.min.js', '.min.css', '.map', '.lock', '.svg', '.png', '.jpg', '.jpeg',
  '.gif', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.mp4', '.mp3',
  '.pdf', '.zip', '.gz', '.tar', '.d.ts',
])

const ROUTE_PATTERNS = [
  /routes?\//i, /controllers?\//i, /handlers?\//i, /pages?\//i,
  /app\/.*route\.(ts|js)$/i, /app\/.*page\.(tsx|jsx)$/i,
  /Controller\.(java|kt)$/i, /views?\.(py)$/i, /urls\.py$/i,
]

const TEST_PATTERNS = [
  /\.(test|spec)\.(ts|tsx|js|jsx|py|java|go)$/i,
  /__tests__\//i, /test\//i, /tests\//i, /spec\//i,
]

const CONFIG_PATTERNS = [
  /\.(config|conf)\.(ts|js|json|yaml|yml|toml)$/i,
  /\.env/i, /package\.json$/i, /tsconfig/i, /webpack/i, /vite\.config/i,
  /pom\.xml$/i, /build\.gradle/i, /Cargo\.toml$/i,
]

const MIDDLEWARE_PATTERNS = [
  /middleware/i, /interceptor/i, /filter/i, /guard/i,
]

const MODEL_PATTERNS = [
  /models?\//i, /entities?\//i, /schemas?\//i, /types?\//i,
  /dto/i, /Entity\.(java|kt)$/i,
]

const MIGRATION_PATTERNS = [
  /migrations?\//i, /migrate/i, /flyway/i, /liquibase/i,
  /\.sql$/i,
]

const LANG_MAP: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript',
  '.java': 'java', '.kt': 'kotlin', '.kts': 'kotlin',
  '.py': 'python', '.go': 'go', '.rs': 'rust',
  '.cs': 'csharp', '.rb': 'ruby', '.php': 'php',
  '.sql': 'sql',
}

function getLanguage(path: string): string | null {
  const ext = path.slice(path.lastIndexOf('.'))
  return LANG_MAP[ext] ?? null
}

function categorize(path: string): FileCategory {
  if (TEST_PATTERNS.some(p => p.test(path))) return 'test'
  if (MIGRATION_PATTERNS.some(p => p.test(path))) return 'migration'
  if (CONFIG_PATTERNS.some(p => p.test(path))) return 'config'
  if (ROUTE_PATTERNS.some(p => p.test(path))) return 'route_candidate'
  if (MIDDLEWARE_PATTERNS.some(p => p.test(path))) return 'middleware'
  if (MODEL_PATTERNS.some(p => p.test(path))) return 'model'
  return 'other'
}

function shouldSkip(path: string): boolean {
  // Skip files in excluded directories
  const parts = path.split('/')
  if (parts.some(p => SKIP_DIRS.has(p))) return true

  // Skip by extension
  for (const ext of SKIP_EXTENSIONS) {
    if (path.endsWith(ext)) return true
  }

  // Skip files without a known language extension
  if (!getLanguage(path)) return true

  return false
}

/**
 * Filter and classify repo files for analysis.
 * Respects .speclynignore if present in the repo root.
 * Returns files sorted by priority: route_candidates first.
 */
export function selectAnalyzableFiles(files: RepoFile[], repoDir?: string): SelectedFile[] {
  // Load .speclynignore if present
  let ignoreFilter: ((path: string) => boolean) | null = null
  if (repoDir) {
    const ignorePath = join(repoDir, '.speclynignore')
    if (existsSync(ignorePath)) {
      try {
        const patterns = readFileSync(ignorePath, 'utf-8').split('\n').filter(l => l.trim() && !l.startsWith('#'))
        // Simple glob matching
        ignoreFilter = (path: string) => patterns.some(pattern => {
          const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'))
          return regex.test(path)
        })
      } catch {
        // ignore parse errors
      }
    }
  }

  const selected: SelectedFile[] = []

  for (const file of files) {
    if (shouldSkip(file.path)) continue
    if (ignoreFilter?.(file.path)) continue

    selected.push({
      ...file,
      category: categorize(file.path),
      language: getLanguage(file.path),
    })
  }

  // Sort by priority: route_candidates → middleware → models → other
  const PRIORITY: Record<FileCategory, number> = {
    route_candidate: 0, middleware: 1, model: 2, migration: 3,
    config: 4, other: 5, test: 6,
  }

  selected.sort((a, b) => PRIORITY[a.category] - PRIORITY[b.category])

  return selected
}
