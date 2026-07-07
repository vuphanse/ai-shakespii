import type { Rule, RuleFinding } from '../types'
import { fieldLine } from './frontmatter-util'

export const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

export const FM02: Rule = {
  id: 'FM02',
  check(skill) {
    const name = skill.frontmatter.parsed?.['name']
    if (typeof name !== 'string' || name.trim() === '') return []
    const line = fieldLine(skill, 'name')
    const out: RuleFinding[] = []
    if (!NAME_RE.test(name)) {
      out.push({ message: `name "${name}" must be kebab-case (${NAME_RE.source})`, file: 'SKILL.md', line })
    }
    if (name.length > 64) {
      out.push({ message: `name "${name}" exceeds 64 characters`, file: 'SKILL.md', line })
    }
    if (name !== skill.dirName) {
      out.push({ message: `name "${name}" must equal directory name "${skill.dirName}"`, file: 'SKILL.md', line })
    }
    return out
  },
}
