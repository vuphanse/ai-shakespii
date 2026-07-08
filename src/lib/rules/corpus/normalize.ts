import type { ParsedSkill } from '../../types'

export interface BodyLine {
  text: string
  line: number
}

/**
 * SKILL.md body as (text, originalLine) pairs: trailing whitespace stripped,
 * blank lines dropped. Blank lines neither break duplicate runs nor count
 * toward thresholds; line numbers map back to the original file (spec §2).
 */
export function bodyLines(skill: ParsedSkill): BodyLine[] {
  const out: BodyLine[] = []
  skill.body.raw.split('\n').forEach((ln, i) => {
    const text = ln.replace(/\s+$/, '')
    if (text === '') return
    out.push({ text, line: i + skill.body.lineOffset })
  })
  return out
}
