import type { StageReport, TestResult } from '../../lib/harness/types'

export interface TestJsonReport {
  version: 1
  mode: 'test'
  skill: { dir: string; name: string | null }
  stages: StageReport[]
  summary: { errors: number; warnings: number }
}

export function jsonTestReport(result: TestResult): TestJsonReport {
  return {
    version: 1,
    mode: 'test',
    skill: result.skill,
    stages: result.stages.map(s =>
      s.stage === 'deterministic'
        ? { stage: s.stage, status: s.status, findings: s.findings.map(f => ({ severity: f.severity, message: f.message, file: f.file, line: f.line })) }
        : { stage: s.stage, status: s.status, note: s.note },
    ),
    summary: result.summary,
  }
}
