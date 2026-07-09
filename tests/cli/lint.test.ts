import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'

const CLI = join(import.meta.dir, '../../src/cli/index.ts')
const FIXTURES = join(import.meta.dir, '../fixtures')
const run = (args: string[]) => Bun.spawnSync(['bun', CLI, ...args], { cwd: tmpdir() })

test('minimal-pass: exit 0, pretty success line', () => {
  const r = run(['lint', join(FIXTURES, 'minimal-pass')])
  expect(r.exitCode).toBe(0)
  expect(r.stdout.toString()).toContain('✖ 1 problems (0 errors, 1 warnings)') // minimal-pass has no evals/triggers.json — TR02 warns
})

test('SKILL.md path accepted and resolved to its parent', () => {
  const r = run(['lint', join(FIXTURES, 'minimal-pass/SKILL.md')])
  expect(r.exitCode).toBe(0)
})

test('error findings: exit 1, pretty rows carry line:col, severity, ruleId, summary', () => {
  const r = run(['lint', join(FIXTURES, 'fm02-bad-name')])
  expect(r.exitCode).toBe(1)
  const outText = r.stdout.toString()
  expect(outText).toContain('2:1')
  expect(outText).toContain('error')
  expect(outText).toContain('FM02')
  expect(outText).toMatch(/✖ \d+ problems \(\d+ errors?, \d+ warnings?\)/)
})

test('--json: stdout is exactly one parseable object with the spec §4 shape', () => {
  const r = run(['lint', join(FIXTURES, 'fm02-bad-name'), '--json'])
  expect(r.exitCode).toBe(1)
  const report = JSON.parse(r.stdout.toString()) // throws if stdout is not pure JSON
  expect(report.version).toBe(1)
  expect(report.skill.name).toBe('Bad_Name')
  expect(report.profile).toBe('default')
  expect(report.summary.errors).toBeGreaterThanOrEqual(1)
  expect(Object.keys(report.findings[0]).sort()).toEqual(['file', 'line', 'message', 'ruleId', 'severity'])
})

test('warning-only findings: exit 0 in both modes, warning still reported', () => {
  const j = run(['lint', join(FIXTURES, 'warn-only'), '--json'])
  expect(j.exitCode).toBe(0)
  const report = JSON.parse(j.stdout.toString())
  expect(report.summary).toEqual({ errors: 0, warnings: 2 })
  expect(report.findings[0].ruleId).toBe('FM01')
  expect(report.findings[0].severity).toBe('warn')
  const p = run(['lint', join(FIXTURES, 'warn-only')])
  expect(p.exitCode).toBe(0)
  expect(p.stdout.toString()).toContain('(0 errors, 2 warnings)')
})

test('not a skill: exit 2, message on stderr', () => {
  const empty = mkdtempSync(join(tmpdir(), 'shakespii-empty-'))
  const r = run(['lint', empty])
  expect(r.exitCode).toBe(2)
  expect(r.stderr.toString()).toContain('no SKILL.md')
})

test('broken symlink inside skill dir: exit 2, "lint failed" on stderr, no stack trace on stdout', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-dangling-'))
  writeFileSync(
    join(dir, 'SKILL.md'),
    '---\nname: dangling-symlink\ndescription: "Use when testing dangling symlinks."\n---\n# dangling-symlink\n\nBody.\n',
  )
  symlinkSync('/nonexistent-target-xyz', join(dir, 'dangling'))
  const r = run(['lint', dir, '--json'])
  expect(r.exitCode).toBe(2)
  expect(r.stderr.toString()).toContain('lint failed')
  expect(r.stdout.toString()).toBe('')
})
