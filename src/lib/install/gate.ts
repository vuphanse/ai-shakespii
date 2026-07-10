import type { HarnessFinding } from '../harness/types'
import type { Finding } from '../types'

export interface GateInput {
  lintFindings: Finding[]
  testFindings: HarnessFinding[] | null
}

export interface GateVerdict {
  lint: { status: 'pass' | 'fail'; errors: number; warnings: number }
  test: { status: 'pass' | 'fail' | 'skipped'; errors: number; warnings: number }
  pass: boolean
}

export function decideGate(input: GateInput): GateVerdict {
  const lintErrors = input.lintFindings.filter(f => f.severity === 'error').length
  const lint: GateVerdict['lint'] = {
    status: lintErrors > 0 ? 'fail' : 'pass',
    errors: lintErrors,
    warnings: input.lintFindings.length - lintErrors,
  }
  let test: GateVerdict['test']
  if (input.testFindings === null) {
    test = { status: 'skipped', errors: 0, warnings: 0 }
  } else {
    const errors = input.testFindings.filter(f => f.severity === 'error').length
    test = { status: errors > 0 ? 'fail' : 'pass', errors, warnings: input.testFindings.length - errors }
  }
  return { lint, test, pass: lint.status === 'pass' && test.status !== 'fail' }
}
