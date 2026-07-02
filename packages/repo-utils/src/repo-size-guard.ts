const MAX_SIZE_MB = parseInt(process.env['REPO_MAX_SIZE_MB'] ?? '2048')

interface RepoSizeResult {
  allowed: boolean
  sizeMb: number
  maxMb: number
  message: string | null
}

/**
 * Check repo size via platform API before cloning.
 * Returns whether the repo is within the size limit.
 */
export async function checkRepoSize(
  platform: 'github' | 'bitbucket' | 'gitlab',
  repoUrl: string,
  accessToken: string,
): Promise<RepoSizeResult> {
  try {
    let sizeMb = 0

    if (platform === 'github') {
      // GitHub: GET /repos/{owner}/{repo} → size (KB)
      const match = repoUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/)
      if (!match) return { allowed: true, sizeMb: 0, maxMb: MAX_SIZE_MB, message: null }
      const [, owner, repo] = match

      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: { Authorization: `token ${accessToken}`, Accept: 'application/vnd.github.v3+json' },
      })
      if (!res.ok) return { allowed: true, sizeMb: 0, maxMb: MAX_SIZE_MB, message: null }
      const data = await res.json() as { size?: number }
      sizeMb = Math.round((data.size ?? 0) / 1024)

    } else if (platform === 'bitbucket') {
      // Bitbucket: GET /2.0/repositories/{workspace}/{slug} → size (bytes)
      const match = repoUrl.match(/bitbucket\.org[:/]([^/]+)\/([^/.]+)/)
      if (!match) return { allowed: true, sizeMb: 0, maxMb: MAX_SIZE_MB, message: null }
      const [, workspace, slug] = match

      const res = await fetch(`https://api.bitbucket.org/2.0/repositories/${workspace}/${slug}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) return { allowed: true, sizeMb: 0, maxMb: MAX_SIZE_MB, message: null }
      const data = await res.json() as { size?: number }
      sizeMb = Math.round((data.size ?? 0) / (1024 * 1024))

    } else {
      return { allowed: true, sizeMb: 0, maxMb: MAX_SIZE_MB, message: null }
    }

    if (sizeMb > MAX_SIZE_MB) {
      return {
        allowed: false,
        sizeMb,
        maxMb: MAX_SIZE_MB,
        message: `Repository exceeds the ${MAX_SIZE_MB}MB analysis limit (${sizeMb}MB). Contact support or exclude vendored directories via .speclynignore.`,
      }
    }

    return { allowed: true, sizeMb, maxMb: MAX_SIZE_MB, message: null }
  } catch {
    // If size check fails, allow clone to proceed
    return { allowed: true, sizeMb: 0, maxMb: MAX_SIZE_MB, message: null }
  }
}
