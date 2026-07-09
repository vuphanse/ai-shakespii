import { expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { EvalsJson, GradingJson } from '../../src/lib/evals/types'
import { validateBenchmarkJson } from '../../src/lib/evals/validate'
import { BENCH_DEFAULT_RUNS, deltaPassRate, deltaTime, deltaTokens, deriveBenchResult, runBenchSuite } from '../../src/lib/harness/bench'
import { benchKey, runDir, skillContentHash } from '../../src/lib/harness/run-dir'
import { parseSkill } from '../../src/lib/parser'
import { completed, fakeRunner, failed, gradingReply, makeBenchSkillDir, resultEvent } from './helpers'
import type { FakeScript } from './helpers'

const CONFIGS = ['with_skill', 'without_skill'] as const

const executorOk = () => completed('did the task')
const graderOk = (expectations: string[], passes: boolean[]) =>
  completed(gradingReply(expectations.map((text, i) => ({ text, passed: passes[i] }))))

const SIMPLE_EVALS: EvalsJson = {
  skill_name: 'demo-skill',
  evals: [
    { id: 1, prompt: 'Case one.', expected_output: 'Out.', expectations: ['ok'] },
    { id: 2, prompt: 'Case two.', expected_output: 'Out.', expectations: ['ok'] },
    { id: 3, prompt: 'Case three.', expected_output: 'Out.', expectations: ['ok'] },
  ],
}

const GOLDEN_EVALS: EvalsJson = {
  skill_name: 'demo-skill',
  evals: [
    { id: 1, prompt: 'Case one.', expected_output: 'Out.', expectations: ['a1', 'a2'] },
    { id: 2, prompt: 'Case two.', expected_output: 'Out.', expectations: ['b1', 'b2'] },
    { id: 3, prompt: 'Case three.', expected_output: 'Out.', expectations: ['c1', 'c2'] },
  ],
}

function makeSkill(evalsDoc: EvalsJson): { skill: ReturnType<typeof parseSkill>; cacheRoot: string } {
  const { dir, cacheRoot } = makeBenchSkillDir(evalsDoc)
  return { skill: parseSkill(dir), cacheRoot }
}

/** Every sample in the matrix passes every expectation — used where the pass pattern itself is not under test. */
function allPassScript(doc: EvalsJson, runs: number): FakeScript {
  const script: FakeScript = []
  for (const evalCase of doc.evals) {
    for (const config of CONFIGS) {
      for (let run = 1; run <= runs; run++) {
        script.push(executorOk())
        script.push(graderOk(evalCase.expectations, evalCase.expectations.map(() => true)))
      }
    }
  }
  return script
}

test('BENCH_DEFAULT_RUNS is pinned', () => {
  expect(BENCH_DEFAULT_RUNS).toBe(3)
})

test('1. matrix order and prompt shapes', async () => {
  const { skill, cacheRoot } = makeSkill(SIMPLE_EVALS)
  const script: FakeScript = []
  for (const evalCase of SIMPLE_EVALS.evals) {
    for (const config of CONFIGS) {
      for (let run = 1; run <= 2; run++) {
        if (config === 'without_skill') {
          script.push((req) => {
            expect(existsSync(join(req.cwd, '.claude'))).toBe(false)
            return executorOk()
          })
        } else {
          script.push(executorOk())
        }
        script.push(graderOk(evalCase.expectations, [true]))
      }
    }
  }
  const runner = fakeRunner(script)
  const outcome = await runBenchSuite(skill, { runner, cacheRoot, model: 'sonnet', runs: 2, fresh: false })
  expect(outcome.ok).toBe(true)
  expect(runner.requests).toHaveLength(24)

  let i = 0
  for (const evalCase of SIMPLE_EVALS.evals) {
    for (const config of CONFIGS) {
      for (let run = 1; run <= 2; run++) {
        const executorReq = runner.requests[i]
        if (config === 'with_skill') {
          expect(executorReq.prompt.startsWith('A skill named "demo-skill" is installed at .claude/skills/demo-skill/.')).toBe(true)
        } else {
          expect(executorReq.prompt).toBe(evalCase.prompt)
        }
        i += 2
      }
    }
  }
})

test('2. golden document', async () => {
  const { skill, cacheRoot } = makeSkill(GOLDEN_EVALS)
  const script: FakeScript = [
    executorOk(), graderOk(['a1', 'a2'], [true, true]), // eval1 with_skill
    executorOk(), graderOk(['a1', 'a2'], [true, false]), // eval1 without_skill
    executorOk(), graderOk(['b1', 'b2'], [true, false]), // eval2 with_skill
    executorOk(), graderOk(['b1', 'b2'], [true, false]), // eval2 without_skill
    executorOk(), graderOk(['c1', 'c2'], [true, true]), // eval3 with_skill
    executorOk(), graderOk(['c1', 'c2'], [false, false]), // eval3 without_skill
  ]
  const outcome = await runBenchSuite(skill, { runner: fakeRunner(script), cacheRoot, model: 'sonnet', runs: 1, fresh: false })
  expect(outcome.ok).toBe(true)
  if (!outcome.ok) return

  const okResult = { time_seconds: 1.5, tokens: 12, tool_calls: 0, errors: 0 }
  const expectedDoc = {
    metadata: { skill_name: 'demo-skill', model: 'sonnet', runs_per_configuration: 1, harness_schema_version: 1 },
    runs: [
      { eval_id: 1, configuration: 'with_skill', run_number: 1, result: { pass_rate: 1, passed: 2, failed: 0, total: 2, ...okResult } },
      { eval_id: 1, configuration: 'without_skill', run_number: 1, result: { pass_rate: 0.5, passed: 1, failed: 1, total: 2, ...okResult } },
      { eval_id: 2, configuration: 'with_skill', run_number: 1, result: { pass_rate: 0.5, passed: 1, failed: 1, total: 2, ...okResult } },
      { eval_id: 2, configuration: 'without_skill', run_number: 1, result: { pass_rate: 0.5, passed: 1, failed: 1, total: 2, ...okResult } },
      { eval_id: 3, configuration: 'with_skill', run_number: 1, result: { pass_rate: 1, passed: 2, failed: 0, total: 2, ...okResult } },
      { eval_id: 3, configuration: 'without_skill', run_number: 1, result: { pass_rate: 0, passed: 0, failed: 2, total: 2, ...okResult } },
    ],
    run_summary: {
      with_skill: {
        pass_rate: { mean: 0.8333, stddev: 0.2887, min: 0.5, max: 1 },
        time_seconds: { mean: 1.5, stddev: 0, min: 1.5, max: 1.5 },
        tokens: { mean: 12, stddev: 0, min: 12, max: 12 },
      },
      without_skill: {
        pass_rate: { mean: 0.3333, stddev: 0.2887, min: 0, max: 0.5 },
        time_seconds: { mean: 1.5, stddev: 0, min: 1.5, max: 1.5 },
        tokens: { mean: 12, stddev: 0, min: 12, max: 12 },
      },
      delta: { pass_rate: '+0.50', time_seconds: '+0.0', tokens: '+0' },
    },
  }
  // re-key each run's result in the pinned field order (spread above uses insertion order already, but be explicit)
  const orderedDoc = {
    metadata: expectedDoc.metadata,
    runs: expectedDoc.runs.map(r => ({
      eval_id: r.eval_id,
      configuration: r.configuration,
      run_number: r.run_number,
      result: {
        pass_rate: r.result.pass_rate,
        passed: r.result.passed,
        failed: r.result.failed,
        total: r.result.total,
        time_seconds: r.result.time_seconds,
        tokens: r.result.tokens,
        tool_calls: r.result.tool_calls,
        errors: r.result.errors,
      },
    })),
    run_summary: expectedDoc.run_summary,
  }

  const bytes = readFileSync(outcome.docPath, 'utf8')
  expect(bytes).toBe(`${JSON.stringify(orderedDoc, null, 2)}\n`)

  const parsed = JSON.parse(bytes)
  expect(validateBenchmarkJson(parsed)).toEqual([])
  expect(Object.keys(parsed)).toEqual(['metadata', 'runs', 'run_summary'])
  expect(Object.keys(parsed.metadata)).toEqual(['skill_name', 'model', 'runs_per_configuration', 'harness_schema_version'])
  expect(Object.keys(parsed.runs[0].result)).toEqual(['pass_rate', 'passed', 'failed', 'total', 'time_seconds', 'tokens', 'tool_calls', 'errors'])
  expect(Object.keys(parsed.run_summary.with_skill.pass_rate)).toEqual(['mean', 'stddev', 'min', 'max'])
  expect(Object.keys(parsed.run_summary.delta)).toEqual(['pass_rate', 'time_seconds', 'tokens'])
})

test('3. delta signs', () => {
  expect(deltaPassRate(0.75, 0.25)).toBe('+0.50')
  expect(deltaPassRate(0.25, 0.5)).toBe('-0.25')
  expect(deltaPassRate(0.5, 0.5)).toBe('+0.00')
  expect(deltaTime(20.0, 7.0)).toBe('+13.0')
  expect(deltaTokens(1800, 100)).toBe('+1700')
  expect(deltaTokens(100, 100)).toBe('+0')
})

test('4. replay: second run hits cache with zero runner calls and identical document bytes', async () => {
  const { skill, cacheRoot } = makeSkill(SIMPLE_EVALS)
  const first = await runBenchSuite(skill, { runner: fakeRunner(allPassScript(SIMPLE_EVALS, 1)), cacheRoot, model: 'sonnet', runs: 1, fresh: false })
  expect(first.ok).toBe(true)
  if (!first.ok) return

  const replayRunner = fakeRunner([])
  const second = await runBenchSuite(skill, { runner: replayRunner, cacheRoot, model: 'sonnet', runs: 1, fresh: false })
  expect(second.ok).toBe(true)
  if (!second.ok) return

  expect(replayRunner.requests).toHaveLength(0)
  expect(second.cachedRuns).toBe(second.totalRuns)
  expect(readFileSync(second.docPath, 'utf8')).toBe(readFileSync(first.docPath, 'utf8'))
})

test('5. executor failure contract: fail-fast, no benchmark.json, failed run uncached, replay + re-execute on retry', async () => {
  const { skill, cacheRoot } = makeSkill(SIMPLE_EVALS)
  const script: FakeScript = [
    executorOk(), graderOk(['ok'], [true]), // eval1 with_skill run1 — good
    failed('timeout', 'hung'), // eval1 without_skill run1 attempt 1
    failed('timeout', 'hung again'), // eval1 without_skill run1 retry — fails
  ]
  const runner = fakeRunner(script)
  const outcome = await runBenchSuite(skill, { runner, cacheRoot, model: 'sonnet', runs: 1, fresh: false })
  expect(runner.requests).toHaveLength(4)
  expect(outcome).toEqual({ ok: false, message: 'bench run failed (eval 1, without_skill, run 1): executor timeout — hung again' })

  const foundBenchmarks = await Array.fromAsync(new Bun.Glob('**/benchmark.json').scan({ cwd: cacheRoot }))
  expect(foundBenchmarks).toHaveLength(0)

  const skillHash = skillContentHash(skill)
  const failedKey = benchKey({ skillHash, evalId: 1, config: 'without_skill', runNumber: 1, model: 'sonnet' })
  const failedDir = runDir(cacheRoot, 'demo-skill', failedKey)
  expect(existsSync(join(failedDir, 'events.jsonl'))).toBe(true)
  expect(existsSync(join(failedDir, 'transcript.md'))).toBe(true)
  expect(existsSync(join(failedDir, 'grading.json'))).toBe(false)

  // subsequent successful full re-run: eval1/with_skill replays from cache, everything else re-executes
  const rerunScript = allPassScript(SIMPLE_EVALS, 1).slice(2)
  const rerunRunner = fakeRunner(rerunScript)
  const rerun = await runBenchSuite(skill, { runner: rerunRunner, cacheRoot, model: 'sonnet', runs: 1, fresh: false })
  expect(rerun.ok).toBe(true)
  expect(rerunRunner.requests[0].prompt).toBe('Case one.')
})

test('6. no-result classification', async () => {
  const { skill, cacheRoot } = makeSkill(SIMPLE_EVALS)
  const runner = fakeRunner([completed(null), completed(null)])
  const outcome = await runBenchSuite(skill, { runner, cacheRoot, model: 'sonnet', runs: 1, fresh: false })
  expect(runner.requests).toHaveLength(2)
  expect(outcome).toEqual({ ok: false, message: 'bench run failed (eval 1, with_skill, run 1): executor no-result — no result event' })
})

test('7. grader-exhaustion failure: abort, nothing written', async () => {
  const { skill, cacheRoot } = makeSkill(SIMPLE_EVALS)
  const runner = fakeRunner([executorOk(), completed('garbage'), completed('garbage')])
  const outcome = await runBenchSuite(skill, { runner, cacheRoot, model: 'sonnet', runs: 1, fresh: false })
  expect(outcome).toEqual({ ok: false, message: 'bench run failed (eval 1, with_skill, run 1): grader returned invalid grading (reply is not valid JSON)' })
  const foundBenchmarks = await Array.fromAsync(new Bun.Glob('**/benchmark.json').scan({ cwd: cacheRoot }))
  expect(foundBenchmarks).toHaveLength(0)
})

test('8. deriveBenchResult unit', () => {
  const grading: GradingJson = {
    expectations: [
      { text: 'a', passed: true, evidence: 'seen' },
      { text: 'b', passed: false, evidence: 'missing' },
    ],
    summary: { passed: 1, failed: 1, total: 2, pass_rate: 0.5 },
    execution_metrics: { input_tokens: 100, output_tokens: 50, total_tool_calls: 4, errors_encountered: 1, tool_calls: {}, num_turns: 3, transcript_chars: 500 },
    timing: { executor_duration_seconds: 12.34, grader_duration_seconds: 1, total_duration_seconds: 13.34 },
  }
  expect(deriveBenchResult(grading)).toEqual({
    pass_rate: 0.5,
    passed: 1,
    failed: 1,
    total: 2,
    time_seconds: 12.34,
    tokens: 150,
    tool_calls: 4,
    errors: 1,
  })

  const { execution_metrics: _dropped, ...withoutMetrics } = grading
  expect(deriveBenchResult(withoutMetrics as GradingJson)).toBeNull()
})

const contaminatedExecutorOk = () =>
  completed('did the task', {
    events: [
      { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'compress' } }] } },
      resultEvent('did the task'),
    ],
  })

