import type { Rule } from '../types'
import { matchAnatomySections } from './anatomy'

function findMarker(text: string, marker: string): number {
  const t = text.toLowerCase()
  const m = marker.toLowerCase()
  if (/^[a-z ]+$/.test(m)) {
    const re = new RegExp(`\\b${m.replace(/ /g, '\\s+')}\\b`)
    const hit = re.exec(t)
    return hit ? hit.index : -1
  }
  return t.indexOf(m) // arrow tokens match literally
}

function earliestMarker(text: string, markers: string[]): number {
  let best = -1
  for (const m of markers) {
    const i = findMarker(text, m)
    if (i !== -1 && (best === -1 || i < best)) best = i
  }
  return best
}

/** Drop list items whose content is solely a quoted string — trigger-phrase lists don't count. */
function stripQuotedListItems(text: string): string {
  return text
    .split('\n')
    .filter(ln => {
      const m = /^\s*(?:[-*+]|\d+\.)\s+(.*)$/.exec(ln)
      if (!m) return true
      return !/^["'""''`].*["'""''`]$/.test(m[1].trim())
    })
    .join('\n')
}

export const CT03: Rule = {
  id: 'CT03',
  check(skill, ctx) {
    const entry = ctx.anatomy['examples']
    if (!entry) return []
    const matched = matchAnatomySections(skill, entry)
    if (matched.length === 0) {
      return [{ message: 'no Examples section found (canonical "Examples" or an alias)', file: 'SKILL.md', line: null }]
    }
    const line = matched[0].startLine
    const union = matched.map(s => s.text).join('\n')
    const token = String(ctx.options['token'] ?? '')
    if (token !== '' && union.includes(token)) {
      return [{ message: 'Examples content is an unfilled placeholder', file: 'SKILL.md', line }]
    }
    const effective = stripQuotedListItems(union)
    const inputs = (ctx.options['inputMarkers'] as string[] | undefined) ?? []
    const outputs = (ctx.options['outputMarkers'] as string[] | undefined) ?? []
    const firstInput = earliestMarker(effective, inputs)
    if (firstInput !== -1) {
      const after = effective.slice(firstInput + 1)
      if (outputs.some(m => findMarker(after, m) !== -1)) return []
    }
    return [{ message: 'Examples section has no concrete input→output worked example', file: 'SKILL.md', line }]
  },
}
