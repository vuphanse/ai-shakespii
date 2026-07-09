import { expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { testSkill } from '../../src/lib/harness'
import { parseSkill } from '../../src/lib/parser'
import { completed, detected, fakeRunner, gradingReply, resultEvent } from './helpers'

const COMPRESS = join(import.meta.dir, '../fixtures/harness/compress')
const NO_EVALS = join(import.meta.dir, '../fixtures/harness/no-evals')

const TRIGGER_SKILL_EVALS_DOC = {
  skill_name: 'demo-skill',
  evals: [
    { id: 1, prompt: 'Case one.', expected_output: 'Out.', expectations: ['ok'] },
    { id: 2, prompt: 'Case two.', expected_output: 'Out.', expectations: ['ok'] },
    { id: 3, prompt: 'Case three.', expected_output: 'Out.', expectations: ['ok'] },
  ],
}

/** Deterministic-clean skill with a 3-case eval suite and a 1-query triggers.json (should_trigger: true). */
function makeTriggerSkill(): { skill: ReturnType<typeof parseSkill>; cacheRoot: string } {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-test-skill-triggers-'))
  writeFileSync(join(dir, 'SKILL.md'), '---\nname: demo-skill\ndescription: Use when testing testSkill trigger wiring.\nversion: 1.0.0\n---\n\n# Demo\n')
  mkdirSync(join(dir, 'evals'), { recursive: true })
  writeFileSync(join(dir, 'evals/evals.json'), JSON.stringify(TRIGGER_SKILL_EVALS_DOC))
  writeFileSync(join(dir, 'evals/triggers.json'), JSON.stringify({ skill_name: 'demo-skill', queries: [{ query: 'Trigger query.', should_trigger: true }] }))
  return { skill: parseSkill(dir), cacheRoot: mkdtempSync(join(tmpdir(), 'shakespii-test-skill-triggers-cache-')) }
}

const scenarioGradingScript = () => {
  const executorOk = completed('done', { events: [resultEvent('done')] })
  return [
    executorOk, completed(gradingReply([{ text: 'ok', passed: true }])),
    executorOk, completed(gradingReply([{ text: 'ok', passed: true }])),
    executorOk, completed(gradingReply([{ text: 'ok', passed: true }])),
  ]
}

test('no --run: LLM stages report skipped with the contractual note, zero runner use', async () => {
  const runner = fakeRunner([])
  const result = await testSkill(parseSkill(COMPRESS), { runner, cacheRoot: mkdtempSync(join(tmpdir(), 'sk-')) })
  expect(result.stages[1]).toEqual({ stage: 'scenario', status: 'skipped', note: 'pass --run to execute LLM stages' })
  expect(result.stages[2]).toEqual({ stage: 'grading', status: 'skipped', note: 'pass --run to execute LLM stages' })
  expect(runner.requests).toHaveLength(0)
})

test('--run with deterministic errors: stages skipped as deterministic stage failed', async () => {
  const runner = fakeRunner([])
  const result = await testSkill(parseSkill(NO_EVALS), { run: true, runner, cacheRoot: mkdtempSync(join(tmpdir(), 'sk-')) })
  expect(result.stages[1]).toEqual({ stage: 'scenario', status: 'skipped', note: 'deterministic stage failed' })
  expect(result.stages[2]).toEqual({ stage: 'grading', status: 'skipped', note: 'deterministic stage failed' })
  expect(runner.requests).toHaveLength(0)
  expect(result.summary.errors).toBe(1)
})

test('--run happy path: all three stages live, summary spans stages, model defaults to sonnet', async () => {
  const evals = JSON.parse(readFileSync(join(COMPRESS, 'evals/evals.json'), 'utf8')) as {
    evals: Array<{ expectations: string[] }>
  }
  const executorOk = completed('done', { events: [resultEvent('done')] })
  const runner = fakeRunner([
    executorOk, completed(gradingReply(evals.evals[0].expectations.map(text => ({ text, passed: true })))),
    executorOk, completed(gradingReply(evals.evals[1].expectations.map((text, i) => ({ text, passed: i === 0 })))),
    executorOk, completed(gradingReply(evals.evals[2].expectations.map(text => ({ text, passed: true })))),
  ])
  const result = await testSkill(parseSkill(COMPRESS), { run: true, runner, cacheRoot: mkdtempSync(join(tmpdir(), 'sk-')) })
  expect(result.stages[0]).toEqual({ stage: 'deterministic', status: 'pass', findings: [] })
  expect(result.stages[1]).toMatchObject({ stage: 'scenario', status: 'pass' })
  expect(result.stages[2]).toMatchObject({
    stage: 'grading',
    status: 'fail',
    expectations: { passed: 7, total: 8 },
  })
  expect(result.summary).toEqual({ errors: 1, warnings: 0 }) // the one failed expectation
  expect(runner.requests.every(r => r.model === 'sonnet')).toBe(true)
})

test('model option flows through to every runner request', async () => {
  const evals = JSON.parse(readFileSync(join(COMPRESS, 'evals/evals.json'), 'utf8')) as {
    evals: Array<{ expectations: string[] }>
  }
  const executorOk = completed('done', { events: [resultEvent('done')] })
  const runner = fakeRunner([
    executorOk, completed(gradingReply(evals.evals[0].expectations.map(text => ({ text, passed: true })))),
    executorOk, completed(gradingReply(evals.evals[1].expectations.map(text => ({ text, passed: true })))),
    executorOk, completed(gradingReply(evals.evals[2].expectations.map(text => ({ text, passed: true })))),
  ])
  await testSkill(parseSkill(COMPRESS), { run: true, model: 'haiku', runner, cacheRoot: mkdtempSync(join(tmpdir(), 'sk-')) })
  expect(runner.requests.every(r => r.model === 'haiku')).toBe(true)
})

test('testSkill with triggers: four stages, trigger findings roll into summary and exit-driving errors', async () => {
  const { skill, cacheRoot } = makeTriggerSkill()
  const runner = fakeRunner([...scenarioGradingScript(), detected(false), detected(false), detected(false)])
  const result = await testSkill(skill, { run: true, triggers: true, runner, cacheRoot })
  expect(result.stages.map(s => s.stage)).toEqual(['deterministic', 'scenario', 'grading', 'trigger'])
  const trigger = result.stages[3]
  if (trigger.stage !== 'trigger' || trigger.status === 'skipped') throw new Error('expected executed trigger stage')
  expect(trigger.findings[0].message).toBe('trigger accuracy 0.00 below threshold 0.8 (0/1 queries)')
  expect(result.summary.errors).toBeGreaterThan(0)
})

test('testSkill without triggers: three stages exactly (frozen surface)', async () => {
  const { skill, cacheRoot } = makeTriggerSkill()
  const runner = fakeRunner(scenarioGradingScript())
  const result = await testSkill(skill, { run: true, runner, cacheRoot })
  expect(result.stages).toHaveLength(3)
})

test('testSkill with triggers but failing deterministic: trigger skipped', async () => {
  const result = await testSkill(parseSkill(NO_EVALS), {
    run: true,
    triggers: true,
    runner: fakeRunner([]),
    cacheRoot: mkdtempSync(join(tmpdir(), 'sk-')),
  })
  expect(result.stages[3]).toEqual({ stage: 'trigger', status: 'skipped', note: 'deterministic stage failed' })
})
