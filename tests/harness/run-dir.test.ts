import { expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseSkill } from '../../src/lib/parser'
import {
  HARNESS_SCHEMA_VERSION,
  benchKey,
  cacheRoot,
  ensureRunDir,
  runDir,
  runKey,
  skillContentHash,
  suiteKey,
  triggerKey,
} from '../../src/lib/harness/run-dir'

const SKILL_MD = ['---', 'name: hash-me', 'description: "Use when hashing."', '---', '# hash-me', '', 'Body.'].join('\n')

function makeSkill(mutate?: (dir: string) => void): string {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-rundir-'))
  writeFileSync(join(dir, 'SKILL.md'), SKILL_MD)
  mkdirSync(join(dir, 'evals'), { recursive: true })
  writeFileSync(join(dir, 'evals/evals.json'), '{"skill_name":"hash-me","evals":[]}')
  writeFileSync(join(dir, 'blob.bin'), Buffer.from([0, 1, 2, 3]))
  mutate?.(dir)
  return dir
}

test('cacheRoot precedence: SHAKESPII_CACHE_DIR, then XDG_CACHE_HOME, then ~/.cache', () => {
  expect(cacheRoot({ SHAKESPII_CACHE_DIR: '/x', XDG_CACHE_HOME: '/y' })).toBe('/x')
  expect(cacheRoot({ XDG_CACHE_HOME: '/y' })).toBe('/y/shakespii')
  expect(cacheRoot({})).toEndWith('/.cache/shakespii')
})

test('hash is deterministic for identical content', () => {
  const a = skillContentHash(parseSkill(makeSkill()))
  const b = skillContentHash(parseSkill(makeSkill()))
  expect(a).toBe(b)
  expect(a).toMatch(/^[0-9a-f]{64}$/)
})

test('any text change changes the hash', () => {
  const base = skillContentHash(parseSkill(makeSkill()))
  const changed = skillContentHash(parseSkill(makeSkill(d => writeFileSync(join(d, 'evals/evals.json'), '{"skill_name":"hash-me","evals":[1]}'))))
  expect(changed).not.toBe(base)
})

test('SKILL.md change changes the hash', () => {
  const base = skillContentHash(parseSkill(makeSkill()))
  const changed = skillContentHash(parseSkill(makeSkill(d => writeFileSync(join(d, 'SKILL.md'), SKILL_MD + '\nMore.'))))
  expect(changed).not.toBe(base)
})

test('same-size binary mutation changes the hash', () => {
  const base = skillContentHash(parseSkill(makeSkill()))
  const changed = skillContentHash(parseSkill(makeSkill(d => writeFileSync(join(d, 'blob.bin'), Buffer.from([0, 1, 2, 4])))))
  expect(changed).not.toBe(base)
})

test('runKey: 16 hex chars, distinct per eval id, model, and schema version input', () => {
  const key = runKey({ skillHash: 'a'.repeat(64), evalId: 1, model: 'claude-sonnet-5' })
  expect(key).toMatch(/^[0-9a-f]{16}$/)
  expect(runKey({ skillHash: 'a'.repeat(64), evalId: 2, model: 'claude-sonnet-5' })).not.toBe(key)
  expect(runKey({ skillHash: 'a'.repeat(64), evalId: 1, model: 'claude-haiku-4-5' })).not.toBe(key)
  expect(HARNESS_SCHEMA_VERSION).toBe(1)
})

test('triggerKey: 16 hex chars, distinct per query, rep, and model input', () => {
  const key = triggerKey({ skillHash: 'a'.repeat(64), query: 'Query one.', rep: 1, model: 'claude-sonnet-5' })
  expect(key).toMatch(/^[0-9a-f]{16}$/)
  expect(triggerKey({ skillHash: 'a'.repeat(64), query: 'Query two.', rep: 1, model: 'claude-sonnet-5' })).not.toBe(key)
  expect(triggerKey({ skillHash: 'a'.repeat(64), query: 'Query one.', rep: 2, model: 'claude-sonnet-5' })).not.toBe(key)
  expect(triggerKey({ skillHash: 'a'.repeat(64), query: 'Query one.', rep: 1, model: 'claude-haiku-4-5' })).not.toBe(key)
  expect(triggerKey({ skillHash: 'b'.repeat(64), query: 'Query one.', rep: 1, model: 'claude-sonnet-5' })).not.toBe(key)
  // structurally distinct from runKey (trigger segment + hashed query), so a trigger
  // run never collides with a scenario run's cache entry even with matching inputs.
  expect(key).not.toBe(runKey({ skillHash: 'a'.repeat(64), evalId: 1, model: 'claude-sonnet-5' }))
})

test('runDir layout and ensureRunDir creation', () => {
  const root = mkdtempSync(join(tmpdir(), 'shakespii-cache-'))
  const dir = runDir(root, 'demo', 'deadbeefdeadbeef')
  expect(dir).toBe(join(root, 'runs', 'demo', 'deadbeefdeadbeef'))
  expect(existsSync(dir)).toBe(false)
  expect(ensureRunDir(root, 'demo', 'deadbeefdeadbeef')).toBe(dir)
  expect(existsSync(dir)).toBe(true)
})

test('runDir throws on separator-bearing or dot-only skill names (defense in depth)', () => {
  for (const bad of ['a/b', 'a\\b', '.', '..', '../x']) {
    expect(() => runDir('/tmp/root', bad, 'k'.repeat(16))).toThrow('internal: unsafe skill name for run dir')
  }
  expect(() => runDir('/tmp/root', 'my.skill_v2-beta', 'k'.repeat(16))).not.toThrow()
})

test('benchKey: 6 segments, structurally distinct from runKey, config/run/model sensitive', () => {
  const base = { skillHash: 'h'.repeat(64), evalId: 1, config: 'with_skill' as const, runNumber: 1, model: 'sonnet' }
  const k = benchKey(base)
  expect(k).toMatch(/^[0-9a-f]{16}$/)
  expect(benchKey({ ...base, config: 'without_skill' })).not.toBe(k)
  expect(benchKey({ ...base, runNumber: 2 })).not.toBe(k)
  expect(benchKey({ ...base, model: 'opus' })).not.toBe(k)
  expect(runKey({ skillHash: base.skillHash, evalId: 1, model: 'sonnet' })).not.toBe(k)
})

test('suiteKey varies by model and runs', () => {
  const base = { skillHash: 'h'.repeat(64), model: 'sonnet', runs: 3 }
  expect(suiteKey(base)).toMatch(/^[0-9a-f]{16}$/)
  expect(suiteKey({ ...base, runs: 5 })).not.toBe(suiteKey(base))
  expect(suiteKey({ ...base, model: 'opus' })).not.toBe(suiteKey(base))
})
