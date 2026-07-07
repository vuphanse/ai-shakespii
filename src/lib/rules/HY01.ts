import type { Rule, RuleFinding } from '../types'

const DRIVE = /[A-Za-z]:\\/
const BACKSLASH_CHAIN = /\w+\\{1,2}\w+\\{1,2}\w+/

export const HY01: Rule = {
  id: 'HY01',
  check(skill) {
    const out: RuleFinding[] = []
    const scan = (file: string, text: string): void => {
      text.split('\n').forEach((ln, i) => {
        if (DRIVE.test(ln) || BACKSLASH_CHAIN.test(ln)) {
          out.push({ message: 'backslash path found — skills use forward-slash paths only', file, line: i + 1 })
        }
      })
    }
    scan('SKILL.md', skill.raw)
    for (const f of skill.files) {
      if (f.text !== null && f.relPath.endsWith('.md')) scan(f.relPath, f.text)
    }
    return out
  },
}
