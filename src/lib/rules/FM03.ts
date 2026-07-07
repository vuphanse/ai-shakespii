import type { Rule } from '../types'
import { fieldLine } from './frontmatter-util'

export const FM03: Rule = {
  id: 'FM03',
  check(skill, ctx) {
    const desc = skill.frontmatter.parsed?.['description']
    if (typeof desc !== 'string') return []
    const warnChars = Number(ctx.options['warnChars'] ?? 500)
    const maxChars = Number(ctx.options['maxChars'] ?? 1024)
    const line = fieldLine(skill, 'description')
    if (desc.length > maxChars) {
      return [{ message: `description is ${desc.length} chars (hard limit ${maxChars})`, file: 'SKILL.md', line, severity: 'error' }]
    }
    if (desc.length > warnChars) {
      return [{ message: `description is ${desc.length} chars (warn threshold ${warnChars})`, file: 'SKILL.md', line }]
    }
    return []
  },
}
