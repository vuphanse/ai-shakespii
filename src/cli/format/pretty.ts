import { join } from 'node:path'
import pc from 'picocolors'
import type { Finding } from '../../lib/types'

export function formatPretty(skillDir: string, findings: Finding[]): string {
  if (findings.length === 0) return pc.green('✔ 0 problems')
  const byFile = new Map<string, Finding[]>()
  for (const f of findings) {
    const list = byFile.get(f.file) ?? []
    list.push(f)
    byFile.set(f.file, list)
  }
  const lines: string[] = []
  for (const [file, fileFindings] of byFile) {
    lines.push(pc.underline(join(skillDir, file)))
    for (const f of fileFindings) {
      const loc = f.line === null ? '' : `${f.line}:1`
      const sev = f.severity === 'error' ? pc.red('error') : pc.yellow('warn ')
      lines.push(`  ${loc.padStart(6)}  ${sev}  ${f.message}  ${pc.dim(f.ruleId)}`)
    }
    lines.push('')
  }
  const errors = findings.filter(f => f.severity === 'error').length
  const warnings = findings.length - errors
  lines.push(pc.bold(`✖ ${findings.length} problems (${errors} errors, ${warnings} warnings)`))
  return lines.join('\n')
}
