import { expect, test } from 'bun:test'
import { join } from 'node:path'

const CLI = join(import.meta.dir, '../../src/cli/index.ts')
const FIX = join(import.meta.dir, '../fixtures/config')
const CORPUS = join(import.meta.dir, '../fixtures/corpus')

const lint = (...args: string[]) => {
  const r = Bun.spawnSync(['bun', CLI, 'lint', ...args])
  return { exitCode: r.exitCode, stdout: r.stdout.toString(), stderr: r.stderr.toString() }
}

test('baseline: no-version-skill has exactly one FM05 error', () => {
  const r = lint(join(FIX, 'no-version-skill'), '--json')
  expect(r.exitCode).toBe(1)
  const rep = JSON.parse(r.stdout)
  expect(rep.summary).toEqual({ errors: 1, warnings: 0 })
  expect(rep.findings[0].ruleId).toBe('FM05')
})

test('--config demotes FM05 to warn and flips the exit code', () => {
  const r = lint(join(FIX, 'no-version-skill'), '--json', '--config', join(FIX, 'demote-fm05.yaml'))
  expect(r.exitCode).toBe(0)
  const rep = JSON.parse(r.stdout)
  expect(rep.summary).toEqual({ errors: 0, warnings: 1 })
  expect(rep.findings[0]).toMatchObject({ ruleId: 'FM05', severity: 'warn' })
})

test('--config off removes the rule entirely', () => {
  const r = lint(join(FIX, 'no-version-skill'), '--json', '--config', join(FIX, 'off-fm05.yaml'))
  expect(r.exitCode).toBe(0)
  const rep = JSON.parse(r.stdout)
  expect(rep.summary).toEqual({ errors: 0, warnings: 0 })
  expect(rep.findings).toEqual([])
})

test('--config option override merges over default options', () => {
  const r = lint(join(import.meta.dir, '../fixtures/minimal-pass'), '--json', '--config', join(FIX, 'fm03-options.yaml'))
  expect(r.exitCode).toBe(0)
  const rep = JSON.parse(r.stdout)
  expect(rep.summary).toEqual({ errors: 0, warnings: 1 })
  expect(rep.findings[0].ruleId).toBe('FM03')
})

test('--config alias replacement silences CT06 on mission-skill', () => {
  const before = lint(join(FIX, 'mission-skill'), '--json')
  expect(JSON.parse(before.stdout).summary).toEqual({ errors: 0, warnings: 1 })
  expect(JSON.parse(before.stdout).findings[0].ruleId).toBe('CT06')
  const after = lint(join(FIX, 'mission-skill'), '--json', '--config', join(FIX, 'intent-alias.yaml'))
  expect(after.exitCode).toBe(0)
  expect(JSON.parse(after.stdout).summary).toEqual({ errors: 0, warnings: 0 })
})

test('--config applies in corpus mode too', () => {
  const r = lint(join(CORPUS, 'clone-pair'), '--corpus', '--json', '--config', join(FIX, 'xs01-off.yaml'))
  expect(r.exitCode).toBe(0)
  const rep = JSON.parse(r.stdout)
  expect(rep.corpusFindings).toHaveLength(1)
  expect(rep.corpusFindings[0].ruleId).toBe('XS02')
  expect(rep.summary).toEqual({ skills: 2, skipped: 0, errors: 0, warnings: 1 })
})

test('invalid configs exit 2 naming the offending key', () => {
  const target = join(import.meta.dir, '../fixtures/minimal-pass')
  const cases: Array<[string, string]> = [
    ['bad-unknown-rule.yaml', 'HY99'],
    ['bad-severity.yaml', 'fatal'],
    ['bad-top-key.yaml', 'provenance'],
    ['bad-canonical.yaml', 'canonical'],
    ['bad-anatomy-key.yaml', 'nonexistent'],
    ['bad-yaml.yaml', 'malformed YAML'],
  ]
  for (const [file, needle] of cases) {
    const r = lint(target, '--config', join(FIX, file))
    expect(r.exitCode).toBe(2)
    expect(r.stderr).toContain(needle)
  }
})

test('missing config file exits 2', () => {
  const r = lint(join(import.meta.dir, '../fixtures/minimal-pass'), '--config', join(FIX, 'nope.yaml'))
  expect(r.exitCode).toBe(2)
  expect(r.stderr).toContain('config unreadable')
})

test('--config without a value exits 2 with usage', () => {
  const r = lint(join(import.meta.dir, '../fixtures/minimal-pass'), '--config')
  expect(r.exitCode).toBe(2)
  expect(r.stderr).toContain('usage:')
})
