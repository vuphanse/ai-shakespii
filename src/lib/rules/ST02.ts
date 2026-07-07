import { extractLinks } from '../parser/sections'
import type { Rule, RuleFinding } from '../types'

const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/

export const ST02: Rule = {
  id: 'ST02',
  check(skill) {
    const out: RuleFinding[] = []
    for (const { target, line } of extractLinks(skill.body.raw, skill.body.lineOffset)) {
      if (SCHEME.test(target) || target.startsWith('#')) continue
      let decoded: string
      try {
        decoded = decodeURIComponent(target.split('#')[0])
      } catch {
        decoded = target.split('#')[0]
      }
      const clean = decoded.replace(/^\.\//, '').replace(/\/$/, '')
      if (clean === '') continue
      if (clean.split('/').includes('..')) {
        out.push({ message: `link target "${target}" escapes the skill directory (contains ../)`, file: 'SKILL.md', line })
        continue
      }
      const exists = skill.files.some(f => f.relPath === clean || f.relPath.startsWith(`${clean}/`))
      if (!exists) {
        out.push({ message: `link target "${target}" does not exist in the skill directory`, file: 'SKILL.md', line })
      }
    }
    return out
  },
}
