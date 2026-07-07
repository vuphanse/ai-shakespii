import { expect, test } from 'bun:test'
import { join } from 'node:path'

const CLI = join(import.meta.dir, '../../src/cli/index.ts')
const SKILL_DIR = join(import.meta.dir, '../../skills/using-shakespii')

const REQUIRED_CASE_IDS = [
  'using-shakespii-audit-existing',
  'using-shakespii-author-new',
  'using-shakespii-near-miss-code-lint',
  'using-shakespii-lint-run-failure',
]

test('using-shakespii lints to zero findings through the real CLI', () => {
  const lint = Bun.spawnSync(['bun', CLI, 'lint', SKILL_DIR, '--json'])
  expect(lint.exitCode).toBe(0)
  const report = JSON.parse(lint.stdout.toString())
  expect(report.summary).toEqual({ errors: 0, warnings: 0 })
  expect(report.findings).toEqual([])
})

test('evals.json carries the skill-creator shape with the four named cases', async () => {
  const raw = await Bun.file(join(SKILL_DIR, 'evals/evals.json')).text()
  const evals = JSON.parse(raw) as {
    skill: string
    evals: Array<{
      id: string
      prompt: string
      expected_output: string
      files: unknown[]
      expectations: string[]
    }>
  }
  expect(evals.skill).toBe('using-shakespii')
  expect(evals.evals.length).toBeGreaterThanOrEqual(4)
  for (const c of evals.evals) {
    for (const field of [c.id, c.prompt, c.expected_output] as const) {
      expect(typeof field).toBe('string')
      expect(field.length).toBeGreaterThan(0)
    }
    expect(Array.isArray(c.files)).toBe(true)
    expect(Array.isArray(c.expectations)).toBe(true)
    expect(c.expectations.length).toBeGreaterThan(0)
    for (const e of c.expectations) {
      expect(typeof e).toBe('string')
      expect(e.length).toBeGreaterThan(0)
    }
  }
  expect(evals.evals.map(c => c.id)).toEqual(expect.arrayContaining(REQUIRED_CASE_IDS))
})
