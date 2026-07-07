import { textOutsideFences } from '../parser/sections'
import type { Rule, RuleFinding } from '../types'

const FIGURE = /^~?\d+(\.\d+)?(%|x)$/i
const CLAIM = /^(saves?|savings|saved|faster|speedups?|reduc\w*|compress\w*|improvements?|smaller)$/i
const strip = (t: string): string => t.replace(/^[([{"'~]+/, '').replace(/[)\]}"'.,:;!?]+$/, '')

export const HY06: Rule = {
  id: 'HY06',
  check(skill) {
    if (skill.files.some(f => f.relPath === 'evals/evals.json')) return []
    const out: RuleFinding[] = []
    const scan = (file: string, text: string, offset: number): void => {
      textOutsideFences(text).split('\n').forEach((ln, i) => {
        if (/unverified|anecdotal/i.test(ln)) return
        const toks = ln.split(/\s+/).filter(Boolean).map(strip)
        toks.forEach((t, j) => {
          if (!FIGURE.test(t)) return
          for (let k = Math.max(0, j - 8); k <= Math.min(toks.length - 1, j + 8); k++) {
            if (CLAIM.test(toks[k])) {
              out.push({
                message: `quantitative claim "${t.replace(/^~/, '')}" near "${toks[k].toLowerCase()}" — back it with a shipped eval or mark it unverified`,
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
