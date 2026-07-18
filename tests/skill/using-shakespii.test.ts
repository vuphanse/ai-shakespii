import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { splitFrontmatter } from '../../src/lib/parser/frontmatter'

const CLI = join(import.meta.dir, '../../src/cli/index.ts')
const SKILL_DIR = join(import.meta.dir, '../../skills/using-shakespii')

const REQUIRED_PROMPT_ANCHORS = [
  'Lint my skill',
  'Create a new skill',
  'Run shakespii lint on',
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
  expect(evals.evals).toHaveLength(5)
  expect(evals.evals.map(c => c.id)).toEqual([1, 2, 3, 4, 5])
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

test('triggers.json carries 20 labeled queries: 11 positive, 9 near-miss negatives', async () => {
  const raw = await Bun.file(join(SKILL_DIR, 'evals/triggers.json')).text()
  const doc = JSON.parse(raw) as { skill_name: string; queries: Array<{ query: string; should_trigger: boolean }> }
  expect(doc.skill_name).toBe('using-shakespii')
  expect(doc.queries).toHaveLength(20)
  expect(doc.queries.filter(q => q.should_trigger).length).toBe(11)
  expect(doc.queries.filter(q => !q.should_trigger).length).toBe(9)
  for (const q of doc.queries) expect(q.query.length).toBeGreaterThan(0)
})

test('v0.8.0 teaches the bench, trigger, and install loops', async () => {
  const raw = await Bun.file(join(SKILL_DIR, 'SKILL.md')).text()
  const { fm } = splitFrontmatter(raw)
  expect(fm.error).toBeNull()
  expect(fm.parsed?.version).toBe('0.8.0')
  expect(raw).toContain('shakespii bench')
  expect(raw).toContain('--triggers')
  expect(raw).toContain('shakespii install')
  expect(raw).toContain('--provider')
})

test('description is byte-frozen at the M5b-measured wording', async () => {
  const raw = await Bun.file(join(SKILL_DIR, 'SKILL.md')).text()
  expect(raw).toContain(
    'description: "Use when the user asks to lint, audit, test, benchmark, validate, or fix an agent skill — from a single SKILL.md frontmatter check to trigger-accuracy measurement or a corpus-wide audit of installed skills for duplication — driving the shakespii CLI (init, lint --json, test --run, bench) to resolve findings until clean."',
  )
})
