import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

interface StackInfo {
  runtime: string
  framework: string
  language: string
}

export function detectStack(repoDir: string): StackInfo {
  const result: StackInfo = { runtime: 'unknown', framework: 'unknown', language: 'unknown' }

  // Node.js / TypeScript / JavaScript
  const pkgPath = join(repoDir, 'package.json')
  if (existsSync(pkgPath)) {
    result.runtime = 'node'
    result.language = existsSync(join(repoDir, 'tsconfig.json')) ? 'typescript' : 'javascript'
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
      if (allDeps['express']) result.framework = 'express'
      else if (allDeps['fastify']) result.framework = 'fastify'
      else if (allDeps['@nestjs/core']) result.framework = 'nestjs'
      else if (allDeps['next']) result.framework = 'nextjs'
      else if (allDeps['koa']) result.framework = 'koa'
      else if (allDeps['hono']) result.framework = 'hono'
    } catch { /* skip */ }
    return result
  }

  // Python
  if (existsSync(join(repoDir, 'requirements.txt')) || existsSync(join(repoDir, 'pyproject.toml'))) {
    result.runtime = 'python'
    result.language = 'python'
    if (existsSync(join(repoDir, 'manage.py'))) result.framework = 'django'
    else result.framework = 'flask'
    return result
  }

  // Go
  if (existsSync(join(repoDir, 'go.mod'))) {
    result.runtime = 'go'
    result.language = 'go'
    result.framework = 'stdlib'
    return result
  }

  // Java
  if (existsSync(join(repoDir, 'pom.xml')) || existsSync(join(repoDir, 'build.gradle'))) {
    result.runtime = 'jvm'
    result.language = 'java'
    result.framework = 'spring'
    return result
  }

  // Rust
  if (existsSync(join(repoDir, 'Cargo.toml'))) {
    result.runtime = 'rust'
    result.language = 'rust'
    result.framework = 'actix'
    return result
  }

  return result
}
