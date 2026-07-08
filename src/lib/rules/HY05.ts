import { textOutsideFences } from '../parser/sections'
import type { Rule, RuleFinding } from '../types'

const COMMANDS = [
  'git', 'bun', 'npm', 'npx', 'node', 'python', 'python3', 'pip', 'pip3',
  'brew', 'curl', 'wget', 'make', 'docker', 'cargo', 'go', 'shakespii', 'whisper', 'claude',
]
// Case-sensitive on purpose: sentence-initial prose ("Go to docs/…") stays silent.
const CMD_FIRST = new RegExp(`^(?:\\$ )?(${COMMANDS.join('|')})\\b(.*)$`)
const CMD_LATER = new RegExp(`^(${COMMANDS.join('|')})\\b(.*)$`)
// && / || / ; only — never a bare |, which would slice markdown table rows
// documenting commands into false command segments (spec §6).
const SHELL_OPERATOR = /\s*(?:&&|\|\||;)\s*/
const FLAG = /(?:^|\s)-{1,2}[A-Za-z]/
const PATHISH = /\S\/\S|\S+\.[A-Za-z0-9]{1,8}(?:\s|$)/

export const HY05: Rule = {
  id: 'HY05',
  check(skill) {
    const out: RuleFinding[] = []
    const scan = (file: string, text: string, offset: number): void => {
      textOutsideFences(text).split('\n').forEach((ln, i) => {
        const segments = ln.split(SHELL_OPERATOR)
        for (let si = 0; si < segments.length; si++) {
          const m = (si === 0 ? CMD_FIRST : CMD_LATER).exec(segments[si])
          if (!m) continue
          if (!FLAG.test(m[2]) && !PATHISH.test(m[2])) continue
          out.push({
            message:
              si === 0
                ? `unfenced command line starting with "${m[1]}" — executable commands belong in code fences`
                : `unfenced command "${m[1]}" after a shell operator — executable commands belong in code fences`,
            file,
            line: i + offset,
          })
          break // one finding per line
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
