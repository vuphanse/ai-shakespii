import { basename } from 'node:path'
import pc from 'picocolors'
import type { CorpusResult } from '../../lib/corpus'
import { formatPretty } from './pretty'

export function formatCorpusPretty(result: CorpusResult): string {
  const lines: string[] = []
  let errors = 0
  let warnings = 0
  for (const s of result.skills) {
    const dirName = basename(s.dir)
    lines.push(pc.bold(pc.underline(dirName)) + pc.dim(` (${s.dir})`))
    if (s.runError !== null) {
      lines.push(`  ${pc.red('lint failed')}: ${s.runError}`)
      lines.push('')
      continue
    }
    lines.push(formatPretty(s.dir, s.findings))
    errors += s.findings.filter(f => f.severity === 'error').length
    warnings += s.findings.filter(f => f.severity === 'warn').length
    for (const f of result.corpusFindings) {
      if (!f.sites.some(site => site.skill === dirName)) continue
      const partners = [...new Set(f.sites.map(site => site.skill).filter(n => n !== dirName))]
      const sev = f.severity === 'error' ? pc.red('error') : pc.yellow('warn ')
      lines.push(`  ${sev}  ${f.message} [with: ${partners.join(', ')}]  ${pc.dim(f.ruleId)}`)
    }
    lines.push('')
  }
  for (const sk of result.skipped) lines.push(pc.dim(`skipped ${sk.dir} — ${sk.reason}`))
  if (result.skipped.length > 0) lines.push('')
  for (const f of result.corpusFindings) {
    if (f.severity === 'error') errors++
    else warnings++
  }
  lines.push(
    pc.bold(
      `${result.skills.length} skills linted, ${result.skipped.length} skipped · ${errors} errors, ${warnings} warnings (of which ${result.corpusFindings.length} corpus-level)`,
    ),
  )
  return lines.join('\n')
}
