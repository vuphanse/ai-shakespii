import { expect, test } from 'bun:test'
import { join } from 'node:path'

const CLI = join(import.meta.dir, '../../src/cli/index.ts')
const SKILL_DIR = join(import.meta.dir, '../../skills/using-shakespii')

const REQUIRED_PROMPT_ANCHORS = [
  'Lint my skill',
  'Create a new skill',
  'Fix the ESLint errors',
  'Run shakespii lint on ./notes',
  'Audit all my installed skills',
  'Run the evals for',
]

test('using-shakespii lints to zero findings through the real CLI', () => {
  const lint = Bun.spawnSync(['bun', CLI, 'lint', SKILL_DIR, '--json'])
  expect(lint.exitCode).toBe(0)
  const report = JSON.parse(lint.stdout.toString())
  expect(report.summary).toEqual({ errors: 0, warnings: 0 })
  expect(report.findings).toEqual([])
})

test('evals.json carries the skill-creator shape with the five anchored cases', async () => {
  const raw = await Bun.file(join(SKILL_DIR, 'evals/evals.json')).text()
  const evals = JSON.parse(raw) as {
    skill_name: string
    evals: Array<{ id: number; prompt: string; expected_output: string; expectations: string[] }>
  }
  expect(evals.skill_name).toBe('using-shakespii')
  expect(evals.evals.length).toBeGreaterThanOrEqual(6)
  const ids = evals.evals.map(c => c.id)
  expect(new Set(ids).size).toBe(ids.length)
  for (const c of evals.evals) {
    expect(Number.isInteger(c.id)).toBe(true)
    for (const field of [c.prompt, c.expected_output] as const) {
      expect(typeof field).toBe('string')
      expect(field.length).toBeGreaterThan(0)
    }
    expect(Array.isArray(c.expectations)).toBe(true)
    expect(c.expectations.length).toBeGreaterThan(0)
    for (const e of c.expectations) {
      expect(typeof e).toBe('string')
      expect(e.length).toBeGreaterThan(0)
    }
  }
  for (const anchor of REQUIRED_PROMPT_ANCHORS) {
    expect(evals.evals.some(c => c.prompt.includes(anchor))).toBe(true)
  }
})

test('shakespii test passes on the weld skill', () => {
  const r = Bun.spawnSync(['bun', CLI, 'test', SKILL_DIR, '--json'])
  expect(r.exitCode).toBe(0)
  const rep = JSON.parse(r.stdout.toString())
  expect(rep.summary).toEqual({ errors: 0, warnings: 0 })
  expect(rep.stages[0]).toEqual({ stage: 'deterministic', status: 'pass', findings: [] })
})
