import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ParsedSkill } from '../types'

/** Bumps when the run-dir layout or grading contract changes; invalidates stale caches. */
export const HARNESS_SCHEMA_VERSION = 1

export function cacheRoot(env: Record<string, string | undefined> = process.env): string {
  if (env.SHAKESPII_CACHE_DIR) return env.SHAKESPII_CACHE_DIR
  if (env.XDG_CACHE_HOME) return join(env.XDG_CACHE_HOME, 'shakespii')
  return join(homedir(), '.cache', 'shakespii')
}

/**
 * sha256 over SKILL.md raw bytes plus every inventory file's (relPath, raw bytes),
 * in sorted relPath order. Reads bytes from disk — FileEntry.text is null for
 * binary and oversized files, so hashing it would miss same-size binary mutations.
 */
export function skillContentHash(skill: ParsedSkill): string {
  const h = createHash('sha256')
  h.update(readFileSync(join(skill.dir, 'SKILL.md')))
  const entries = [...skill.files].sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0))
  for (const f of entries) {
    h.update('\0')
    h.update(f.relPath)
    h.update('\0')
    h.update(readFileSync(join(skill.dir, f.relPath)))
  }
  return h.digest('hex')
}

export function runKey(input: { skillHash: string; evalId: number; model: string }): string {
  return createHash('sha256')
    .update(`${HARNESS_SCHEMA_VERSION}\n${input.skillHash}\n${input.evalId}\n${input.model}`)
    .digest('hex')
    .slice(0, 16)
}

const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

export function runDir(root: string, skillName: string, key: string): string {
  // Defense in depth: the deterministic stage already rejects unsafe names
  // before any run dir is composed; this guard is never expected to fire.
  if (!SAFE_SEGMENT.test(skillName)) throw new Error(`internal: unsafe skill name for run dir ("${skillName}")`)
  return join(root, 'runs', skillName, key)
}

/** A run is cache-hit iff grading.json exists under its runKey (M4b writes it). */
export function ensureRunDir(root: string, skillName: string, key: string): string {
  const dir = runDir(root, skillName, key)
  mkdirSync(dir, { recursive: true })
  return dir
}
