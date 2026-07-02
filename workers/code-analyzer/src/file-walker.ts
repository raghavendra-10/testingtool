import { readdirSync, statSync } from 'fs'
import { join } from 'path'

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'target', 'out',
  '.idea', '.vscode', '.gradle', '.mvn', '__pycache__',
  'vendor', 'bin', 'obj', '.next', 'coverage',
])

/**
 * Recursively walk a directory and return all files matching the given extensions.
 * Skips common non-source directories.
 */
export async function walkSourceFiles(dir: string, extensions: string[]): Promise<string[]> {
  const results: string[] = []

  function walk(currentDir: string, depth: number): void {
    if (depth > 15) return // safety limit

    let names: string[]
    try {
      names = readdirSync(currentDir)
    } catch {
      return
    }

    for (const name of names) {
      if (name.startsWith('.')) continue

      const fullPath = join(currentDir, name)

      let info
      try { info = statSync(fullPath) } catch { continue }

      if (info.isDirectory()) {
        if (SKIP_DIRS.has(name)) continue
        walk(fullPath, depth + 1)
      } else if (info.isFile()) {
        if (extensions.some(ext => name.endsWith(ext)) && info.size <= 200_000) {
          results.push(fullPath)
        }
      }
    }
  }

  walk(dir, 0)
  return results.sort()
}
