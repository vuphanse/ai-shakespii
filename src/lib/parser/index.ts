import { readFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import type { ParsedSkill } from '../types'
import { splitFrontmatter } from './frontmatter'
import { extractSections } from './sections'
import { walkInventory } from './inventory'

export { normalizeHeading, extractLinks } from './sections'

export function parseSkill(skillDir: string): ParsedSkill {
  const dir = resolve(skillDir)
  const raw = readFileSync(join(dir, 'SKILL.md'), 'utf8')
  const { fm, body, bodyLineOffset } = splitFrontmatter(raw)
  const { h1, sections } = extractSections(body, bodyLineOffset)
  return {
    dir,
    dirName: basename(dir),
    raw,
    frontmatter: fm,
    body: { raw: body, lineOffset: bodyLineOffset, h1, sections },
    files: walkInventory(dir),
  }
}
