import type { Rule, RuleFinding } from '../types'
import { fieldLine } from './frontmatter-util'

const FIRST_PERSON = [/\bI\b/, /\b(my|me|we|our|mine|us)\b/i]

export const FM04: Rule = {
  id: 'FM04',
  check(skill, ctx) {
    const desc = skill.frontmatter.parsed?.['description']
    if (typeof desc !== 'string' || desc.trim() === '') return []
    const line = fieldLine(skill, 'description')
    const out: RuleFinding[] = []
    if (FIRST_PERSON.some(re => re.test(desc))) {
      out.push({ message: 'description must be third person (first-person pronoun found)', file: 'SKILL.md', line })
    }
    const patterns = (ctx.options['triggerPatterns'] as string[] | undefined) ?? []
    const lead = desc.trimStart().toLowerCase()
    if (!patterns.some(p => lead.startsWith(p.toLowerCase()))) {
      out.push({
        message: `description must begin with a trigger phrase (one of: ${patterns.join(', ')})`,
        file: 'SKILL.md',
        line,
      })
    }
    return out
  },
}
