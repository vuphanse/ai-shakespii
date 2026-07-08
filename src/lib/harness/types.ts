import type { Severity } from '../types'

export interface HarnessFinding {
  severity: Severity
  message: string
  file: string
  line: number | null
}

export type StageReport =
  | { stage: 'deterministic'; status: 'pass' | 'fail'; findings: HarnessFinding[] }
  | { stage: 'scenario' | 'grading'; status: 'unavailable'; note: 'ships in M4b' }

export interface TestResult {
  skill: { dir: string; name: string | null }
  stages: StageReport[]
  summary: { errors: number; warnings: number }
}
