/** Byte-compatible with skill-creator references/schemas.md — do not rename fields. */

export interface EvalCase {
  id: number
  prompt: string
  expected_output: string
  files?: string[]
  expectations: string[]
}

export interface EvalsJson {
  skill_name: string
  evals: EvalCase[]
}

export interface GradingExpectation {
  text: string
  passed: boolean
  evidence: string
}

export interface GradingJson {
  expectations: GradingExpectation[]
  summary: { passed: number; failed: number; total: number; pass_rate: number }
  execution_metrics?: Record<string, unknown>
  timing?: Record<string, unknown>
  claims?: unknown[]
  user_notes_summary?: Record<string, unknown>
  eval_feedback?: Record<string, unknown>
}

export interface BenchmarkStat {
  mean: number
  stddev: number
  min?: number
  max?: number
}

export interface BenchmarkConfigSummary {
  pass_rate: BenchmarkStat
  time_seconds: BenchmarkStat
  tokens: BenchmarkStat
}

export interface BenchmarkRun {
  eval_id: number
  eval_name?: string
  configuration: 'with_skill' | 'without_skill'
  run_number: number
  result: {
    pass_rate: number
    passed: number
    failed: number
    total: number
    time_seconds: number
    tokens: number
    tool_calls?: number
    errors: number
  }
  expectations?: unknown[]
  notes?: string[]
}

export interface BenchmarkJson {
  metadata: Record<string, unknown>
  runs: BenchmarkRun[]
  run_summary: {
    with_skill: BenchmarkConfigSummary
    without_skill: BenchmarkConfigSummary
    delta: { pass_rate: string; time_seconds: string; tokens: string }
  }
  notes?: string[]
}
