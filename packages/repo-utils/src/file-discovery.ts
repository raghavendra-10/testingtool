import { execa } from 'execa'

export interface RepoFile {
  path: string
  blobSha: string
}

/**
 * Discover all files in a cloned repo using `git ls-tree`.
 * Returns file paths + blob SHAs without reading any file contents.
 * Works on both blobless and shallow clones.
 */
export async function discoverFiles(repoDir: string): Promise<RepoFile[]> {
  const { stdout } = await execa('git', ['ls-tree', '-r', 'HEAD'], {
    cwd: repoDir,
    timeout: 30_000,
  })

  if (!stdout.trim()) return []

  const files: RepoFile[] = []

  for (const line of stdout.split('\n')) {
    if (!line) continue
    // Format: <mode> <type> <sha>\t<path>
    const tabIdx = line.indexOf('\t')
    if (tabIdx === -1) continue

    const meta = line.slice(0, tabIdx)
    const path = line.slice(tabIdx + 1)

    const parts = meta.split(' ')
    if (parts.length < 3) continue

    const type = parts[1]
    const blobSha = parts[2]

    // Only include blobs (files), not trees (directories)
    if (type !== 'blob' || !blobSha) continue

    files.push({ path, blobSha })
  }

  return files
}
