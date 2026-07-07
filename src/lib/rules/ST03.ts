import { normalizeHeading } from '../parser/sections'
import type { Rule, RuleFinding } from '../types'

export const ST03: Rule = {
  id: 'ST03',
  check(skill, ctx) {
    const min = Number(ctx.options['tocMinLines'] ?? 100)
    const out: RuleFinding[] = []
    for (const f of skill.files) {
      if (f.text === null || !f.relPath.endsWith('.md')) continue
      const lines = f.text.split('\n')
      if (lines.length <= min) continue
      const head = lines.slice(0, 40)
      const tocHeading = head.some(ln => {
        const h = /^#{1,6}\s+(.+)$/.exec(ln)
        if (!h) return false
        const n = normalizeHeading(h[1])
        return n === 'contents' || n === 'table of contents'
      })
      const anchors = head.join('\n').match(/\]\(#[^)]*\)/g)?.length ?? 0
      if (!tocHeading && anchors < 3) {
        out.push({ message: `${f.relPath} is ${lines.length} lines with no table of contents`, file: f.relPath, line: null })
      }
    }
    return out
  },
}
