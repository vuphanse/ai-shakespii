import { expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runLlmStages } from '../../src/lib/harness/llm-stages'
import { runDir, runKey, skillContentHash } from '../../src/lib/harness/run-dir'
import { parseSkill } from '../../src/lib/parser'
import { completed, failed, fakeRunner, gradingReply, resultEvent } from './helpers'

const COMPRESS = join(import.meta.dir, '../fixtures/harness/compress')
const skill = () => parseSkill(COMPRESS)
const evals = JSON.parse(readFileSync(join(COMPRESS, 'evals/evals.json'), 'utf8')) as {
  evals: Array<{ id: number; expectations: string[] }>
}

const executorOk = () => completed('Task complete.', { events: [resultEvent('Task complete.')], durationSeconds: 2 })
const graderOk = (i: number) => completed(gradingReply(evals.evals[i].expectations.map(text => ({ text, passed: true }))))

const freshCache = () => mkdtempSync(join(tmpdir(), 'shakespii-llm-cache-'))
const opts = (runner: ReturnType<typeof fakeRunner>, cacheRoot: string, fresh = false) => ({
  runner,
  cacheRoot,
  model: 'sonnet',
  fresh,
})

test('cold run: executor + grader per case in id order, artifacts written, stages pass', async () => {
  const cacheRoot = freshCache()
  const runner = fakeRunner([
    executorOk(), graderOk(0),
    executorOk(), graderOk(1),
    executorOk(), graderOk(2),
  ])
  const { scenario, grading } = await runLlmStages(skill(), opts(runner, cacheRoot))
  expect(scenario).toEqual({
    stage: 'scenario',
    status: 'pass',
    findings: [],
    runs: [
      { evalId: 1, cached: false, status: 'ok', durationSeconds: 2 },
      { evalId: 2, cached: false, status: 'ok', durationSeconds: 2 },
      { evalId: 3, cached: false, status: 'ok', durationSeconds: 2 },
    ],
  })
  expect(grading).toEqual({
    stage: 'grading',
    status: 'pass',
    findings: [],
    expectations: { passed: 8, total: 8 }, // 4 + 2 + 2 expectations across the three compress cases
  })
  // executor calls run in outputs/, grader calls in the run dir; prompts carry the contract
  expect(runner.requests).toHaveLength(6)
  expect(runner.requests[0].prompt).toStartWith('A skill named "compress" is installed at .claude/skills/compress/.')
  expect(runner.requests[0].cwd.endsWith('/outputs')).toBe(true)
  expect(runner.requests[1].cwd.endsWith('/outputs')).toBe(false)
  const key = runKey({ skillHash: skillContentHash(skill()), evalId: 1, model: 'sonnet' })
  const dir = runDir(cacheRoot, 'compress', key)
  for (const artifact of ['events.jsonl', 'transcript.md', 'outputs/metrics.json', 'timing.json', 'grading.json']) {
    expect(existsSync(join(dir, artifact))).toBe(true)
  }
})

test('second run replays from cache: zero runner calls, identical findings, cached metas', async () => {
  const cacheRoot = freshCache()
  const grader1Fails = completed(gradingReply(evals.evals[0].expectations.map((text, i) => ({ text, passed: i > 0 }))))
  const cold = fakeRunner([executorOk(), grader1Fails, executorOk(), graderOk(1), executorOk(), graderOk(2)])
  const first = await runLlmStages(skill(), opts(cold, cacheRoot))
  const warm = fakeRunner([])
  const second = await runLlmStages(skill(), opts(warm, cacheRoot))
  expect(warm.requests).toHaveLength(0)
  expect(second.grading.findings).toEqual(first.grading.findings)
  expect(second.grading.expectations).toEqual(first.grading.expectations)
  expect(second.scenario.runs.every(r => r.cached && r.status === 'ok' && r.durationSeconds === 0)).toBe(true)
})

test('--fresh re-executes despite a valid cache', async () => {
  const cacheRoot = freshCache()
  const cold = fakeRunner([executorOk(), graderOk(0), executorOk(), graderOk(1), executorOk(), graderOk(2)])
  await runLlmStages(skill(), opts(cold, cacheRoot))
  const fresh = fakeRunner([executorOk(), graderOk(0), executorOk(), graderOk(1), executorOk(), graderOk(2)])
  const res = await runLlmStages(skill(), opts(fresh, cacheRoot, true))
  expect(fresh.requests).toHaveLength(6)
  expect(res.scenario.runs.every(r => r.cached === false)).toBe(true)
})

test('rubric-mismatched cached grading is a self-healing miss', async () => {
  const cacheRoot = freshCache()
  const cold = fakeRunner([executorOk(), graderOk(0), executorOk(), graderOk(1), executorOk(), graderOk(2)])
  await runLlmStages(skill(), opts(cold, cacheRoot))
  const key = runKey({ skillHash: skillContentHash(skill()), evalId: 1, model: 'sonnet' })
  const dir = runDir(cacheRoot, 'compress', key)
  writeFileSync(
    join(dir, 'grading.json'),
    JSON.stringify({ expectations: [{ text: 'stale rubric', passed: true, evidence: 'e' }], summary: { passed: 1, failed: 0, total: 1, pass_rate: 1 } }),
  )
  const heal = fakeRunner([executorOk(), graderOk(0)])
  const res = await runLlmStages(skill(), opts(heal, cacheRoot))
  expect(heal.requests).toHaveLength(2) // only eval 1 re-ran
  expect(res.scenario.runs[0].cached).toBe(false)
  expect(res.scenario.runs[1].cached).toBe(true)
})

test('executor failures: finding per case, no grading, stays uncached', async () => {
  const cacheRoot = freshCache()
  const runner = fakeRunner([
    failed('timeout', 'timed out after 300000ms'),
    completed(null, { events: [] }), // completed but no result event -> no-result
    executorOk(), graderOk(2),
  ])
  const { scenario, grading } = await runLlmStages(skill(), opts(runner, cacheRoot))
  expect(scenario.status).toBe('fail')
  expect(scenario.findings).toEqual([
    { severity: 'error', message: 'eval 1: executor timeout — timed out after 300000ms', file: 'evals/evals.json', line: null },
    { severity: 'error', message: 'eval 2: executor no-result — no result event', file: 'evals/evals.json', line: null },
  ])
  expect(scenario.runs.map(r => r.status)).toEqual(['timeout', 'no-result', 'ok'])
  expect(grading.expectations).toEqual({ passed: 2, total: 2 }) // only eval 3 graded
  const key = runKey({ skillHash: skillContentHash(skill()), evalId: 1, model: 'sonnet' })
  expect(existsSync(join(runDir(cacheRoot, 'compress', key), 'grading.json'))).toBe(false)
  expect(existsSync(join(runDir(cacheRoot, 'compress', key), 'transcript.md'))).toBe(true) // artifacts still written
})

test('grader failure: grading finding, case uncached, scenario run still ok', async () => {
  const cacheRoot = freshCache()
  const runner = fakeRunner([
    executorOk(), failed('timeout', 't'), failed('timeout', 't'),
    executorOk(), graderOk(1),
    executorOk(), graderOk(2),
  ])
  const { scenario, grading } = await runLlmStages(skill(), opts(runner, cacheRoot))
  expect(scenario.status).toBe('pass')
  expect(grading.status).toBe('fail')
  expect(grading.findings[0]).toEqual({
    severity: 'error',
    message: 'eval 1: grader timeout — t',
    file: 'evals/evals.json',
    line: null,
  })
})
