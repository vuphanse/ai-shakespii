import type { Rule, RuleFinding } from '../types'

export const ST01: Rule = {
  id: 'ST01',
  check(skill, ctx) {
    const maxWords = Number(ctx.options['maxWords'] ?? 2000)
    const maxLines = Number(ctx.options['maxLines'] ?? 500)
    const hardMaxWords = Number(ctx.options['hardMaxWords'] ?? 3000)
    const out: RuleFinding[] = []
    if (skill.body.h1 === null) {
      out.push({ message: 'no H1 title found', file: 'SKILL.md', line: null })
    }
    const words = skill.body.raw.split(/\s+/).filter(w => w !== '').length
    const lines = skill.body.raw.split('\n').length
    if (words > hardMaxWords) {
      out.push({ message: `body is ${words} words (hard limit ${hardMaxWords})`, file: 'SKILL.md', line: null, severity: 'error' })
    } else if (words > maxWords) {
      out.push({ message: `body is ${words} words (budget ${maxWords})`, file: 'SKILL.md', line: null })
    }
    if (lines > maxLines) {
      out.push({ message: `body is ${lines} lines (budget ${maxLines})`, file: 'SKILL.md', line: null })
    }
    return out
  },
}
