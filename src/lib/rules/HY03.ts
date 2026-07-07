import { textOutsideFences } from '../parser/sections'
import type { Rule, RuleFinding } from '../types'

const PHRASES = ['currently', 'as of', 'recently', 'at the time of writing']
const PHRASE_RES = PHRASES.map(p => ({ p, re: new RegExp(`\\b${p.replace(/ /g, '\\s+')}\\b`, 'i') }))

function scanDoc(file: string, text: string, offset: number, out: RuleFinding[]): void {
  let details = 0
  let exemptDepth: number | null = null
  textOutsideFences(text).split('\n').forEach((ln, i) => {
    const h = /^(#{1,6})\s+(.+)$/.exec(ln)
    if (h) {
      if (exemptDepth !== null && h[1].length <= exemptDepth) exemptDepth = null
      if (/old patterns/i.test(h[2])) exemptDepth = h[1].length
    }
    details += ln.match(/<details\b/gi)?.length ?? 0
    if (details === 0 && exemptDepth === null) {
      for (const { p, re } of PHRASE_RES) {
        if (re.test(ln)) {
          out.push({
            message: `time-sensitive phrase "${p}" — describe the steady state or move it under an Old patterns heading`,
            file,
            line: i + offset,
          })
        }
      }
    }
    details = Math.max(0, details - (ln.match(/<\/details>/gi)?.length ?? 0))
  })
}

export const HY03: Rule = {
  id: 'HY03',
  check(skill) {
    const out: RuleFinding[] = []
    scanDoc('SKILL.md', skill.body.raw, skill.body.lineOffset, out)
    for (const f of skill.files) {
      if (f.text !== null && f.relPath.endsWith('.md')) scanDoc(f.relPath, f.text, 1, out)
    }
    return out
  },
}
