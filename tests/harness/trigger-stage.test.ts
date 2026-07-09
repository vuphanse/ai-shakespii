import { expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runTriggerStage, TRIGGER_ACCURACY_THRESHOLD, TRIGGER_PASS_THRESHOLD, TRIGGER_REPS } from '../../src/lib/harness/trigger-stage'
import { parseSkill } from '../../src/lib/parser'
import { detected, failed, fakeRunner } from './helpers'

const EVALS_DOC = {
  skill_name: 'demo-skill',
  evals: [
    { id: 1, prompt: 'Case one.', expected_output: 'Out.', expectations: ['ok'] },
    { id: 2, prompt: 'Case two.', expected_output: 'Out.', expectations: ['ok'] },
    { id: 3, prompt: 'Case three.', expected_output: 'Out.', expectations: ['ok'] },
  ],
}

function makeSkill(triggersDoc: unknown | null): { skill: ReturnType<typeof parseSkill>; cacheRoot: string } {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-trigger-skill-'))
  writeFileSync(join(dir, 'SKILL.md'), '---\nname: demo-skill\ndescription: Use when testing trigger stage plumbing.\nversion: 1.0.0\n---\n\n# Demo\n')
  mkdirSync(join(dir, 'evals'), { recursive: true })
  writeFileSync(join(dir, 'evals/evals.json'), JSON.stringify(EVALS_DOC))
  if (triggersDoc !== null) {
    writeFileSync(join(dir, 'evals/triggers.json'), typeof triggersDoc === 'string' ? triggersDoc : JSON.stringify(triggersDoc))
  }
  return { skill: parseSkill(dir), cacheRoot: mkdtempSync(join(tmpdir(), 'shakespii-trigger-cache-')) }
}

const queries = (specs: Array<{ t: boolean }>) => ({
  skill_name: 'demo-skill',
  queries: specs.map((s, i) => ({ query: `Query ${i}.`, should_trigger: s.t })),
})

const opts = (runner: ReturnType<typeof fakeRunner>, cacheRoot: string, fresh = false) =>
  ({ runner, cacheRoot, model: 'sonnet', fresh })

test('constants are pinned', () => {
  expect(TRIGGER_REPS).toBe(3)
  expect(TRIGGER_PASS_THRESHOLD).toBe(0.5)
  expect(TRIGGER_ACCURACY_THRESHOLD).toBe(0.8)
})

test('input gate: missing triggers.json', async () => {
  const { skill, cacheRoot } = makeSkill(null)
  const runner = fakeRunner([])
  const rep = await runTriggerStage(skill, opts(runner, cacheRoot))
  expect(rep).toEqual({
    stage: 'trigger',
    status: 'fail',
    findings: [{ severity: 'error', message: 'evals/triggers.json missing — required by --triggers', file: 'evals/triggers.json', line: null }],
    queries: { passed: 0, total: 0 },
    runs: [],
  })
  expect(runner.requests).toHaveLength(0)
})

test('input gate: unparsable JSON and validator diagnostics', async () => {
  const bad = makeSkill('{nope')
  const badRep = await runTriggerStage(bad.skill, opts(fakeRunner([]), bad.cacheRoot))
  expect(badRep.findings[0].message).toBe('evals/triggers.json is not valid JSON')

  const invalid = makeSkill({ skill_name: 'demo-skill', queries: [{ query: '', should_trigger: 1 }] })
  const invRep = await runTriggerStage(invalid.skill, opts(fakeRunner([]), invalid.cacheRoot))
  expect(invRep.findings.map(f => f.message)).toEqual([
    'evals/triggers.json: queries[0].query — must be a non-empty string',
    'evals/triggers.json: queries[0].should_trigger — must be a boolean',
  ])
})

test('input gate: skill_name mismatch vs evals.json', async () => {
  const { skill, cacheRoot } = makeSkill({ ...queries([{ t: true }]), skill_name: 'someone-else' })
  const rep = await runTriggerStage(skill, opts(fakeRunner([]), cacheRoot))
  expect(rep.findings).toEqual([
    { severity: 'error', message: 'evals/triggers.json: skill_name — must match evals.json skill_name', file: 'evals/triggers.json', line: null },
  ])
})

