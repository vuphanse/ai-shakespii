import { expect, test } from 'bun:test'
import { join } from 'node:path'

const CLI = join(import.meta.dir, '../../src/cli/index.ts')
const FIXTURES = join(import.meta.dir, '../fixtures/corpus')

test('root-is-a-skill exits 2 with the contract message', () => {
  const r = Bun.spawnSync(['bun', CLI, 'lint', join(import.meta.dir, '../fixtures/minimal-pass'), '--corpus'])
  expect(r.exitCode).toBe(2)
  expect(r.stderr.toString()).toContain('target is a single skill; drop --corpus or point at its parent directory')
})

test('missing root exits 2', () => {
  const r = Bun.spawnSync(['bun', CLI, 'lint', join(FIXTURES, 'nope'), '--corpus'])
  expect(r.exitCode).toBe(2)
  expect(r.stderr.toString()).toContain('not a directory:')
})

test('skipped directories are reported in JSON; stray files are not', () => {
  const r = Bun.spawnSync(['bun', CLI, 'lint', join(FIXTURES, 'with-skipped'), '--corpus', '--json'])
  expect(r.exitCode).toBe(0)
  const rep = JSON.parse(r.stdout.toString())
  expect(rep.skipped).toHaveLength(1)
  expect(rep.skipped[0].reason).toBe('no SKILL.md')
  expect(rep.skipped[0].dir.endsWith('notes')).toBe(true)
  expect(rep.summary).toEqual({ skills: 1, skipped: 1, errors: 0, warnings: 1 })
})

test('a broken skill still prints the full report but exits 2', () => {
  const r = Bun.spawnSync(['bun', CLI, 'lint', join(FIXTURES, 'with-broken'), '--corpus', '--json'])
  expect(r.exitCode).toBe(2)
  const rep = JSON.parse(r.stdout.toString())
  expect(rep.skills).toHaveLength(2)
  const broken = rep.skills.find((s: { runError?: string }) => s.runError !== undefined)
  expect(typeof broken.runError).toBe('string')
})

test('pretty corpus output names partners and prints the summary line', () => {
  const r = Bun.spawnSync(['bun', CLI, 'lint', join(FIXTURES, 'clone-pair'), '--corpus'])
  expect(r.exitCode).toBe(0) // XS findings are warn — they never flip the exit code
  const out = r.stdout.toString()
  expect(out).toContain('[with: corpus-clone-b]')
  expect(out).toContain('2 skills linted, 0 skipped · 0 errors, 4 warnings (of which 2 corpus-level)')
})

test('single-skill JSON v1 is byte-stable without the new flags', () => {
  const r = Bun.spawnSync(['bun', CLI, 'lint', join(import.meta.dir, '../fixtures/minimal-pass'), '--json'])
  expect(r.exitCode).toBe(0)
  const rep = JSON.parse(r.stdout.toString())
  expect(Object.keys(rep).sort()).toEqual(['findings', 'profile', 'skill', 'summary', 'version'])
  expect(rep.version).toBe(1)
})
