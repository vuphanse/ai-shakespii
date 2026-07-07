import type { Finding, ParsedSkill } from '../../lib/types'

export interface JsonReport {
  version: 1
  skill: { dir: string; name: string | null }
  profile: string
  summary: { errors: number; warnings: number }
  findings: Finding[]
}

export function jsonReport(skill: ParsedSkill, profileName: string, findings: Finding[]): JsonReport {
  const errors = findings.filter(f => f.severity === 'error').length
  const name = skill.frontmatter.parsed?.['name']
  return {
    version: 1,
    skill: { dir: skill.dir, name: typeof name === 'string' ? name : null },
    profile: profileName,
    summary: { errors, warnings: findings.length - errors },
    findings: findings.map(f => ({ ruleId: f.ruleId, severity: f.severity, file: f.file, line: f.line, message: f.message })),
  }
}
