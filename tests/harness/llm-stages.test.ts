import { expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
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

// Single-eval skill fixture (skill_name 'demo-skill', expectations ['ok']) for contamination
// tests — the compress fixture above has 3 evals and doesn't fit the single-invocation shape.
const freshSkillAndCache = () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-llm-contam-skill-'))
  writeFileSync(join(dir, 'SKILL.md'), '---\nname: demo-skill\ndescription: Use when testing scenario contamination plumbing.\nversion: 1.0.0\n---\n\n# Demo\n')
  mkdirSync(join(dir, 'evals'), { recursive: true })
  writeFileSync(
    join(dir, 'evals/evals.json'),
    JSON.stringify({
      skill_name: 'demo-skill',
      evals: [{ id: 1, prompt: 'Do the task.', expected_output: 'The task is done.', expectations: ['ok'] }],
    }),
  )
  return { skill: parseSkill(dir), cacheRoot: mkdtempSync(join(tmpdir(), 'shakespii-llm-contam-cache-')) }
}
const graderOkAllPass = () => completed(gradingReply([{ text: 'ok', passed: true }]))
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

const contaminatedExecutor = () =>
  completed('did the task', {
    events: [
      { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'compress' } }] } },
      resultEvent('did the task'),
    ],
  })

test('scenario contamination: warn finding with contractual message, status stays pass', async () => {
  const { skill, cacheRoot } = freshSkillAndCache()
  const runner = fakeRunner([contaminatedExecutor(), graderOkAllPass()])
  const { scenario, grading } = await runLlmStages(skill, opts(runner, cacheRoot))
  expect(scenario.status).toBe('pass')
  expect(grading.status).toBe('pass')
  const warns = scenario.findings.filter(f => f.severity === 'warn')
  expect(warns).toEqual([
    { severity: 'warn', message: 'contamination: session invoked non-target skill "compress" (1 invocation(s)) [eval 1]', file: 'evals/evals.json', line: null },
  ])
})

test('scenario contamination recomputes from persisted events.jsonl on cached replay', async () => {
  const { skill, cacheRoot } = freshSkillAndCache()
  await runLlmStages(skill, opts(fakeRunner([contaminatedExecutor(), graderOkAllPass()]), cacheRoot))
  const replayRunner = fakeRunner([])
  const { scenario } = await runLlmStages(skill, opts(replayRunner, cacheRoot))
  expect(replayRunner.requests).toHaveLength(0)
  expect(scenario.runs[0].cached).toBe(true)
  expect(scenario.findings.some(f => f.message.startsWith('contamination:'))).toBe(true)
})

test('scenario invoking the TARGET skill is not contamination', async () => {
  const targetExecutor = completed('did the task', {
    events: [
      { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'demo-skill' } }] } },
      resultEvent('did the task'),
    ],
  })
  const runner = fakeRunner([targetExecutor, graderOkAllPass()])
  const fresh = freshSkillAndCache()
  const { scenario } = await runLlmStages(fresh.skill, opts(runner, fresh.cacheRoot))
  expect(scenario.findings).toEqual([])
})
