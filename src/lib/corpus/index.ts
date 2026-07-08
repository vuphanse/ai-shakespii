import { runCorpusRules, runRules } from '../engine'
import { parseSkill } from '../parser'
import type { CorpusFinding, Finding, ParsedSkill, Profile } from '../types'
import { discoverSkills, type SkippedDir } from './discover'

export interface SkillReport {
  dir: string
  name: string | null
  findings: Finding[]
  runError: string | null
}

export interface CorpusResult {
  root: string
  skills: SkillReport[]
  corpusFindings: CorpusFinding[]
  skipped: SkippedDir[]
}

/**
 * Full corpus lint (spec §1): every discovered skill gets the complete
 * single-skill rule set; XS rules then run across the successfully parsed
 * skills. A skill that throws mid-lint is reported via runError and excluded
 * from the XS pass; the rest of the corpus still lints.
 */
export function lintCorpus(root: string, profile: Profile): CorpusResult {
  const { skillDirs, skipped } = discoverSkills(root)
  const parsed: ParsedSkill[] = []
  const skills: SkillReport[] = []
  for (const dir of skillDirs) {
    try {
      const skill = parseSkill(dir)
      const findings = runRules(skill, profile)
      parsed.push(skill)
      const name = skill.frontmatter.parsed?.['name']
      skills.push({ dir: skill.dir, name: typeof name === 'string' ? name : null, findings, runError: null })
    } catch (e) {
      skills.push({ dir, name: null, findings: [], runError: (e as Error).message })
    }
  }
  return { root, skills, corpusFindings: runCorpusRules(parsed, profile), skipped }
}
