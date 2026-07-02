import { execa } from 'execa'
import { mkdtemp, rm, stat } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

export interface CloneOptions {
  authUrl: string
  branch: string
  timeoutMs?: number
  useLargeRepoPipeline?: boolean
}

export interface CloneResult {
  dir: string
  actualBranch: string
  cloneMode: 'blobless' | 'shallow'
}

const DEFAULT_TIMEOUT = 120_000
const LARGE_REPO_TIMEOUT = 300_000

/**
 * Clone a repository with either blobless partial clone (large repos)
 * or shallow clone (default). Feature-flagged via useLargeRepoPipeline.
 */
export async function smartClone(opts: CloneOptions): Promise<CloneResult> {
  const useLarge = opts.useLargeRepoPipeline ?? process.env['LARGE_REPO_PIPELINE'] === 'true'
  const timeout = opts.timeoutMs ?? (useLarge ? LARGE_REPO_TIMEOUT : DEFAULT_TIMEOUT)

  const tempDir = await mkdtemp(join(tmpdir(), 'speclyn-repo-'))

  const cloneArgs = useLarge
    ? ['clone', '--filter=blob:none', '--sparse', '--branch', opts.branch, opts.authUrl, tempDir]
    : ['clone', '--depth', '1', '--branch', opts.branch, opts.authUrl, tempDir]

  const cloneMode = useLarge ? 'blobless' as const : 'shallow' as const

  try {
    await execa('git', cloneArgs, {
      timeout,
      env: { GIT_TERMINAL_PROMPT: '0' },
    })
  } catch (cloneErr) {
    const msg = String(cloneErr)
    const isBranchMissing = msg.includes('Remote branch') || msg.includes('not found in upstream') || msg.includes('Could not find remote branch')
    if (!isBranchMissing) {
      await rm(tempDir, { recursive: true, force: true })
      throw cloneErr
    }

    // Fallback: clone default branch
    console.warn(`[repo-utils] Branch '${opts.branch}' not found — cloning default branch`)
    await rm(tempDir, { recursive: true, force: true })

    const fallbackArgs = useLarge
      ? ['clone', '--filter=blob:none', '--sparse', opts.authUrl, tempDir]
      : ['clone', '--depth', '1', opts.authUrl, tempDir]

    await execa('git', fallbackArgs, {
      timeout,
      env: { GIT_TERMINAL_PROMPT: '0' },
    })
  }

  // Detect actual branch
  const { stdout: actualBranch } = await execa('git', ['-C', tempDir, 'rev-parse', '--abbrev-ref', 'HEAD'])

  return {
    dir: tempDir,
    actualBranch: actualBranch.trim(),
    cloneMode,
  }
}
