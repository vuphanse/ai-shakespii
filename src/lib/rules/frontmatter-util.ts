import type { ParsedSkill } from '../types'

/** Absolute SKILL.md line of a frontmatter field's key, or 1 when unknown. */
export function fieldLine(skill: ParsedSkill, field: string): number {
  const raw = skill.frontmatter.raw
  if (raw === null) return 1
  const idx = raw.split('\n').findIndex(l => l.startsWith(`${field}:`))
  return idx === -1 ? 1 : idx + 2 // +2: line 1 is the opening fence
}
