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
    stages: result.stages.map((s): StageReport => {
      if (s.status === 'skipped') return { stage: s.stage, status: s.status, note: s.note }
      const findings = s.findings.map(f => ({ severity: f.severity, message: f.message, file: f.file, line: f.line }))
      if (s.stage === 'scenario') {
        return {
          stage: s.stage,
          status: s.status,
          findings,
          runs: s.runs.map(r => ({ evalId: r.evalId, cached: r.cached, status: r.status, durationSeconds: r.durationSeconds })),
        }
      }
      if (s.stage === 'grading') {
        return { stage: s.stage, status: s.status, findings, expectations: { passed: s.expectations.passed, total: s.expectations.total } }
      }
      if (s.stage === 'trigger') {
        return {
          stage: s.stage,
          status: s.status,
          findings,
          queries: { passed: s.queries.passed, total: s.queries.total },
          runs: s.runs.map(r => ({
            queryIndex: r.queryIndex,
            shouldTrigger: r.shouldTrigger,
            triggered: r.triggered,
            reps: r.reps,
            cached: r.cached,
            status: r.status,
          })),
        }
      }
      return { stage: s.stage, status: s.status, findings }
    }),
    summary: result.summary,
  }
}
