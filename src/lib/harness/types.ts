import type { Severity } from '../types'
import type { ScenarioRunMeta } from './executor'

export interface HarnessFinding {
  severity: Severity
  message: string
  file: string
  line: number | null
}

export type StageReport =
  | { stage: 'deterministic'; status: 'pass' | 'fail'; findings: HarnessFinding[] }
  | { stage: 'scenario'; status: 'pass' | 'fail'; findings: HarnessFinding[]; runs: ScenarioRunMeta[] }
  | { stage: 'grading'; status: 'pass' | 'fail'; findings: HarnessFinding[]; expectations: { passed: number; total: number } }
  | { stage: 'scenario' | 'grading'; status: 'skipped'; note: string }

export interface TestResult {
  skill: { dir: string; name: string | null }
  stages: StageReport[]
  summary: { errors: number; warnings: number }
}
