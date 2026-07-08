import { expect, test } from 'bun:test'
import type { StageReport, TestResult } from '../../src/lib/harness/types'
import { jsonTestReport } from '../../src/cli/format/test-json'
import { formatTestPretty } from '../../src/cli/format/test-pretty'

type Finding = { severity: 'error' | 'warn'; message: string; file: string; line: number | null }

const skipped = (note: string): StageReport[] => [
  { stage: 'scenario', status: 'skipped', note },
  { stage: 'grading', status: 'skipped', note },
]

const result = (errors: number, warnings: number, findings: Finding[], llm?: StageReport[]): TestResult => ({
  skill: { dir: '/abs/demo-skill', name: 'demo-skill' },
  stages: [
    { stage: 'deterministic', status: findings.some(f => f.severity === 'error') ? 'fail' : 'pass', findings },
    ...(llm ?? skipped('pass --run to execute LLM stages')),
  ],
  summary: { errors, warnings },
})

const executed = (): StageReport[] => [
  {
    stage: 'scenario',
    status: 'fail',
    findings: [{ severity: 'error', message: 'eval 1: executor timeout — timed out after 300000ms', file: 'evals/evals.json', line: null }],
    runs: [
      { evalId: 1, cached: false, status: 'timeout', durationSeconds: 300 },
      { evalId: 2, cached: true, status: 'ok', durationSeconds: 0 },
      { evalId: 3, cached: false, status: 'ok', durationSeconds: 41.5 },
    ],
  },
  {
    stage: 'grading',
    status: 'fail',
    findings: [{ severity: 'error', message: 'eval 3 expectation failed: "x" — no evidence', file: 'evals/evals.json', line: null }],
    expectations: { passed: 5, total: 6 },
  },
]

test('jsonTestReport: exact top-level shape and key order', () => {
  const rep = jsonTestReport(result(0, 0, []))
  expect(Object.keys(rep)).toEqual(['version', 'mode', 'skill', 'stages', 'summary'])
  expect(rep.version).toBe(1)
  expect(rep.mode).toBe('test')
  expect(rep.stages).toHaveLength(3)
})

test('jsonTestReport: skipped stage key order is stage, status, note', () => {
  const rep = jsonTestReport(result(0, 0, []))
  expect(Object.keys(rep.stages[1] as Record<string, unknown>)).toEqual(['stage', 'status', 'note'])
  expect(rep.stages[1]).toEqual({ stage: 'scenario', status: 'skipped', note: 'pass --run to execute LLM stages' })
})

test('jsonTestReport: executed scenario and grading key orders, runs entry order', () => {
  const rep = jsonTestReport(result(2, 0, [], executed()))
  const scenario = rep.stages[1] as Record<string, unknown>
  expect(Object.keys(scenario)).toEqual(['stage', 'status', 'findings', 'runs'])
  expect(Object.keys((scenario.runs as Record<string, unknown>[])[0])).toEqual(['evalId', 'cached', 'status', 'durationSeconds'])
  const grading = rep.stages[2] as Record<string, unknown>
  expect(Object.keys(grading)).toEqual(['stage', 'status', 'findings', 'expectations'])
  expect(Object.keys(grading.expectations as Record<string, unknown>)).toEqual(['passed', 'total'])
})

test('jsonTestReport: finding key order is severity, message, file, line', () => {
  const rep = jsonTestReport(result(1, 0, [{ severity: 'error', message: 'boom', file: 'evals/evals.json', line: null }]))
  const stage = rep.stages[0] as { findings: unknown[] }
  expect(Object.keys(stage.findings[0] as Record<string, unknown>)).toEqual(['severity', 'message', 'file', 'line'])
})

test('pretty: no --run shows skipped stages and the skip summary', () => {
  const out = formatTestPretty(result(0, 0, []))
  expect(out).toContain('deterministic  PASS')
  expect(out).toContain('scenario       skipped (pass --run to execute LLM stages)')
  expect(out).toContain('grading        skipped (pass --run to execute LLM stages)')
  expect(out).toContain('deterministic: 0 errors, 0 warnings · scenario/grading skipped (pass --run)')
})

test('pretty: deterministic failure under --run shows the blocked summary', () => {
  const out = formatTestPretty(
    result(1, 0, [{ severity: 'error', message: 'boom', file: 'evals/evals.json', line: null }], skipped('deterministic stage failed')),
  )
  expect(out).toContain('deterministic: 1 error, 0 warnings · scenario/grading skipped (deterministic stage failed)')
})

test('pretty: executed stages show PASS/FAIL, findings, and the run summary line', () => {
  const out = formatTestPretty(result(0, 0, [], executed()))
  expect(out).toContain('scenario       FAIL')
  expect(out).toContain('error  evals/evals.json  eval 1: executor timeout — timed out after 300000ms')
  expect(out).toContain('grading        FAIL')
  expect(out).toContain('deterministic: 0 errors, 0 warnings · scenario: 2/3 runs ok (1 cached) · grading: 5/6 expectations passed')
})

test('pretty: singular pluralization in the executed summary', () => {
  const llm: StageReport[] = [
    { stage: 'scenario', status: 'pass', findings: [], runs: [{ evalId: 1, cached: false, status: 'ok', durationSeconds: 2 }] },
    { stage: 'grading', status: 'pass', findings: [], expectations: { passed: 1, total: 1 } },
  ]
  const out = formatTestPretty(result(0, 0, [], llm))
  expect(out).toContain('scenario: 1/1 run ok (0 cached) · grading: 1/1 expectation passed')
})
