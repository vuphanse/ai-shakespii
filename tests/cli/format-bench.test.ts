import { expect, test } from 'bun:test'
import { formatBenchPretty } from '../../src/cli/format/bench-pretty'

test('bench pretty block: exact bytes', () => {
  const doc = {
    metadata: { skill_name: 'compress', model: 'sonnet', runs_per_configuration: 3, harness_schema_version: 1 },
    runs: [],
    run_summary: {
      with_skill: {
        pass_rate: { mean: 0.9167, stddev: 0.1443, min: 0.75, max: 1 },
        time_seconds: { mean: 45.2, stddev: 3.1, min: 41, max: 49.5 },
        tokens: { mean: 5200.5, stddev: 300.25, min: 4800, max: 5600 },
      },
      without_skill: {
        pass_rate: { mean: 0.4167, stddev: 0.1443, min: 0.25, max: 0.5 },
        time_seconds: { mean: 32.2, stddev: 2.1, min: 30, max: 34.5 },
        tokens: { mean: 3500.5, stddev: 200.25, min: 3300, max: 3700 },
      },
      delta: { pass_rate: '+0.50', time_seconds: '+13.0', tokens: '+1700' },
    },
  }
  expect(formatBenchPretty(doc as never, 3, 18)).toBe(
    [
      'bench compress · model sonnet · 3 run(s)/config',
      '  with_skill      pass_rate 0.92 ±0.14 · time 45.2s · tokens 5201',
      '  without_skill   pass_rate 0.42 ±0.14 · time 32.2s · tokens 3501',
      '  delta           pass_rate +0.50 · time +13.0s · tokens +1700',
      '3/18 run(s) cached',
    ].join('\n'),
  )
})
