import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

export interface SkippedDir {
  dir: string
  reason: string
}

export interface Discovered {
  skillDirs: string[]
  skipped: SkippedDir[]
}

/**
 * One level deep, sorted, symlink-following (spec §1). A child directory with
 * a SKILL.md is a skill; one without is recorded as skipped; plain files are
 * ignored. A root that is itself a skill, or not a directory, throws — the
 * CLI turns that into exit 2.
 */
export function discoverSkills(root: string): Discovered {
  let rootIsDir: boolean
  try {
    rootIsDir = statSync(root).isDirectory()
  } catch {
    rootIsDir = false
  }
  if (!rootIsDir) throw new Error(`not a directory: ${root}`)
  if (existsSync(join(root, 'SKILL.md'))) {
    throw new Error('target is a single skill; drop --corpus or point at its parent directory')
  }
  const skillDirs: string[] = []
  const skipped: SkippedDir[] = []
  for (const name of readdirSync(root).sort()) {
    const dir = join(root, name)
    let isDir: boolean
    try {
      isDir = statSync(dir).isDirectory() // statSync follows symlinks
    } catch {
      continue // dangling symlink — nothing to lint
    }
    if (!isDir) continue
    if (existsSync(join(dir, 'SKILL.md'))) skillDirs.push(dir)
    else skipped.push({ dir, reason: 'no SKILL.md' })
  }
  return { skillDirs, skipped }
}
