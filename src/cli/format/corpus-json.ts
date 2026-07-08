import type { CorpusResult } from '../../lib/corpus'
import type { CorpusFinding } from '../../lib/types'

interface SkillEntry {
  skill: { dir: string; name: string | null }
  summary?: { errors: number; warnings: number }
  findings?: Array<{ ruleId: string; severity: string; file: string; line: number | null; message: string }>
  runError?: string
}

export interface CorpusJsonReport {
  version: 1
  mode: 'corpus'
  profile: string
  root: string
  skills: SkillEntry[]
  corpusFindings: CorpusFinding[]
  skipped: Array<{ dir: string; reason: string }>
  summary: { skills: number; skipped: number; errors: number; warnings: number }
}

export function jsonCorpusReport(result: CorpusResult, profileName: string): CorpusJsonReport {
  let errors = 0
  let warnings = 0
  const skills: SkillEntry[] = result.skills.map(s => {
    if (s.runError !== null) return { skill: { dir: s.dir, name: s.name }, runError: s.runError }
    const skillErrors = s.findings.filter(f => f.severity === 'error').length
    errors += skillErrors
    warnings += s.findings.length - skillErrors
    return {
      skill: { dir: s.dir, name: s.name },
      summary: { errors: skillErrors, warnings: s.findings.length - skillErrors },
      findings: s.findings.map(f => ({ ruleId: f.ruleId, severity: f.severity, file: f.file, line: f.line, message: f.message })),
    }
  })
  for (const f of result.corpusFindings) {
    if (f.severity === 'error') errors++
    else warnings++
  }
  return {
    version: 1,
    mode: 'corpus',
    profile: profileName,
    root: result.root,
    skills,
    corpusFindings: result.corpusFindings,
    skipped: result.skipped,
    summary: { skills: result.skills.length, skipped: result.skipped.length, errors, warnings },
  }
}
