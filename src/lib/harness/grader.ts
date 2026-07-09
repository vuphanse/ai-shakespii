import { renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { EvalCase, GradingExpectation, GradingJson } from '../evals/types'
import { validateGradingJson } from '../evals/validate'
import type { ClaudeRunner, RunnerResult } from './claude-runner'
import { RUN_TIMEOUT_MS } from './claude-runner'
import type { ExecutionMetrics } from './stream-json'
import type { HarnessFinding } from './types'

const truncate = (s: string, max: number): string => (s.length > max ? `${s.slice(0, max)}…` : s)

export function buildGraderPrompt(evalCase: EvalCase): string {
  const numbered = evalCase.expectations.map((e, i) => `${i + 1}. ${e}`).join('\n')
  return `You are grading a skill evaluation run. Work in the current directory.

Read transcript.md (the execution transcript). Examine the files under outputs/, ignoring outputs/.claude/ (it is the skill mount, not an artifact).

The task given to the executor:
${evalCase.prompt}

Expected outcome:
${evalCase.expected_output}

Grade each expectation below as passed true or false, with cited evidence. The burden of proof is on the expectation: PASS only with clear evidence of genuine completion; superficial compliance (right filename, wrong content) is FAIL. No partial credit.

Expectations (grade exactly these, verbatim, in this order):
${numbered}

Reply with ONLY this JSON — no prose before or after:
{
  "expectations": [
    { "text": "<expectation verbatim>", "passed": true, "evidence": "<specific citation>" }
  ],
  "summary": { "passed": 0, "failed": 0, "total": 0, "pass_rate": 0 }
}`
}

export function buildGraderRetryPrompt(original: string, problems: string[], previousReply: string): string {
  return `${original}

Your previous reply failed validation:
${problems.join('\n')}

Previous reply:
${previousReply}

Reply again with ONLY the corrected JSON.`
}

/** Trim; unwrap a single fenced block (with or without a language tag); JSON.parse. undefined = parse failure. */
export function extractGraderJson(finalText: string): unknown | undefined {
  let body = finalText.trim()
  if (body.startsWith('```')) {
    const firstNewline = body.indexOf('\n')
    const lastFence = body.lastIndexOf('```')
    if (firstNewline !== -1 && lastFence > firstNewline) {
      body = body.slice(firstNewline + 1, lastFence).trim()
    }
  }
  try {
    return JSON.parse(body)
  } catch {
    return undefined
  }
}

/** Gates 2 (schema) and 3 (rubric fidelity). Empty array = pass. */
export function gateGraderReply(doc: unknown, expectations: string[]): string[] {
  const diagnostics = validateGradingJson(doc)
  if (diagnostics.length > 0) return diagnostics.map(d => `${d.path}: ${d.message}`)
  const g = doc as GradingJson
  if (g.expectations.length !== expectations.length) {
    return [`expectations: expected ${expectations.length} graded expectations, got ${g.expectations.length}`]
  }
  for (let i = 0; i < expectations.length; i++) {
    if (g.expectations[i].text !== expectations[i]) {
      return [`expectations[${i}].text: does not match the eval's expectation`]
    }
  }
  return []
}

/** The grader's arithmetic is never trusted; pass_rate rounds to 4 decimals. */
export function recomputeSummary(expectations: GradingExpectation[]): GradingJson['summary'] {
  const passed = expectations.filter(e => e.passed).length
  const total = expectations.length
  return {
    passed,
    failed: total - passed,
    total,
    pass_rate: total === 0 ? 0 : Math.round((passed / total) * 10_000) / 10_000,
  }
}

export function gradingFindings(evalId: number, grading: GradingJson): HarnessFinding[] {
  return grading.expectations
    .filter(e => !e.passed)
    .map(e => ({
      severity: 'error' as const,
      message: `eval ${evalId} expectation failed: "${e.text}" — ${truncate(e.evidence, 200)}`,
      file: 'evals/evals.json',
      line: null,
    }))
}

export type GradeCaseResult = { grading: GradingJson; graderDurationSeconds: number } | { failure: string }

const round2 = (n: number): number => Math.round(n * 100) / 100

type Attempt =
  | { kind: 'ok'; doc: GradingJson; reply: string }
  | { kind: 'runner'; failure: string }
  | { kind: 'gate'; problems: string[]; reply: string }

function classify(result: RunnerResult, expectations: string[]): Attempt {
  if (result.status !== 'completed') {
    return { kind: 'runner', failure: `grader ${result.status} — ${result.errorMessage ?? 'no reply text'}` }
  }
  const reply = result.finalText ?? ''
  if (reply.trim().length === 0) {
    return { kind: 'runner', failure: 'grader no-reply — no reply text' }
  }
  const doc = extractGraderJson(reply)
  if (doc === undefined) return { kind: 'gate', problems: ['reply is not valid JSON'], reply }
  const problems = gateGraderReply(doc, expectations)
  if (problems.length > 0) return { kind: 'gate', problems, reply }
  return { kind: 'ok', doc: doc as GradingJson, reply }
}

/**
 * One grader pass for an executed eval case: at most two runner calls total
 * (spec §6 — runner-level and gate failures share the single-retry budget).
 * On success writes timing.json and grading.json (write .tmp, then rename).
 */
export async function gradeCase(args: {
  evalCase: EvalCase
  dir: string
  runner: ClaudeRunner
  model: string
  executorDurationSeconds: number
  metrics: ExecutionMetrics
}): Promise<GradeCaseResult> {
  const original = buildGraderPrompt(args.evalCase)
  let graderDuration = 0

  const call = async (prompt: string): Promise<Attempt> => {
    const result = await args.runner.run({ prompt, cwd: args.dir, model: args.model, timeoutMs: RUN_TIMEOUT_MS })
    graderDuration = round2(graderDuration + result.durationSeconds)
    return classify(result, args.evalCase.expectations)
  }

  let attempt = await call(original)
  let retryCause: string | null = null
  if (attempt.kind !== 'ok') {
    retryCause =
      attempt.kind === 'gate' ? `gate: invalid grading (${attempt.problems[0]})` : `runner: ${attempt.failure}`
    const retryPrompt =
      attempt.kind === 'gate' ? buildGraderRetryPrompt(original, attempt.problems, attempt.reply) : original
    attempt = await call(retryPrompt)
  }
  if (attempt.kind === 'runner') return { failure: attempt.failure }
  if (attempt.kind === 'gate') return { failure: `grader returned invalid grading (${attempt.problems[0]})` }

  const timing: Record<string, unknown> = {
    executor_duration_seconds: args.executorDurationSeconds,
    grader_duration_seconds: graderDuration,
    total_duration_seconds: round2(args.executorDurationSeconds + graderDuration),
  }
  if (retryCause !== null) {
    timing.grader_retries = 1
    timing.grader_retry_causes = [retryCause]
  }
  const merged: GradingJson = {
    expectations: attempt.doc.expectations,
    summary: recomputeSummary(attempt.doc.expectations),
    execution_metrics: args.metrics as unknown as Record<string, unknown>,
    timing,
  }
  const diagnostics = validateGradingJson(merged)
  if (diagnostics.length > 0) {
    throw new Error(`internal: merged grading document failed validation (${diagnostics[0].path}: ${diagnostics[0].message})`)
  }
  writeFileSync(join(args.dir, 'timing.json'), `${JSON.stringify(timing, null, 2)}\n`)
  const tmp = join(args.dir, 'grading.json.tmp')
  writeFileSync(tmp, `${JSON.stringify(merged, null, 2)}\n`)
  renameSync(tmp, join(args.dir, 'grading.json'))
  return { grading: merged, graderDurationSeconds: graderDuration }
}
