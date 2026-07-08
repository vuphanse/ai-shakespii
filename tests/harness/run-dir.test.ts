import { expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseSkill } from '../../src/lib/parser'
import {
  HARNESS_SCHEMA_VERSION,
  cacheRoot,
  ensureRunDir,
  runDir,
  runKey,
  skillContentHash,
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

test('runDir layout and ensureRunDir creation', () => {
  const root = mkdtempSync(join(tmpdir(), 'shakespii-cache-'))
  const dir = runDir(root, 'demo', 'deadbeefdeadbeef')
  expect(dir).toBe(join(root, 'runs', 'demo', 'deadbeefdeadbeef'))
  expect(existsSync(dir)).toBe(false)
  expect(ensureRunDir(root, 'demo', 'deadbeefdeadbeef')).toBe(dir)
  expect(existsSync(dir)).toBe(true)
})
