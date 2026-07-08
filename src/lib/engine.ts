import type { CorpusFinding, CorpusRule, Finding, ParsedSkill, Profile, Rule } from './types'
import { resolveRule } from './profile/load'
import { rules } from './rules'
import { corpusRules } from './rules/corpus'

const cmp = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0)

export function runRulesWith(registry: Rule[], skill: ParsedSkill, profile: Profile): Finding[] {
  const findings: Finding[] = []
  for (const rule of registry) {
    const setting = profile.rules[rule.id]
    if (setting === undefined) continue
    const { severity, options } = resolveRule(setting)
    if (severity === 'off') continue
    for (const f of rule.check(skill, { options, anatomy: profile.anatomy })) {
      findings.push({ ruleId: rule.id, message: f.message, file: f.file, line: f.line, severity: f.severity ?? severity })
    }
  }
  return findings.sort(
    (a, b) =>
      cmp(a.file, b.file) ||
      (a.line ?? Number.MAX_SAFE_INTEGER) - (b.line ?? Number.MAX_SAFE_INTEGER) ||
      cmp(a.ruleId, b.ruleId),
  )
}

export function runRules(skill: ParsedSkill, profile: Profile): Finding[] {
  return runRulesWith(rules, skill, profile)
}

export function runCorpusRulesWith(registry: CorpusRule[], skills: ParsedSkill[], profile: Profile): CorpusFinding[] {
  const findings: CorpusFinding[] = []
  for (const rule of registry) {
    const setting = profile.rules[rule.id]
    if (setting === undefined) continue
    const { severity, options } = resolveRule(setting)
    if (severity === 'off') continue
    for (const f of rule.check(skills, { options, anatomy: profile.anatomy })) {
      findings.push({ ruleId: rule.id, severity, message: f.message, sites: f.sites })
    }
  }
  return findings.sort((a, b) => cmp(a.ruleId, b.ruleId) || cmp(a.sites[0]?.skill ?? '', b.sites[0]?.skill ?? ''))
}

export function runCorpusRules(skills: ParsedSkill[], profile: Profile): CorpusFinding[] {
  return runCorpusRulesWith(corpusRules, skills, profile)
}