test('majority scoring: 2/3 passes a positive, 1/3 fails it; inverse for negatives', async () => {
  const { skill, cacheRoot } = makeSkill(queries([{ t: true }, { t: false }]))
  // positive query: 2 fired of 3; negative query: 1 fired of 3 (rate 1/3 < 0.5 → negative passes)
  const runner = fakeRunner([detected(true), detected(true), detected(false), detected(true), detected(false), detected(false)])
  const rep = await runTriggerStage(skill, opts(runner, cacheRoot))
  // Both queries pass (2/3 ≥ 0.5 for the positive; 1/3 < 0.5 for the negative) → no findings → stage passes:
  expect(rep.findings).toEqual([])
  expect(rep.status).toBe('pass')
  expect(rep.queries).toEqual({ passed: 2, total: 2 })
  expect(rep.runs).toEqual([
    { queryIndex: 0, shouldTrigger: true, triggered: 2, reps: 3, cached: 0, status: 'ok' },
    { queryIndex: 1, shouldTrigger: false, triggered: 1, reps: 3, cached: 0, status: 'ok' },
  ])
  // prompts are the queries verbatim, detect carries the skill name
  expect(runner.requests[0].prompt).toBe('Query 0.')
  expect(runner.requests[0].detect).toEqual({ skillName: 'demo-skill' })
})

test('accuracy threshold: exactly 15/20 fails, 16/20 passes', async () => {
  // 20 positive queries; 15 fire 3/3, 5 fire 0/3.
  const make = async (passing: number) => {
    const { skill, cacheRoot } = makeSkill(queries(Array.from({ length: 20 }, () => ({ t: true }))))
    const script = Array.from({ length: 20 }, (_, qi) => Array.from({ length: 3 }, () => detected(qi < passing))).flat()
    return runTriggerStage(skill, opts(fakeRunner(script), cacheRoot))
  }
  const fifteen = await make(15)
  expect(fifteen.status).toBe('fail')
  expect(fifteen.findings).toEqual([
    { severity: 'error', message: 'trigger accuracy 0.75 below threshold 0.8 (15/20 queries)', file: 'evals/triggers.json', line: null },
  ])
  const sixteen = await make(16)
  expect(sixteen.status).toBe('pass')
  expect(sixteen.findings).toEqual([])
})

test('cache: second run replays with zero runner calls and an identical report', async () => {
  const { skill, cacheRoot } = makeSkill(queries([{ t: true }]))
  const first = await runTriggerStage(skill, opts(fakeRunner([detected(true), detected(true), detected(true)]), cacheRoot))
  expect(first.runs[0].cached).toBe(0)
  const replayRunner = fakeRunner([])
  const second = await runTriggerStage(skill, opts(replayRunner, cacheRoot))
  expect(replayRunner.requests).toHaveLength(0)
  expect(second.runs[0]).toEqual({ queryIndex: 0, shouldTrigger: true, triggered: 3, reps: 3, cached: 3, status: 'ok' })
  expect(second.queries).toEqual(first.queries)
})

test('fidelity mismatch self-heals: edited query text re-runs', async () => {
  const a = makeSkill(queries([{ t: true }]))
  await runTriggerStage(a.skill, opts(fakeRunner([detected(true), detected(true), detected(true)]), a.cacheRoot))
  // Same skill bytes, same cacheRoot, but a triggers.json whose query text changed
  // would change skillHash too (the file is in the inventory) — so simulate fidelity
  // corruption instead: tamper the cached trigger.json's stored query text.
  // Locate the rep-1 trigger.json under the cache and corrupt it:
  const skillName = 'demo-skill'
  const runsRoot = join(a.cacheRoot, 'runs', skillName)
  const repDirs = (await Array.fromAsync(new Bun.Glob('*/trigger.json').scan({ cwd: runsRoot, absolute: true })))
  expect(repDirs.length).toBe(3)
  const target = repDirs[0]
  const doc = JSON.parse(readFileSync(target, 'utf8'))
  writeFileSync(target, JSON.stringify({ ...doc, query: 'Tampered.' }))
  const healRunner = fakeRunner([detected(true)])
  const rep = await runTriggerStage(a.skill, opts(healRunner, a.cacheRoot))
  expect(healRunner.requests).toHaveLength(1) // exactly the corrupted rep re-ran
  expect(rep.runs[0]).toEqual({ queryIndex: 0, shouldTrigger: true, triggered: 3, reps: 3, cached: 2, status: 'ok' })
})

