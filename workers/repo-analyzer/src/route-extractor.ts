import { Project, SyntaxKind } from 'ts-morph'
import { readdirSync, statSync, existsSync } from 'fs'
import { join, relative } from 'path'

interface ExtractedRoute {
  method: string
  path: string
  summary: string
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']
const SKIP_DIRS = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '__tests__', 'test']

function getSourceFiles(dir: string, ext: string[]): string[] {
  const files: string[] = []
  function walk(d: string) {
    for (const entry of readdirSync(d)) {
      if (SKIP_DIRS.includes(entry)) continue
      const full = join(d, entry)
      try {
        const stat = statSync(full)
        if (stat.isDirectory()) walk(full)
        else if (ext.some(e => entry.endsWith(e))) files.push(full)
      } catch { /* skip unreadable */ }
    }
  }
  walk(dir)
  return files
}

/**
 * Extract Express/Fastify routes from TypeScript/JavaScript via AST
 */
export function extractRoutes(repoDir: string, framework: string): ExtractedRoute[] {
  if (framework === 'nextjs') return extractNextjsRoutes(repoDir)

  const sourceFiles = getSourceFiles(repoDir, ['.ts', '.js', '.mts', '.mjs'])
  if (sourceFiles.length === 0) return []

  const project = new Project({ compilerOptions: { allowJs: true, skipLibCheck: true } })
  const routes: ExtractedRoute[] = []

  // Only add files in common source directories (limit scope)
  const relevantFiles = sourceFiles
    .filter(f => !f.includes('node_modules'))
    .slice(0, 200) // safety limit

  for (const filePath of relevantFiles) {
    try {
      const sf = project.addSourceFileAtPath(filePath)

      // Find call expressions like: app.get('/path', ...) or router.post('/path', ...)
      sf.getDescendantsOfKind(SyntaxKind.CallExpression).forEach(call => {
        const expr = call.getExpression()
        if (expr.getKind() !== SyntaxKind.PropertyAccessExpression) return

        const propAccess = expr.asKindOrThrow(SyntaxKind.PropertyAccessExpression)
        const methodName = propAccess.getName().toLowerCase()

        if (!HTTP_METHODS.includes(methodName)) return

        const args = call.getArguments()
        if (args.length < 2) return

        const firstArg = args[0]!
        if (firstArg.getKind() !== SyntaxKind.StringLiteral) return

        const path = firstArg.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue()
        const relPath = relative(repoDir, filePath)

        routes.push({
          method: methodName.toUpperCase(),
          path,
          summary: `Discovered in ${relPath}`,
        })
      })

      project.removeSourceFile(sf)
    } catch { /* skip unparseable files */ }
  }

  return routes
}

/**
 * Extract Next.js App Router API routes from file structure
 */
function extractNextjsRoutes(repoDir: string): ExtractedRoute[] {
  const routes: ExtractedRoute[] = []

  // Look for app/api/**/route.ts files
  const apiDir = join(repoDir, 'app', 'api')
  const srcApiDir = join(repoDir, 'src', 'app', 'api')
  const targetDir = existsSync(srcApiDir) ? srcApiDir : existsSync(apiDir) ? apiDir : null
  if (!targetDir) return routes

  const routeFiles = getSourceFiles(targetDir, ['route.ts', 'route.js'])

  for (const filePath of routeFiles) {
    // Derive API path from directory structure
    const relDir = relative(targetDir, filePath).replace(/\/route\.(ts|js)$/, '')
    const apiPath = '/api/' + relDir.replace(/\[([^\]]+)\]/g, ':$1')

    // Check which HTTP method exports exist
    try {
      const content = require('fs').readFileSync(filePath, 'utf-8') as string
      for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
        if (content.includes(`export async function ${method}`) || content.includes(`export function ${method}`)) {
          routes.push({ method, path: apiPath, summary: `Next.js App Router` })
        }
      }
    } catch { /* skip */ }
  }

  return routes
}
