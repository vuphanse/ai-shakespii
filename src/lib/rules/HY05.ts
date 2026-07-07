import { textOutsideFences } from '../parser/sections'
import type { Rule, RuleFinding } from '../types'

const COMMANDS = [
  'git', 'bun', 'npm', 'npx', 'node', 'python', 'python3', 'pip', 'pip3',
  'brew', 'curl', 'wget', 'make', 'docker', 'cargo', 'go', 'shakespii', 'whisper', 'claude',
]
// Case-sensitive on purpose: sentence-initial prose ("Go to docs/…") stays silent.
const CMD_LINE = new RegExp(`^(?:\\$ )?(${COMMANDS.join('|')})\\b(.*)$`)
const FLAG = /(?:^|\s)-{1,2}[A-Za-z]/
const PATHISH = /\S\/\S|\S+\.[A-Za-z0-9]{1,8}(?:\s|$)/

export const HY05: Rule = {
  id: 'HY05',
  check(skill) {
    const out: RuleFinding[] = []
    const scan = (file: string, text: string, offset: number): void => {
      textOutsideFences(text).split('\n').forEach((ln, i) => {
        const m = CMD_LINE.exec(ln)
        if (!m) return
        if (!FLAG.test(m[2]) && !PATHISH.test(m[2])) return
        out.push({
          message: `unfenced command line starting with "${m[1]}" — executable commands belong in code fences`,
          file,
          line: i + offset,
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