test('--fresh bypasses the cache', async () => {
  const { skill, cacheRoot } = makeSkill(queries([{ t: true }]))
  await runTriggerStage(skill, opts(fakeRunner([detected(true), detected(true), detected(true)]), cacheRoot))
  const freshRunner = fakeRunner([detected(true), detected(true), detected(true)])
  const rep = await runTriggerStage(skill, opts(freshRunner, cacheRoot, true))
  expect(freshRunner.requests).toHaveLength(3)
  expect(rep.runs[0].cached).toBe(0)
})

test('failed rep: one retry, then error finding, remaining reps skipped, next query continues, failed query excluded from totals', async () => {
  const { skill, cacheRoot } = makeSkill(queries([{ t: true }, { t: true }]))
  const runner = fakeRunner([
    detected(true), // q0 rep1 ok
    failed('timeout', 'hung'), // q0 rep2 attempt 1
    failed('timeout', 'hung again'), // q0 rep2 retry — rep fails, q0 abandoned
    detected(true), detected(true), detected(true), // q1 fully measured
  ])
  const rep = await runTriggerStage(skill, opts(runner, cacheRoot))
  expect(runner.requests).toHaveLength(6)
  expect(rep.status).toBe('fail')
  expect(rep.findings).toEqual([
    { severity: 'error', message: 'trigger run failed (query 0, rep 2): timeout — hung again', file: 'evals/triggers.json', line: null },
  ])
  expect(rep.queries).toEqual({ passed: 1, total: 1 }) // q0 excluded
  expect(rep.runs).toEqual([
    { queryIndex: 0, shouldTrigger: true, triggered: 1, reps: 2, cached: 0, status: 'timeout' },
    { queryIndex: 1, shouldTrigger: true, triggered: 3, reps: 3, cached: 0, status: 'ok' },
  ])
})

test('artifacts: trigger.json key order pinned; failed reps cache nothing', async () => {
  const { skill, cacheRoot } = makeSkill(queries([{ t: true }]))
  await runTriggerStage(skill, opts(fakeRunner([detected(true), detected(false), detected(true)]), cacheRoot))
  const runsRoot = join(cacheRoot, 'runs', 'demo-skill')
  const files = await Array.fromAsync(new Bun.Glob('*/trigger.json').scan({ cwd: runsRoot, absolute: true }))
  expect(files.length).toBe(3)
  const doc = JSON.parse(readFileSync(files[0], 'utf8'))
  expect(Object.keys(doc)).toEqual(['query', 'shouldTrigger', 'rep', 'triggered', 'status', 'durationSeconds'])
  expect(doc.status).toBe('ok')
})

// Shared skill + cacheRoot across the next two tests: the second test asserts that a
// cached replay recomputes contamination from the events.jsonl this test persists.
const contamFixture = makeSkill(queries([{ t: true }]))

test('trigger contamination: warn finding with query/rep context, stage still passes', async () => {
  const contaminatedDetected = detected(true, {
    events: [{ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'compress' } }] } }],
  })
  const runner = fakeRunner([contaminatedDetected, detected(true), detected(true)])
  const report = await runTriggerStage(contamFixture.skill, opts(runner, contamFixture.cacheRoot))
  expect(report.status).toBe('pass')
  expect(report.queries).toEqual({ passed: 1, total: 1 })
  expect(report.findings).toEqual([
    { severity: 'warn', message: 'contamination: session invoked non-target skill "compress" (1 invocation(s)) [query 0 rep 1]', file: 'evals/triggers.json', line: null },
  ])
})

test('trigger contamination recomputes from disk on cached reps (empty-script runner)', async () => {
  const replay = await runTriggerStage(contamFixture.skill, opts(fakeRunner([]), contamFixture.cacheRoot))
  expect(replay.runs[0].cached).toBe(TRIGGER_REPS)
  expect(replay.findings.filter(f => f.severity === 'warn')).toHaveLength(1)
})
