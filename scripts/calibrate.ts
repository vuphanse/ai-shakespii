#!/usr/bin/env bun
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// Calibration goes through the real CLI's lint --json path (spec §5) — the
// protocol exercises the CLI/JSON contract itself, not lib internals.
const CLI = join(import.meta.dir, '../src/cli/index.ts')

interface ReportFinding {
  ruleId: string
  severity: 'error' | 'warn'
}

const roots = process.argv.length > 2
  ? process.argv.slice(2)
  : [
      join(homedir(), '.claude/skills'),
      join(homedir(), '.claude/plugins/cache/claude-plugins-official/superpowers/6.1.1/skills'),
    ]

for (const root of roots) {
  if (!existsSync(root)) {
    console.error(`skip missing corpus root: ${root}`)
    continue
  }
  const perRule = new Map<string, { errors: number; warns: number; skills: Set<string> }>()
  let total = 0
  for (const name of readdirSync(root).sort()) {
    const dir = join(root, name)
    if (!existsSync(join(dir, 'SKILL.md'))) continue
    const r = Bun.spawnSync(['bun', CLI, 'lint', dir, '--json'])
    if (r.exitCode === 2) {
      console.error(`lint failed (exit 2) on ${dir}: ${r.stderr.toString().trim()}`)
      continue
    }
    total++
    const report = JSON.parse(r.stdout.toString()) as { findings: ReportFinding[] }
    for (const f of report.findings) {
      const e = perRule.get(f.ruleId) ?? { errors: 0, warns: 0, skills: new Set<string>() }
      if (f.severity === 'error') e.errors++
      else e.warns++
      e.skills.add(name)
      perRule.set(f.ruleId, e)
    }
  }
  console.log(`\n## ${root} — ${total} skills\n`)
  console.log('| Rule | Errors | Warnings | Skills affected |')
  console.log('|---|---|---|---|')
  for (const id of [...perRule.keys()].sort()) {
    const e = perRule.get(id)!
    console.log(`| ${id} | ${e.errors} | ${e.warns} | ${e.skills.size} |`)
  }
}
