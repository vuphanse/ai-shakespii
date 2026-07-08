import { expect, test } from 'bun:test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { testSkill } from '../../src/lib/harness'
import { parseSkill } from '../../src/lib/parser'
import { completed, fakeRunner, gradingReply, resultEvent } from './helpers'

const COMPRESS = join(import.meta.dir, '../fixtures/harness/compress')
const NO_EVALS = join(import.meta.dir, '../fixtures/harness/no-evals')

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
