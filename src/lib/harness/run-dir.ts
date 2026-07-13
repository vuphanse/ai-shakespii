import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ParsedSkill } from '../types'

/** Version of the OUTPUT documents (benchmark.json metadata, grading contract). Independent of RUN_CACHE_VERSION. */
export const HARNESS_SCHEMA_VERSION = 1

/**
 * Comparability epoch of cached runs. Bumps whenever executor session semantics
 * change (M5a: --setting-sources isolation), so runs recorded under older
 * semantics never replay as comparable. Old run dirs stay on disk, ignored.
 */
export const RUN_CACHE_VERSION = 2

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

/**
 * sha256 over frontmatter `name` + NUL + `description` — the only inputs that
 * influence skill routing in a trigger session: pre-invocation the model sees
 * only the picker entry built from them. Body, version, and eval files are
 * invisible until after the routing decision, so they must not invalidate
 * trigger caches. Callers run behind the trigger stage's deterministic-clean
 * precondition (both fields exist and are non-empty); throw rather than hash
 * emptiness if that ever breaks.
 */
export function skillRoutingHash(skill: ParsedSkill): string {
  const fm = skill.frontmatter.parsed
  const name = fm?.name
  const description = fm?.description
  if (typeof name !== 'string' || name.length === 0 || typeof description !== 'string' || description.length === 0) {
    throw new Error('internal: skillRoutingHash requires frontmatter name and description')
  }
  return createHash('sha256').update(name).update('\0').update(description).digest('hex')
}

export function runKey(input: { skillHash: string; evalId: number; model: string }): string {
  return createHash('sha256')
    .update(`${RUN_CACHE_VERSION}\n${input.skillHash}\n${input.evalId}\n${input.model}`)
    .digest('hex')
    .slice(0, 16)
}

const sha256hex = (s: string): string => createHash('sha256').update(s).digest('hex')

/** Stage tag 'trigger:nd' (name+description scoping, 2026-07-13) — disjoint by construction from the legacy full-content 'trigger' keyspace. */
export function triggerKey(input: { skillHash: string; query: string; rep: number; model: string }): string {
  return createHash('sha256')
    .update(`${RUN_CACHE_VERSION}\n${input.skillHash}\ntrigger:nd\n${sha256hex(input.query)}\n${input.rep}\n${input.model}`)
    .digest('hex')
    .slice(0, 16)
}

export function benchKey(input: {
  skillHash: string
  evalId: number
  config: 'with_skill' | 'without_skill'
  runNumber: number
  model: string
}): string {
  return createHash('sha256')
    .update(`${RUN_CACHE_VERSION}\n${input.skillHash}\n${input.evalId}\n${input.config}\n${input.runNumber}\n${input.model}`)
    .digest('hex')
    .slice(0, 16)
}

export function suiteKey(input: { skillHash: string; model: string; runs: number }): string {
  return createHash('sha256')
    .update(`${RUN_CACHE_VERSION}\n${input.skillHash}\nbench-suite\n${input.model}\n${input.runs}`)
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
