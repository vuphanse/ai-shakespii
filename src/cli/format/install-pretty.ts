import pc from 'picocolors'
import type { InstallJsonReport } from './install-json'

export function formatInstallPretty(report: InstallJsonReport): string {
  const lines: string[] = []
  const { lint, test } = report.gate
  lines.push(`gate lint: ${lint.status} (${lint.errors} errors, ${lint.warnings} warnings)`)
  for (const f of lint.findings) {
    lines.push(`  ${f.severity === 'error' ? pc.red(f.severity) : pc.yellow(f.severity)}  ${f.ruleId}  ${f.file}${f.line === null ? '' : `:${f.line}`}  ${f.message}`)
  }
  lines.push(`gate test: ${test.status}${test.failures.length > 0 ? ` (${test.failures.length} findings)` : ''}`)
  for (const f of test.failures) {
    lines.push(`  ${f.severity === 'error' ? pc.red(f.severity) : pc.yellow(f.severity)}  ${f.file}  ${f.message}`)
  }
  for (const t of report.targets) {
    const label = t.provider ?? t.path
    if (t.installed) {
      lines.push(pc.green(`installed ${report.skill} → ${t.path}${t.forced ? ' (replaced existing)' : ''}`))
    } else {
      lines.push(pc.red(`blocked ${label}: ${t.reason}`))
    }
    if (t.advisory === null) {
      // Spec §2.2: a skipped advisory must be reported, not silently omitted.
      if (t.reason === null || !t.reason.startsWith('gate:')) {
        lines.push(pc.dim('  advisory: skipped (no installed skills at this target to compare against)'))
      }
    } else {
      for (const a of t.advisory) lines.push(pc.yellow(`  advisory ${a.ruleId}: ${a.message}`))
    }
  }
  return lines.join('\n')
}
