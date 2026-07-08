import { expect, test } from 'bun:test'
import { validateBenchmarkJson, validateGradingJson } from '../../src/lib/evals/validate'

const grading = () => ({
  expectations: [{ text: 'Output includes X', passed: true, evidence: 'Found in step 3' }],
  summary: { passed: 1, failed: 0, total: 1, pass_rate: 1.0 },
})

test('valid grading document: zero diagnostics', () => {
  expect(validateGradingJson(grading())).toEqual([])
})

test('grading: optional blocks accepted when well-typed', () => {
  const doc = {
    ...grading(),
    execution_metrics: { total_tool_calls: 3 },
    timing: { total_duration_seconds: 5 },
    claims: [],
    user_notes_summary: { uncertainties: [] },
    eval_feedback: { suggestions: [] },
  }
  expect(validateGradingJson(doc)).toEqual([])
})

test('grading: non-object root', () => {
  expect(validateGradingJson([])).toEqual([{ path: '$', message: 'root must be an object' }])
})

test('grading: unknown root key, malformed expectation, bad pass_rate', () => {
  const doc = {
    expectation: [],
    expectations: [{ text: '', passed: 'yes', evidence: 'e' }],
    summary: { passed: 0, failed: 1, total: 1, pass_rate: 1.5 },
  }
  expect(validateGradingJson(doc)).toEqual([
    { path: 'expectation', message: 'unknown key "expectation"' },
    { path: 'expectations[0].text', message: 'must be a non-empty string' },
    { path: 'expectations[0].passed', message: 'must be a boolean' },
    { path: 'summary.pass_rate', message: 'must be a number between 0 and 1' },
  ])
})

test('grading: missing expectations and summary', () => {
  expect(validateGradingJson({})).toEqual([
    { path: 'expectations', message: 'must be a non-empty array' },
    { path: 'summary', message: 'must be an object' },
  ])
})

test('grading: summary counters must be integers', () => {
  const doc = grading()
  doc.summary = { passed: 0.5, failed: 0, total: 1, pass_rate: 0.5 } as never
  expect(validateGradingJson(doc)).toEqual([
    { path: 'summary.passed', message: 'must be an integer' },
  ])
})

test('grading: mistyped optional block', () => {
  const doc = { ...grading(), timing: 'fast' }
  expect(validateGradingJson(doc)).toEqual([{ path: 'timing', message: 'must be an object' }])
})

const benchmark = () => ({
  metadata: { skill_name: 'demo', runs_per_configuration: 3 },
  runs: [
    {
      eval_id: 1,
      eval_name: 'Ocean',
      configuration: 'with_skill',
      run_number: 1,
      result: { pass_rate: 0.85, passed: 6, failed: 1, total: 7, time_seconds: 42.5, tokens: 3800, tool_calls: 18, errors: 0 },
    },
  ],
  run_summary: {
    with_skill: {
      pass_rate: { mean: 0.85, stddev: 0.05, min: 0.8, max: 0.9 },
      time_seconds: { mean: 45.0, stddev: 12.0 },
      tokens: { mean: 3800, stddev: 400 },
    },
    without_skill: {
      pass_rate: { mean: 0.35, stddev: 0.08 },
      time_seconds: { mean: 32.0, stddev: 8.0 },
      tokens: { mean: 2100, stddev: 300 },
    },
    delta: { pass_rate: '+0.50', time_seconds: '+13.0', tokens: '+1700' },
  },
  notes: ['observation'],
})

test('valid benchmark document: zero diagnostics', () => {
  expect(validateBenchmarkJson(benchmark())).toEqual([])
})

test('benchmark: non-object root', () => {
  expect(validateBenchmarkJson('x')).toEqual([{ path: '$', message: 'root must be an object' }])
})

test('benchmark: missing required roots', () => {
  expect(validateBenchmarkJson({})).toEqual([
    { path: 'metadata', message: 'must be an object' },
    { path: 'runs', message: 'must be a non-empty array' },
    { path: 'run_summary', message: 'must be an object' },
  ])
})

test('benchmark: configuration is restricted to the two viewer strings', () => {
  const doc = benchmark()
  doc.runs[0].configuration = 'config_a' as never
  expect(validateBenchmarkJson(doc)).toEqual([
    { path: 'runs[0].configuration', message: 'must be "with_skill" or "without_skill"' },
  ])
})

