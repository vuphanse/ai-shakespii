import { cpSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { BenchmarkJson, BenchmarkRun, EvalCase, EvalsJson, GradingJson } from '../evals/types'
import { isRecord, validateBenchmarkJson } from '../evals/validate'
import type { ParsedSkill } from '../types'
import type { ClaudeRunner } from './claude-runner'
import { RUN_TIMEOUT_MS } from './claude-runner'
import { buildExecutorPrompt, readValidCachedGrading, stageRunDir } from './executor'
import { gradeCase } from './grader'
import { benchKey, HARNESS_SCHEMA_VERSION, runDir, skillContentHash, suiteKey } from './run-dir'
import { max, mean, min, stddev } from './stats'
import { deriveMetrics, extractFinalText, renderTranscript } from './stream-json'

export const BENCH_DEFAULT_RUNS = 3

const CONFIGS = ['with_skill', 'without_skill'] as const
export type BenchConfig = (typeof CONFIGS)[number]

export interface BenchOptions {
  runner: ClaudeRunner
  cacheRoot: string
  model: string
  runs: number
  fresh: boolean
}

export type BenchOutcome =
  | { ok: true; doc: BenchmarkJson; docPath: string; cachedRuns: number; totalRuns: number }
  | { ok: false; message: string }

const round2 = (n: number): number => Math.round(n * 100) / 100
const round4 = (n: number): number => Math.round(n * 10_000) / 10_000
const sign = (n: number): string => (n < 0 ? '-' : '+')

export function deltaPassRate(withMean: number, withoutMean: number): string {
  const d = withMean - withoutMean
  return `${sign(d)}${Math.abs(d).toFixed(2)}`
}

export function deltaTime(withMean: number, withoutMean: number): string {
  const d = withMean - withoutMean
  return `${sign(d)}${Math.abs(d).toFixed(1)}`
}

export function deltaTokens(withMean: number, withoutMean: number): string {
  const d = withMean - withoutMean
  return `${sign(d)}${Math.round(Math.abs(d))}`
}

/** without_skill staging: eval files are task inputs, not skill hints — no mount, no preamble. */
export function stageBareRunDir(skill: ParsedSkill, evalCase: EvalCase, dir: string): string {
  rmSync(dir, { recursive: true, force: true })
  const outputs = join(dir, 'outputs')
  mkdirSync(outputs, { recursive: true })
  for (const rel of evalCase.files ?? []) {
    const dest = join(outputs, rel)
    mkdirSync(dirname(dest), { recursive: true })
    cpSync(join(skill.dir, rel), dest)
  }
  return outputs
}

/**
 * Derive a benchmark result row from a persisted grading document (live and
 * cached runs go through the same derivation — replay identity by construction).
 * null = underivable, treated as a self-healing cache miss.
 */
export function deriveBenchResult(grading: GradingJson): BenchmarkRun['result'] | null {
  const em = grading.execution_metrics
  const timing = grading.timing
  if (!isRecord(em) || !isRecord(timing)) return null
  const time = timing.executor_duration_seconds
  const input = em.input_tokens
  const output = em.output_tokens
  const toolCalls = em.total_tool_calls
  const errors = em.errors_encountered
  if ([time, input, output, toolCalls, errors].some(v => typeof v !== 'number' || Number.isNaN(v as number))) return null
  const passed = grading.expectations.filter(e => e.passed).length
  const total = grading.expectations.length
  return {
    pass_rate: total === 0 ? 0 : round4(passed / total),
    passed,
    failed: total - passed,
    total,
    time_seconds: round2(time as number),
    tokens: (input as number) + (output as number),
    tool_calls: toolCalls as number,
    errors: errors as number,
  }
}

type LiveOutcome = { ok: true; result: BenchmarkRun['result'] } | { ok: false; message: string }

async function runLiveSample(
  skill: ParsedSkill,
  evalCase: EvalCase,
  config: BenchConfig,
  runNumber: number,
  skillName: string,
  dir: string,
  options: BenchOptions,
): Promise<LiveOutcome> {
  const failMessage = (detail: string): string => `bench run failed (eval ${evalCase.id}, ${config}, run ${runNumber}): ${detail}`

  const attemptOnce = async () => {
    const outputs = config === 'with_skill' ? stageRunDir(skill, evalCase, skillName, dir) : stageBareRunDir(skill, evalCase, dir)
    const prompt = config === 'with_skill' ? buildExecutorPrompt(skillName, evalCase.prompt) : evalCase.prompt
    const result = await options.runner.run({ prompt, cwd: outputs, model: options.model, timeoutMs: RUN_TIMEOUT_MS })
    const transcript = renderTranscript({ skillName, evalId: evalCase.id, prompt, events: result.events })
    const metrics = deriveMetrics(result.events, transcript)
    writeFileSync(join(dir, 'events.jsonl'), result.events.map(e => JSON.stringify(e)).join('\n') + (result.events.length > 0 ? '\n' : ''))
    writeFileSync(join(dir, 'transcript.md'), transcript)
    writeFileSync(join(outputs, 'metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`)
    return { result, metrics }
  }

  const isBad = (r: Awaited<ReturnType<typeof attemptOnce>>): boolean =>
    r.result.status !== 'completed' || extractFinalText(r.result.events) === null

  let attempt = await attemptOnce()
  if (isBad(attempt)) attempt = await attemptOnce() // single retry, identical request (spec §8.1)
  if (isBad(attempt)) {
    const status = attempt.result.status === 'completed' ? 'no-result' : attempt.result.status
    return { ok: false, message: failMessage(`executor ${status} — ${attempt.result.errorMessage ?? 'no result event'}`) }
  }

  const graded = await gradeCase({
    evalCase,
    dir,
    runner: options.runner,
    model: options.model,
    executorDurationSeconds: attempt.result.durationSeconds,
    metrics: attempt.metrics,
  })
  if ('failure' in graded) return { ok: false, message: failMessage(graded.failure) }
  const result = deriveBenchResult(graded.grading)
  if (result === null) return { ok: false, message: failMessage('internal: grading document missing derivable metrics') }
  return { ok: true, result }
}

/** Precondition: the deterministic stage ran on this skill with zero findings (the bench CLI gate). */
export async function runBenchSuite(skill: ParsedSkill, options: BenchOptions): Promise<BenchOutcome> {
  const entry = skill.files.find(f => f.relPath === 'evals/evals.json')
  if (!entry || entry.text === null) throw new Error('internal: runBenchSuite requires a deterministic-clean eval suite')
  const doc = JSON.parse(entry.text) as EvalsJson
  const cases = [...doc.evals].sort((a, b) => a.id - b.id)
  const skillName = doc.skill_name
  const skillHash = skillContentHash(skill)

  const rows: BenchmarkRun[] = []
  let cachedRuns = 0
  const samples: Record<BenchConfig, { pass: number[]; time: number[]; tokens: number[] }> = {
    with_skill: { pass: [], time: [], tokens: [] },
    without_skill: { pass: [], time: [], tokens: [] },
  }

  for (const evalCase of cases) {
    for (const config of CONFIGS) {
      for (let runNumber = 1; runNumber <= options.runs; runNumber++) {
        const key = benchKey({ skillHash, evalId: evalCase.id, config, runNumber, model: options.model })
        const dir = runDir(options.cacheRoot, skillName, key)
        let result: BenchmarkRun['result'] | null = null
        if (!options.fresh) {
          const cached = readValidCachedGrading(dir, evalCase.expectations)
          if (cached !== null) {
            result = deriveBenchResult(cached)
            if (result !== null) cachedRuns += 1
          }
        }
        if (result === null) {
          const live = await runLiveSample(skill, evalCase, config, runNumber, skillName, dir, options)
          if (!live.ok) return live // fail-fast: the matrix is unwritable, spend nothing further (spec §8.1)
          result = live.result
        }
        rows.push({ eval_id: evalCase.id, configuration: config, run_number: runNumber, result })
        samples[config].pass.push(result.pass_rate)
        samples[config].time.push(result.time_seconds)
        samples[config].tokens.push(result.tokens)
      }
    }
  }

  const stat4 = (xs: number[]) => ({ mean: round4(mean(xs)), stddev: round4(stddev(xs)), min: round4(min(xs)), max: round4(max(xs)) })
  const stat2 = (xs: number[]) => ({ mean: round2(mean(xs)), stddev: round2(stddev(xs)), min: round2(min(xs)), max: round2(max(xs)) })
  const summaryFor = (c: BenchConfig) => ({
    pass_rate: stat4(samples[c].pass),
    time_seconds: stat2(samples[c].time),
    tokens: stat2(samples[c].tokens),
  })
  const withSummary = summaryFor('with_skill')
  const withoutSummary = summaryFor('without_skill')

  const benchDoc: BenchmarkJson = {
    metadata: {
      skill_name: skillName,
      model: options.model,
      runs_per_configuration: options.runs,
      harness_schema_version: HARNESS_SCHEMA_VERSION,
    },
    runs: rows,
    run_summary: {
      with_skill: withSummary,
      without_skill: withoutSummary,
      delta: {
        pass_rate: deltaPassRate(withSummary.pass_rate.mean, withoutSummary.pass_rate.mean),
        time_seconds: deltaTime(withSummary.time_seconds.mean, withoutSummary.time_seconds.mean),
        tokens: deltaTokens(withSummary.tokens.mean, withoutSummary.tokens.mean),
      },
    },
  }

  const diagnostics = validateBenchmarkJson(benchDoc)
  if (diagnostics.length > 0) {
    return { ok: false, message: `internal: benchmark document failed validation (${diagnostics[0].path}: ${diagnostics[0].message})` }
  }

  const outDir = runDir(options.cacheRoot, skillName, `bench-${suiteKey({ skillHash, model: options.model, runs: options.runs })}`)
  mkdirSync(outDir, { recursive: true })
  const docPath = join(outDir, 'benchmark.json')
  const tmp = `${docPath}.tmp`
  writeFileSync(tmp, `${JSON.stringify(benchDoc, null, 2)}\n`)
  renameSync(tmp, docPath)
  return { ok: true, doc: benchDoc, docPath, cachedRuns, totalRuns: cases.length * CONFIGS.length * options.runs }
}
