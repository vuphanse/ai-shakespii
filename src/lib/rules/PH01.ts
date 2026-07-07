import type { Rule, RuleFinding } from '../types'

export const PH01: Rule = {
  id: 'PH01',
  check(skill, ctx) {
    const token = String(ctx.options['token'] ?? 'TODO(shakespii):')
    const out: RuleFinding[] = []
    const scan = (file: string, text: string): void => {
      text.split('\n').forEach((ln, i) => {
        let idx = ln.indexOf(token)
        while (idx !== -1) {
          out.push({ message: `unfilled scaffold placeholder "${token}"`, file, line: i + 1 })
          idx = ln.indexOf(token, idx + token.length)
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
