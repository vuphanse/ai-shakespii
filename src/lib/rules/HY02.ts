import type { Rule, RuleFinding } from '../types'

const ABS = /\/(Users|home)\/[A-Za-z0-9._-]+|[A-Za-z]:\\Users\\/

export const HY02: Rule = {
  id: 'HY02',
  check(skill) {
    const out: RuleFinding[] = []
    const scan = (file: string, text: string): void => {
      text.split('\n').forEach((ln, i) => {
        const m = ABS.exec(ln)
        if (m) {
          out.push({ message: `machine-specific absolute path "${m[0].replace(/\\$/, '')}" will not survive installation`, file, line: i + 1 })
        }
      })
    }
    scan('SKILL.md', skill.raw)
    for (const f of skill.files) {
      if (f.text !== null) scan(f.relPath, f.text)
    }
    return out
  },
}
