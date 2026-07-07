import { normalizeHeading } from '../parser/sections'
import type { AnatomySection, ParsedSkill, Section } from '../types'

export function matchAnatomySections(skill: ParsedSkill, entry: AnatomySection): Section[] {
  const names = new Set([entry.canonical, ...entry.aliases].map(normalizeHeading))
  return skill.body.sections.filter(s => names.has(s.normalized))
}
