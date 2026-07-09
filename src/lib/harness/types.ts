import type { Severity } from '../types'
import type { ScenarioRunMeta } from './executor'

export interface HarnessFinding {
  severity: Severity
  message: string
  file: string
  line: number | null
}

export interface TriggerRunMeta {
  queryIndex: number
  shouldTrigger: boolean
  triggered: number
  reps: number
  cached: number
  status: 'ok' | 'timeout' | 'nonzero-exit'
}

export type StageReport =
  | { stage: 'deterministic'; status: 'pass' | 'fail'; findings: HarnessFinding[] }
  | { stage: 'scenario'; status: 'pass' | 'fail'; findings: HarnessFinding[]; runs: ScenarioRunMeta[] }
  | { stage: 'grading'; status: 'pass' | 'fail'; findings: HarnessFinding[]; expectations: { passed: number; total: number } }
  | { stage: 'trigger'; status: 'pass' | 'fail'; findings: HarnessFinding[]; queries: { passed: number; total: number }; runs: TriggerRunMeta[] }
  | { stage: 'scenario' | 'grading' | 'trigger'; status: 'skipped'; note: string }

export interface TestResult {
  skill: { dir: string; name: string | null }
  stages: StageReport[]
  summary: { errors: number; warnings: number }
}
