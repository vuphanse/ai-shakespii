import { expect, test } from 'bun:test'
import { decideGate } from '../../src/lib/install/gate'
import type { Finding } from '../../src/lib/types'
import type { HarnessFinding } from '../../src/lib/harness/types'

const lintErr: Finding = { ruleId: 'FM04', severity: 'error', message: 'bad description', file: 'SKILL.md', line: 3 }
const lintWarn: Finding = { ruleId: 'TR02', severity: 'warn', message: 'no triggers.json', file: 'SKILL.md', line: null }
const testErr: HarnessFinding = { severity: 'error', message: 'not valid JSON', file: 'evals/evals.json', line: null }
const testWarn: HarnessFinding = { severity: 'warn', message: 'only 2 eval case(s)', file: 'evals/evals.json', line: null }

test('clean skill without evals: pass, test skipped', () => {
  expect(decideGate({ lintFindings: [], testFindings: null })).toEqual({
    lint: { status: 'pass', errors: 0, warnings: 0 },
    test: { status: 'skipped', errors: 0, warnings: 0 },
    pass: true,
  })
})

test('lint warnings alone never block', () => {
  const v = decideGate({ lintFindings: [lintWarn, lintWarn], testFindings: null })
  expect(v.lint).toEqual({ status: 'pass', errors: 0, warnings: 2 })
  expect(v.pass).toBe(true)
})

test('one lint error blocks', () => {
  const v = decideGate({ lintFindings: [lintErr, lintWarn], testFindings: null })
  expect(v.lint).toEqual({ status: 'fail', errors: 1, warnings: 1 })
  expect(v.pass).toBe(false)
})

test('deterministic test error blocks even when lint is clean', () => {
  const v = decideGate({ lintFindings: [], testFindings: [testErr] })
  expect(v.test).toEqual({ status: 'fail', errors: 1, warnings: 0 })
  expect(v.pass).toBe(false)
})

test('deterministic test warnings alone pass', () => {
  const v = decideGate({ lintFindings: [], testFindings: [testWarn] })
  expect(v.test).toEqual({ status: 'pass', errors: 0, warnings: 1 })
  expect(v.pass).toBe(true)
})

test('empty test findings array is a pass, not skipped', () => {
  expect(decideGate({ lintFindings: [], testFindings: [] }).test.status).toBe('pass')
})
