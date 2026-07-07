import { textOutsideFences } from '../parser/sections'
import type { Rule, RuleFinding } from '../types'

const AT_PATH = /(?:^|\s)@(\S+)/g

export const ST04: Rule = {
  id: 'ST04',
  check(skill) {
    const out: RuleFinding[] = []
    const scan = (file: string, text: string, offset: number): void => {
      textOutsideFences(text).split('\n').forEach((ln, i) => {
        for (const m of ln.matchAll(AT_PATH)) {
          const path = m[1]
          if (!path.includes('/') && !path.endsWith('.md')) continue
          out.push({
            message: `@-prefixed link "@${path}" force-loads the file into context — use the bare path instead`,
            file,
            line: i + offset,
          })
        }
      })
    }
    scan('SKILL.md', skill.body.raw, skill.body.lineOffset)
    for (const f of skill.files) {
      if (f.text !== null && f.relPath.endsWith('.md')) scan(f.relPath, f.text, 1)
    }
    return out
  },
}
