import type { ParsedSkill } from '../types'
import { runDeterministic } from './deterministic'
import type { StageReport, TestResult } from './types'

export type { HarnessFinding, StageReport, TestResult } from './types'

export function testSkill(skill: ParsedSkill): TestResult {
  const findings = runDeterministic(skill)
  const errors = findings.filter(f => f.severity === 'error').length
  const warnings = findings.length - errors
  const stages: StageReport[] = [
    { stage: 'deterministic', status: errors > 0 ? 'fail' : 'pass', findings },
    { stage: 'scenario', status: 'unavailable', note: 'ships in M4b' },
    { stage: 'grading', status: 'unavailable', note: 'ships in M4b' },
  ]
  const name = skill.frontmatter.parsed?.['name']
  return {
    skill: { dir: skill.dir, name: typeof name === 'string' ? name : null },
    stages,
    summary: { errors, warnings },
  }
}
