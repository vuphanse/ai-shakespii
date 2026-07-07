import type { Rule, RuleFinding } from '../types'
import { fieldLine } from './frontmatter-util'

const ALLOWED = new Set(['name', 'description', 'version', 'compatibility', 'license', 'allowed-tools'])

export const FM01: Rule = {
  id: 'FM01',
  check(skill) {
    const fm = skill.frontmatter
    if (fm.raw === null) {
      return [{
        message: fm.error?.message ?? 'frontmatter missing (file must open with a --- fence)',
        file: 'SKILL.md',
        line: fm.error?.line ?? 1,
      }]
    }
    if (fm.parsed === null) {
      return [{
        message: `frontmatter YAML does not parse: ${fm.error?.message ?? 'unknown error'}`,
        file: 'SKILL.md',
        line: fm.error?.line ?? 1,
      }]
    }
    const out: RuleFinding[] = []
    for (const field of ['name', 'description']) {
      const v = fm.parsed[field]
      if (typeof v !== 'string' || v.trim() === '') {
        out.push({ message: `frontmatter field "${field}" must be a non-empty string`, file: 'SKILL.md', line: fieldLine(skill, field) })
      }
    }
    for (const key of Object.keys(fm.parsed)) {
      if (!ALLOWED.has(key)) {
        out.push({ message: `unknown frontmatter field "${key}"`, file: 'SKILL.md', line: fieldLine(skill, key), severity: 'warn' })
      }
    }
    return out
  },
}
