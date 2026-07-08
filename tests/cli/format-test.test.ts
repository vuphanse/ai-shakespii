import { expect, test } from 'bun:test'
import type { TestResult } from '../../src/lib/harness/types'
import { jsonTestReport } from '../../src/cli/format/test-json'
import { formatTestPretty } from '../../src/cli/format/test-pretty'

type Finding = { severity: 'error' | 'warn'; message: string; file: string; line: number | null }

const result = (errors: number, warnings: number, findings: Finding[]): TestResult => ({
  skill: { dir: '/abs/demo-skill', name: 'demo-skill' },
  stages: [
    { stage: 'deterministic', status: errors > 0 ? 'fail' : 'pass', findings },
    { stage: 'scenario', status: 'unavailable', note: 'ships in M4b' },
    { stage: 'grading', status: 'unavailable', note: 'ships in M4b' },
  ],
  summary: { errors, warnings },
})

test('jsonTestReport: exact top-level shape and key order', () => {
  const rep = jsonTestReport(result(0, 0, []))
  expect(Object.keys(rep)).toEqual(['version', 'mode', 'skill', 'stages', 'summary'])
  expect(rep.version).toBe(1)
  expect(rep.mode).toBe('test')
  expect(rep.skill).toEqual({ dir: '/abs/demo-skill', name: 'demo-skill' })
  expect(rep.stages).toHaveLength(3)
  expect(rep.summary).toEqual({ errors: 0, warnings: 0 })
})

test('jsonTestReport: finding key order is severity, message, file, line', () => {
  const rep = jsonTestReport(result(1, 0, [{ severity: 'error', message: 'boom', file: 'evals/evals.json', line: null }]))
  const stage = rep.stages[0] as { findings: unknown[] }
  expect(Object.keys(stage.findings[0] as Record<string, unknown>)).toEqual(['severity', 'message', 'file', 'line'])
})

test('pretty: passing skill', () => {
  const out = formatTestPretty(result(0, 0, []))
  expect(out).toContain('demo-skill')
  expect(out).toContain('deterministic  PASS')
  expect(out).toContain('scenario       unavailable (ships in M4b)')
  expect(out).toContain('grading        unavailable (ships in M4b)')
  expect(out).toContain('deterministic: 0 errors, 0 warnings · scenario/grading pending M4b')
})

test('pretty: failing skill lists findings and pluralizes correctly', () => {
  const out = formatTestPretty(result(1, 1, [
    { severity: 'error', message: 'evals[2].prompt: must be a non-empty string', file: 'evals/evals.json', line: null },
    { severity: 'warn', message: 'only 2 eval case(s) — Anthropic guidance is a minimum of three', file: 'evals/evals.json', line: null },
  ]))
  expect(out).toContain('deterministic  FAIL')
  expect(out).toContain('error  evals/evals.json  evals[2].prompt: must be a non-empty string')
  expect(out).toContain('warn   evals/evals.json  only 2 eval case(s)')
  expect(out).toContain('deterministic: 1 error, 1 warning · scenario/grading pending M4b')
})
