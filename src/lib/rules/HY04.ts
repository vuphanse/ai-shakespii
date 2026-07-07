import { textOutsideFences } from '../parser/sections'
import type { Rule, RuleFinding } from '../types'

const MAGNITUDE = /^\d+(\.\d+)?[KMB]?$/i
const ROT_NOUN = /^(installs?|downloads?|stars?|users?|leaderboards?|ranks?|rankings?)$/i
const strip = (t: string): string => t.replace(/^[([{"'~]+/, '').replace(/[)\]}"'.,:;!?]+$/, '')

export const HY04: Rule = {
  id: 'HY04',
  check(skill) {
    const hasVersion = typeof skill.frontmatter.parsed?.['version'] === 'string'
    const marker = /last reviewed/i
    const hasMarker =
      marker.test(skill.raw) ||
      skill.files.some(f => f.text !== null && f.relPath.endsWith('.md') && marker.test(f.text))
    if (hasVersion && hasMarker) return []
    const out: RuleFinding[] = []
    const scan = (file: string, text: string, offset: number): void => {
      textOutsideFences(text).split('\n').forEach((ln, i) => {
        const toks = ln.split(/\s+/).filter(Boolean).map(strip)
        toks.forEach((t, j) => {
          if (!MAGNITUDE.test(t) || !/\d/.test(t)) return
          for (let k = Math.max(0, j - 6); k <= Math.min(toks.length - 1, j + 6); k++) {
            if (ROT_NOUN.test(toks[k])) {
              out.push({
                message: `rot-prone stat "${t}" near "${toks[k].toLowerCase()}" — external counts rot; add version + a last-reviewed marker or drop the stat`,
                file,
                line: i + offset,
              })
              return
            }
          }
        })
      })
    }
    scan('SKILL.md', skill.body.raw, skill.body.lineOffset)
    for (const f of skill.files) {
      if (f.text !== null && f.relPath.endsWith('.md')) scan(f.relPath, f.text, 1)
    }
    return out
  },
}
