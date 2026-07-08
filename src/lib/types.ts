export type Severity = 'error' | 'warn'

export interface FrontmatterInfo {
  raw: string | null
  parsed: Record<string, unknown> | null
  error: { message: string; line: number } | null
}

export interface Section {
  heading: string
  normalized: string
  depth: 2 | 3
  startLine: number
  endLine: number
  text: string
}

export interface FileEntry {
  relPath: string
  size: number
  text: string | null
}

export interface BodyInfo {
  raw: string
  lineOffset: number
  h1: string | null
  sections: Section[]
}

export interface ParsedSkill {
  dir: string
  dirName: string
  raw: string
  frontmatter: FrontmatterInfo
  body: BodyInfo
  files: FileEntry[]
  dirs: string[]
}

export interface AnatomySection {
  canonical: string
  aliases: string[]
  level: Severity
}
export type AnatomyTable = Record<string, AnatomySection>

export interface RuleContext {
  options: Record<string, unknown>
  anatomy: AnatomyTable
}

export interface RuleFinding {
  message: string
  file: string
  line: number | null
  severity?: Severity
}

export interface Finding {
  ruleId: string
  severity: Severity
  message: string
  file: string
  line: number | null
}

export interface Rule {
  id: string
  check(skill: ParsedSkill, ctx: RuleContext): RuleFinding[]
}

export type RuleSeverity = Severity | 'off'
export type RuleSetting = RuleSeverity | { severity: RuleSeverity; options?: Record<string, unknown> }

export interface Profile {
  profile: string
  provenance: Record<string, string>
  anatomy: AnatomyTable
  rules: Record<string, RuleSetting>
}

export interface CorpusSite {
  skill: string
  file: 'SKILL.md'
  startLine: number
  endLine: number
}

export interface CorpusRuleFinding {
  message: string
  sites: CorpusSite[]
}

export interface CorpusFinding {
  ruleId: string
  severity: Severity
  message: string
  sites: CorpusSite[]
}

export interface CorpusRule {
  id: string
  check(skills: ParsedSkill[], ctx: RuleContext): CorpusRuleFinding[]
}