test('benchmark: per-run diagnostics carry indexed paths', () => {
  const doc = benchmark()
  doc.runs[0] = {
    eval_id: 1.5,
    configuration: 'with_skill',
    run_number: 1,
    result: { pass_rate: 2, passed: 6, failed: 1, total: 7, time_seconds: 42.5, tokens: 3800, errors: 0 },
    extra: true,
  } as never
  expect(validateBenchmarkJson(doc)).toEqual([
    { path: 'runs[0].eval_id', message: 'must be an integer' },
    { path: 'runs[0].result.pass_rate', message: 'must be a number between 0 and 1' },
    { path: 'runs[0].extra', message: 'unknown key "extra"' },
  ])
})

test('benchmark: required result fields are enforced, in fixed order', () => {
  const doc = benchmark()
  doc.runs[0].result = { pass_rate: 0.5 } as never
  expect(validateBenchmarkJson(doc)).toEqual([
    { path: 'runs[0].result.passed', message: 'must be an integer' },
    { path: 'runs[0].result.failed', message: 'must be an integer' },
    { path: 'runs[0].result.total', message: 'must be an integer' },
    { path: 'runs[0].result.time_seconds', message: 'must be a number' },
    { path: 'runs[0].result.tokens', message: 'must be a number' },
    { path: 'runs[0].result.errors', message: 'must be an integer' },
  ])
})

test('benchmark: unknown result key and mistyped tool_calls', () => {
  const doc = benchmark()
  doc.runs[0].result = { pass_rate: 0.5, passed: 1, failed: 0, total: 1, time_seconds: 1, tokens: 10, tool_calls: 'many', errors: 0, bonus: 1 } as never
  expect(validateBenchmarkJson(doc)).toEqual([
    { path: 'runs[0].result.tool_calls', message: 'must be an integer' },
    { path: 'runs[0].result.bonus', message: 'unknown key "bonus"' },
  ])
})

test('benchmark: run_summary must carry both configurations and delta, with required aggregates', () => {
  const doc = benchmark()
  doc.run_summary = { with_skill: {} } as never
  expect(validateBenchmarkJson(doc)).toEqual([
    { path: 'run_summary.with_skill.pass_rate', message: 'must be an object with mean and stddev' },
    { path: 'run_summary.with_skill.time_seconds', message: 'must be an object with mean and stddev' },
    { path: 'run_summary.with_skill.tokens', message: 'must be an object with mean and stddev' },
    { path: 'run_summary.without_skill', message: 'must be an object' },
    { path: 'run_summary.delta', message: 'must be an object' },
  ])
})

test('benchmark: aggregate stat objects require numeric mean and stddev', () => {
  const doc = benchmark()
  doc.run_summary.with_skill.pass_rate = { mean: '0.85' } as never
  expect(validateBenchmarkJson(doc)).toEqual([
    { path: 'run_summary.with_skill.pass_rate.mean', message: 'must be a number' },
    { path: 'run_summary.with_skill.pass_rate.stddev', message: 'must be a number' },
  ])
})

test('benchmark: unknown keys inside run_summary levels are named', () => {
  const doc = benchmark()
  doc.run_summary.with_skill.pass_rate = { mean: 0.85, stddev: 0.05, median: 0.84 } as never
  ;(doc.run_summary.without_skill as Record<string, unknown>).extra_stat = {}
  ;(doc.run_summary as Record<string, unknown>).baseline = {}
  expect(validateBenchmarkJson(doc)).toEqual([
    { path: 'run_summary.with_skill.pass_rate.median', message: 'unknown key "median"' },
    { path: 'run_summary.without_skill.extra_stat', message: 'unknown key "extra_stat"' },
    { path: 'run_summary.baseline', message: 'unknown key "baseline"' },
  ])
})

test('benchmark: delta requires the three difference strings', () => {
  const doc = benchmark()
  doc.run_summary.delta = { pass_rate: '', bonus: '+1' } as never
  expect(validateBenchmarkJson(doc)).toEqual([
    { path: 'run_summary.delta.pass_rate', message: 'must be a non-empty string' },
    { path: 'run_summary.delta.time_seconds', message: 'must be a non-empty string' },
    { path: 'run_summary.delta.tokens', message: 'must be a non-empty string' },
    { path: 'run_summary.delta.bonus', message: 'unknown key "bonus"' },
  ])
})

test('benchmark: unknown root key and non-string notes entries', () => {
  const doc = { ...benchmark(), commentary: 'x' }
  doc.notes = ['fine', 4] as never
  expect(validateBenchmarkJson(doc)).toEqual([
    { path: 'commentary', message: 'unknown key "commentary"' },
    { path: 'notes[1]', message: 'must be a non-empty string' },
  ])
})
