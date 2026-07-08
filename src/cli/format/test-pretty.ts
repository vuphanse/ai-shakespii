import { basename } from 'node:path'
import pc from 'picocolors'
import type { TestResult } from '../../lib/harness/types'

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

export function formatTestPretty(result: TestResult): string {
  const lines: string[] = [pc.underline(basename(result.skill.dir))]
  for (const s of result.stages) {
    if (s.stage === 'deterministic') {
      lines.push(`  deterministic  ${s.status === 'fail' ? pc.red('FAIL') : pc.green('PASS')}`)
      for (const f of s.findings) {
        const sev = f.severity === 'error' ? pc.red('error') : pc.yellow('warn ')
        lines.push(`    ${sev}  ${f.file}  ${f.message}`)
      }
    } else {
      lines.push(`  ${s.stage.padEnd(13)}  ${pc.dim('unavailable (ships in M4b)')}`)
    }
  }
  lines.push('')
  lines.push(pc.bold(`deterministic: ${plural(result.summary.errors, 'error')}, ${plural(result.summary.warnings, 'warning')} · scenario/grading pending M4b`))
  return lines.join('\n')
}
