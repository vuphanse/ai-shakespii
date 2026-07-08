import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { runCorpusRules, runRulesWith } from '../../src/lib/engine'
import { loadProfile } from '../../src/lib/profile/load'
import { rules } from '../../src/lib/rules'
import { corpusRules } from '../../src/lib/rules/corpus'
import { cleanSkillRaw, corpusFromRaws, skillFromRaw } from '../helpers/skill'

const profile = loadProfile(join(import.meta.dir, '../../profiles/default.yaml'))

test('corpus registry is [XS01, XS02]', () => {
  expect(corpusRules.map(r => r.id)).toEqual(['XS01', 'XS02'])
})

test('runCorpusRules stamps profile severity on corpus findings', () => {
  const raw = cleanSkillRaw()
  const findings = runCorpusRules(corpusFromRaws([raw, raw], ['a-clone', 'b-clone']), profile)
  expect(findings.length).toBeGreaterThan(0)
  for (const f of findings) expect(f.severity).toBe('warn')
  expect(findings.map(f => f.ruleId)).toContain('XS02')
})

test('off disables a corpus rule', () => {
  const raw = cleanSkillRaw()
  const off = { ...profile, rules: { ...profile.rules, XS01: 'off' as const, XS02: 'off' as const } }
  expect(runCorpusRules(corpusFromRaws([raw, raw], ['a-clone', 'b-clone']), off)).toEqual([])
})

test('off disables a single-skill rule', () => {
  const skill = skillFromRaw(cleanSkillRaw({ procedure: 'TODO(shakespii): fill this in' }))
  expect(runRulesWith(rules, skill, profile).some(f => f.ruleId === 'PH01')).toBe(true)
  const off = { ...profile, rules: { ...profile.rules, PH01: 'off' as const } }
  expect(runRulesWith(rules, skill, off).some(f => f.ruleId === 'PH01')).toBe(false)
})