test('9. contamination warnings: without_skill flags any invocation, with_skill allows the target', async () => {
  const { skill, cacheRoot } = makeSkill(SIMPLE_EVALS)
  const script: FakeScript = []
  for (const evalCase of SIMPLE_EVALS.evals) {
    // with_skill run invokes the TARGET skill — allowed
    script.push(completed('did the task', {
      events: [
        { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'demo-skill' } }] } },
        resultEvent('did the task'),
      ],
    }))
    script.push(graderOk(evalCase.expectations, [true]))
    // without_skill run invokes compress — contamination
    script.push(contaminatedExecutorOk())
    script.push(graderOk(evalCase.expectations, [true]))
  }
  const outcome = await runBenchSuite(skill, { runner: fakeRunner(script), cacheRoot, model: 'sonnet', runs: 1, fresh: false })
  if (!outcome.ok) throw new Error(outcome.message)
  expect(outcome.warnings).toEqual([
    'warn contamination: without_skill eval 1 run 1 invoked non-target skill "compress" (1 invocation(s))',
    'warn contamination: without_skill eval 2 run 1 invoked non-target skill "compress" (1 invocation(s))',
    'warn contamination: without_skill eval 3 run 1 invoked non-target skill "compress" (1 invocation(s))',
  ])
})

test('10. contamination warnings recompute on cached replay; document bytes identical', async () => {
  const { skill, cacheRoot } = makeSkill(SIMPLE_EVALS)
  const script: FakeScript = []
  for (const evalCase of SIMPLE_EVALS.evals) {
    script.push(executorOk())
    script.push(graderOk(evalCase.expectations, [true]))
    script.push(contaminatedExecutorOk())
    script.push(graderOk(evalCase.expectations, [true]))
  }
  const first = await runBenchSuite(skill, { runner: fakeRunner(script), cacheRoot, model: 'sonnet', runs: 1, fresh: false })
  const replay = await runBenchSuite(skill, { runner: fakeRunner([]), cacheRoot, model: 'sonnet', runs: 1, fresh: false })
  if (!first.ok || !replay.ok) throw new Error('expected ok outcomes')
  expect(replay.cachedRuns).toBe(6)
  expect(replay.warnings).toEqual(first.warnings)
  expect(readFileSync(replay.docPath, 'utf8')).toBe(readFileSync(first.docPath, 'utf8'))
})
