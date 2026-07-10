import { expect, test } from 'bun:test'
import { join } from 'node:path'

const CLI = join(import.meta.dir, '../../src/cli/index.ts')
const SKILL_DIR = join(import.meta.dir, '../../skills/authoring-skills')
const SKILLS_ROOT = join(import.meta.dir, '../../skills')

const REQUIRED_PROMPT_ANCHORS = [
  'Create a new skill called retry-taxonomy',
  'authoring interview',
  'Lint my skill',
  'blog post',
]

test('authoring-skills lints to zero findings through the real CLI', () => {
  const lint = Bun.spawnSync(['bun', CLI, 'lint', SKILL_DIR, '--json'])
  expect(lint.exitCode).toBe(0)
  const report = JSON.parse(lint.stdout.toString())
  expect(report.summary).toEqual({ errors: 0, warnings: 0 })
  expect(report.findings).toEqual([])
})

test('the skills corpus carries no cross-skill findings at the 0.65 threshold', () => {
  const lint = Bun.spawnSync(['bun', CLI, 'lint', SKILLS_ROOT, '--corpus', '--json'])
  expect(lint.exitCode).toBe(0)
  const report = JSON.parse(lint.stdout.toString())
  expect(report.corpusFindings).toEqual([])
})

test('evals.json carries the skill-creator shape with the four anchored cases', async () => {
  const raw = await Bun.file(join(SKILL_DIR, 'evals/evals.json')).text()
  const evals = JSON.parse(raw) as {
    skill_name: string
    evals: Array<{ id: number; prompt: string; expected_output: string; expectations: string[] }>
  }
  expect(evals.skill_name).toBe('authoring-skills')
  expect(evals.evals.length).toBeGreaterThanOrEqual(4)
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

test('triggers.json carries 20 labeled queries: 12 positive, 8 near-miss negatives', async () => {
  const raw = await Bun.file(join(SKILL_DIR, 'evals/triggers.json')).text()
  const doc = JSON.parse(raw) as { skill_name: string; queries: Array<{ query: string; should_trigger: boolean }> }
  expect(doc.skill_name).toBe('authoring-skills')
  expect(doc.queries).toHaveLength(20)
  expect(doc.queries.filter(q => q.should_trigger).length).toBe(12)
  expect(doc.queries.filter(q => !q.should_trigger).length).toBe(8)
  for (const q of doc.queries) expect(q.query.length).toBeGreaterThan(0)
})

test('v0.1.0 delegates CLI mechanics to using-shakespii', async () => {
  const raw = await Bun.file(join(SKILL_DIR, 'SKILL.md')).text()
  expect(raw).toContain('version: 0.1.0')
  expect(raw).toContain('using-shakespii')
  expect(raw).toContain('references/critique-rubric.md')
  expect(raw).toContain('references/headless-eval-rules.md')
})
