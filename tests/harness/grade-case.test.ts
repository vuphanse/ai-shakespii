import { expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gradeCase } from '../../src/lib/harness/grader'
import { completed, failed, fakeRunner, gradingReply } from './helpers'

const evalCase = {
  id: 1,
  prompt: 'Do the task.',
  expected_output: 'Task done.',
  expectations: ['first expectation', 'second expectation'],
}

const metrics = {
  tool_calls: { Read: 1 },
  total_tool_calls: 1,
  errors_encountered: 0,
  num_turns: 2,
  input_tokens: 10,
  output_tokens: 20,
  transcript_chars: 500,
}

const args = (runner: ReturnType<typeof fakeRunner>, dir: string) => ({
  evalCase,
  dir,
  runner,
  model: 'sonnet',
  executorDurationSeconds: 12.34,
  metrics,
})

test('happy path: one call, merged doc persisted atomically, summary recomputed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-grade-'))
  const runner = fakeRunner([completed(gradingReply([
    { text: 'first expectation', passed: true },
    { text: 'second expectation', passed: false, evidence: 'missing output' },
  ]))])
  const res = await gradeCase(args(runner, dir))
  expect('grading' in res).toBe(true)
  if (!('grading' in res)) throw new Error('unreachable')
  expect(res.grading.summary).toEqual({ passed: 1, failed: 1, total: 2, pass_rate: 0.5 })
  expect(runner.requests).toHaveLength(1)
  expect(runner.requests[0].cwd).toBe(dir)
  expect(runner.requests[0].model).toBe('sonnet')
  expect(runner.requests[0].prompt).toContain('grade exactly these, verbatim')
  const persisted = JSON.parse(readFileSync(join(dir, 'grading.json'), 'utf8'))
  expect(persisted.execution_metrics).toEqual(metrics)
  expect(persisted.timing).toEqual({
    executor_duration_seconds: 12.34,
    grader_duration_seconds: 1.5,
    total_duration_seconds: 13.84,
  })
  expect(JSON.parse(readFileSync(join(dir, 'timing.json'), 'utf8'))).toEqual(persisted.timing)
  expect(existsSync(join(dir, 'grading.json.tmp'))).toBe(false)
})

test('gate failure then valid retry: retry prompt carries diagnostics and previous reply', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-grade-retry-'))
  const runner = fakeRunner([
    completed('not json at all'),
    completed(gradingReply([
      { text: 'first expectation', passed: true },
      { text: 'second expectation', passed: true },
    ])),
  ])
  const res = await gradeCase(args(runner, dir))
  expect('grading' in res).toBe(true)
  expect(runner.requests).toHaveLength(2)
  expect(runner.requests[1].prompt).toContain('Your previous reply failed validation:')
  expect(runner.requests[1].prompt).toContain('not json at all')
  expect(runner.requests[1].prompt).toContain('Reply again with ONLY the corrected JSON.')
})

test('two gate failures: invalid-grading failure, nothing persisted', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-grade-fail-'))
  const runner = fakeRunner([completed('nope'), completed('still nope')])
  const res = await gradeCase(args(runner, dir))
  expect(res).toEqual({ failure: 'grader returned invalid grading (reply is not valid JSON)' })
  expect(existsSync(join(dir, 'grading.json'))).toBe(false)
  expect(existsSync(join(dir, 'timing.json'))).toBe(false)
})

test('runner-level failures: timeout, nonzero-exit, no-reply each retry once with the ORIGINAL prompt', async () => {
  for (const [result, statusWord, detail] of [
    [failed('timeout', 'timed out after 300000ms'), 'timeout', 'timed out after 300000ms'],
    [failed('nonzero-exit', 'exit code 3'), 'nonzero-exit', 'exit code 3'],
    [completed(null), 'no-reply', 'no reply text'],
    [completed('   '), 'no-reply', 'no reply text'],
  ] as const) {
    const dir = mkdtempSync(join(tmpdir(), 'shakespii-grade-runner-'))
    const runner = fakeRunner([result, result])
    const res = await gradeCase(args(runner, dir))
    expect(res).toEqual({ failure: `grader ${statusWord} — ${detail}` })
    expect(runner.requests).toHaveLength(2)
    expect(runner.requests[1].prompt).toBe(runner.requests[0].prompt) // original, unchanged
    expect(existsSync(join(dir, 'grading.json'))).toBe(false)
  }
})

test('mixed failure: runner failure then gate failure — shared budget, one failure, two calls', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-grade-mixed-'))
  const runner = fakeRunner([failed('timeout', 't'), completed('garbage')])
  const res = await gradeCase(args(runner, dir))
  expect(res).toEqual({ failure: 'grader returned invalid grading (reply is not valid JSON)' })
  expect(runner.requests).toHaveLength(2)
})

test('grader duration sums across retry calls', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-grade-durations-'))
  const good = gradingReply([
    { text: 'first expectation', passed: true },
    { text: 'second expectation', passed: true },
  ])
  const runner = fakeRunner([completed('bad', { durationSeconds: 2 }), completed(good, { durationSeconds: 3 })])
  const res = await gradeCase(args(runner, dir))
  if (!('grading' in res)) throw new Error('expected success')
  expect(res.grading.timing).toEqual({
    executor_duration_seconds: 12.34,
    grader_duration_seconds: 5,
    total_duration_seconds: 17.34,
    grader_retries: 1,
    grader_retry_causes: ['gate: invalid grading (reply is not valid JSON)'],
  })
})

test('grader retry observability: gate retry stamps grader_retries and grader_retry_causes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-grade-obs-'))
  const good = gradingReply([
    { text: 'first expectation', passed: true },
    { text: 'second expectation', passed: true },
  ])
  const runner = fakeRunner([completed('garbage'), completed(good)])
  const res = await gradeCase(args(runner, dir))
  if (!('grading' in res)) throw new Error('expected success')
  expect(res.grading.timing?.grader_retries).toBe(1)
  expect(res.grading.timing?.grader_retry_causes).toEqual(['gate: invalid grading (reply is not valid JSON)'])
  expect(JSON.parse(readFileSync(join(dir, 'timing.json'), 'utf8')).grader_retries).toBe(1)
})

test('grader retry observability: runner-failure retry records a runner cause', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-grade-obs-runner-'))
  const good = gradingReply([
    { text: 'first expectation', passed: true },
    { text: 'second expectation', passed: true },
  ])
  const runner = fakeRunner([failed('timeout', 'slow'), completed(good)])
  const res = await gradeCase(args(runner, dir))
  if (!('grading' in res)) throw new Error('expected success')
  expect(res.grading.timing?.grader_retry_causes).toEqual(['runner: grader timeout — slow'])
})

test('grader retry observability: absent on first-try success', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-grade-obs-clean-'))
  const good = gradingReply([
    { text: 'first expectation', passed: true },
    { text: 'second expectation', passed: true },
  ])
  const res = await gradeCase(args(fakeRunner([completed(good)]), dir))
  if (!('grading' in res)) throw new Error('expected success')
  expect(res.grading.timing !== undefined && 'grader_retries' in res.grading.timing).toBe(false)
  expect(res.grading.timing !== undefined && 'grader_retry_causes' in res.grading.timing).toBe(false)
})
