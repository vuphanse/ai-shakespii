import { textOutsideFences } from '../parser/sections'
import type { Rule } from '../types'

const PIPE_ROW = /^\s*\|.*\|\s*$/
const DELIMITER_ROW = /^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/

/** True only when a pipe table's HEADER row (the row directly above the delimiter row) carries a Reality column. */
function hasRealityHeader(text: string): boolean {
  const lines = text.split('\n')
  return lines.some((ln, i) => {
    if (!PIPE_ROW.test(ln)) return false
    if (!/\|[^|\n]*reality[^|\n]*\|/i.test(ln)) return false
    return DELIMITER_ROW.test(lines[i + 1] ?? '')
  })
}

export const ST05: Rule = {
  id: 'ST05',
  check(skill) {
    const text = textOutsideFences(skill.body.raw)
    const triggered =
      /iron law/i.test(text) ||
      /<[A-Z][A-Z-]+>/.test(text) ||
      (text.match(/\b(MUST|NEVER)\b/g)?.length ?? 0) >= 3
    if (!triggered) return []
    const hasRealityTable = hasRealityHeader(text)
    const hasRedFlags = /^#{1,6}\s+.*red flags?/im.test(text)
    const missing: string[] = []
    if (!hasRealityTable) missing.push('a rationalization table with a Reality column')
    if (!hasRedFlags) missing.push('a Red Flags heading')
    if (missing.length === 0) return []
    return [{
      message: `discipline emphasis found without ${missing.join(' or ')}`,
      file: 'SKILL.md',
      line: null,
    }]
  },
}
