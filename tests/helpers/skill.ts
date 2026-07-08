import { join } from 'node:path'
import { splitFrontmatter } from '../../src/lib/parser/frontmatter'
import { extractSections } from '../../src/lib/parser/sections'
import { loadProfile, resolveRule } from '../../src/lib/profile/load'
import type { FileEntry, ParsedSkill, RuleContext } from '../../src/lib/types'

const profile = loadProfile(join(import.meta.dir, '../../profiles/default.yaml'))

/** Build a ParsedSkill from raw SKILL.md text without touching disk. */
export function skillFromRaw(raw: string, files: FileEntry[] = [], dirName = 'test-skill'): ParsedSkill {
  const normalized = raw.replace(/\r\n/g, '\n')
  const { fm, body, bodyLineOffset } = splitFrontmatter(normalized)
  const { h1, sections } = extractSections(body, bodyLineOffset)
  return {
    dir: `/virtual/${dirName}`,
    dirName,
    raw: normalized,
    frontmatter: fm,
    body: { raw: body, lineOffset: bodyLineOffset, h1, sections },
    files,
    dirs: [],
  }
}

/** Real default-profile options + anatomy for a rule ID. */
export function ctxFor(ruleId: string): RuleContext {
  return { options: resolveRule(profile.rules[ruleId]).options, anatomy: profile.anatomy }
}

/** Frontmatter + H1 + all seven canonical sections; override body parts per test. */
export function cleanSkillRaw(overrides: Partial<Record<string, string>> = {}): string {
  const s = (name: string, fallback: string) => overrides[name] ?? fallback
  return [
    '---',
    `name: test-skill`,
    `description: "${s('description', 'Use when exercising a lint rule in a unit test.')}"`,
    `version: ${s('version', '0.1.0')}`,
    '---',
    '# test-skill',
    '',
    '## Intent', '', s('intent', 'Exercise one rule.'), '',
    '## Inputs', '', s('inputs', 'None.'), '',
    '## Preconditions', '', s('preconditions', 'None.'), '',
    '## Procedure', '', s('procedure', '1. Run the rule.'), '',
    '## Output', '', s('output', 'Findings, or none.'), '',
    '## Examples', '', s('examples', 'Given the input `x`, the expected output is `y`.'), '',
    '## Anti-patterns', '', s('anti-patterns', 'None.'),
    '',
  ].join('\n')
}

/** Build a ParsedSkill[] corpus from raw SKILL.md texts without touching disk. */
export function corpusFromRaws(raws: string[], dirNames?: string[]): ParsedSkill[] {
  return raws.map((raw, i) => skillFromRaw(raw, [], dirNames?.[i] ?? `corpus-skill-${i + 1}`))
}
