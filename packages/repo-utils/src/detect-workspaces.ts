import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

export interface ServiceUnit {
  name: string
  rootPath: string
  framework: string | null
  language: string | null
}

/**
 * Detect monorepo workspaces and return service units.
 * Supports: pnpm, yarn, npm, turborepo, nx, lerna, maven, gradle, go.
 */
export function detectWorkspaces(repoDir: string): ServiceUnit[] {
  const services: ServiceUnit[] = []

  // pnpm workspaces
  const pnpmWs = tryReadYaml(join(repoDir, 'pnpm-workspace.yaml'))
  if (pnpmWs) {
    const packages = extractWorkspaceGlobs(pnpmWs)
    for (const pkg of resolveGlobs(repoDir, packages)) {
      services.push(pkg)
    }
    if (services.length > 0) return services
  }

  // npm/yarn workspaces (in package.json)
  const rootPkg = tryReadJson(join(repoDir, 'package.json'))
  if (rootPkg?.workspaces) {
    const ws = rootPkg.workspaces as string[] | { packages?: string[] } | undefined
    const globs: string[] = Array.isArray(ws) ? ws : (ws as { packages?: string[] })?.packages ?? []
    for (const pkg of resolveGlobs(repoDir, globs)) {
      services.push(pkg)
    }
    if (services.length > 0) return services
  }

  // Lerna
  const lerna = tryReadJson(join(repoDir, 'lerna.json'))
  if (lerna?.packages) {
    for (const pkg of resolveGlobs(repoDir, lerna.packages as string[])) {
      services.push(pkg)
    }
    if (services.length > 0) return services
  }

  // Maven multi-module
  const pom = tryRead(join(repoDir, 'pom.xml'))
  if (pom) {
    const modules = [...pom.matchAll(/<module>([^<]+)<\/module>/g)].map(m => m[1]!)
    for (const mod of modules) {
      services.push({ name: mod, rootPath: mod, framework: 'spring', language: 'java' })
    }
    if (services.length > 0) return services
  }

  // Gradle multi-project
  const settings = tryRead(join(repoDir, 'settings.gradle')) ?? tryRead(join(repoDir, 'settings.gradle.kts'))
  if (settings) {
    const includes = [...settings.matchAll(/include\s*\(?['"]([^'"]+)['"]\)?/g)].map(m => m[1]!.replace(':', '/'))
    for (const inc of includes) {
      services.push({ name: inc.split('/').pop() ?? inc, rootPath: inc, framework: null, language: 'java' })
    }
    if (services.length > 0) return services
  }

  // Go workspace
  const goWork = tryRead(join(repoDir, 'go.work'))
  if (goWork) {
    const uses = [...goWork.matchAll(/use\s+(\S+)/g)].map(m => m[1]!)
    for (const use of uses) {
      services.push({ name: use.split('/').pop() ?? use, rootPath: use, framework: null, language: 'go' })
    }
    if (services.length > 0) return services
  }

  return services
}

function tryRead(path: string): string | null {
  try { return existsSync(path) ? readFileSync(path, 'utf-8') : null } catch { return null }
}

function tryReadJson(path: string): Record<string, unknown> | null {
  const content = tryRead(path)
  if (!content) return null
  try { return JSON.parse(content) as Record<string, unknown> } catch { return null }
}

function tryReadYaml(path: string): string | null {
  return tryRead(path)
}

function extractWorkspaceGlobs(yamlContent: string): string[] {
  const globs: string[] = []
  for (const line of yamlContent.split('\n')) {
    const match = line.match(/^\s*-\s*['"]?([^'"#]+)['"]?/)
    if (match?.[1]) globs.push(match[1].trim())
  }
  return globs
}

function resolveGlobs(repoDir: string, globs: string[]): ServiceUnit[] {
  const services: ServiceUnit[] = []
  for (const glob of globs) {
    // Simple glob: "apps/*", "packages/*", "services/*"
    const base = glob.replace(/\/?\*.*$/, '')
    if (!base) continue

    const basePath = join(repoDir, base)
    if (!existsSync(basePath)) continue

    try {
      const { readdirSync } = require('fs') as typeof import('fs')
      const entries = readdirSync(basePath, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        if (entry.name.startsWith('.')) continue

        const svcPath = `${base}/${entry.name}`
        const pkgJson = tryReadJson(join(repoDir, svcPath, 'package.json'))
        const framework = detectFramework(pkgJson)

        services.push({
          name: (pkgJson?.name as string) ?? entry.name,
          rootPath: svcPath,
          framework,
          language: pkgJson ? 'typescript' : null,
        })
      }
    } catch {
      // directory read failed
    }
  }
  return services
}

function detectFramework(pkgJson: Record<string, unknown> | null): string | null {
  if (!pkgJson) return null
  const deps = { ...(pkgJson.dependencies as Record<string, string> | undefined), ...(pkgJson.devDependencies as Record<string, string> | undefined) }
  if (deps['next']) return 'nextjs'
  if (deps['express']) return 'express'
  if (deps['fastify']) return 'fastify'
  if (deps['@nestjs/core']) return 'nestjs'
  if (deps['koa']) return 'koa'
  if (deps['hono']) return 'hono'
  return null
}
