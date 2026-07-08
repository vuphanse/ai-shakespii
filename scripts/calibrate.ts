#!/usr/bin/env bun
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'

// Calibration drives the CLI's corpus mode (M3b spec §8) — one invocation per
// root. The corpus CLI/JSON contract itself is what the sweep exercises, and
// this script is its first dogfood consumer (it replaces the M2-era
// hand-rolled per-directory walk).
const CLI = join(import.meta.dir, '../src/cli/index.ts')

interface ReportFinding {
  ruleId: string
  severity: 'error' | 'warn'
}
interface SkillEntry {
  skill: { dir: string }
  findings?: ReportFinding[]
  runError?: string
}
interface CorpusReport {
  skills: SkillEntry[]
  corpusFindings: Array<{ ruleId: string; severity: string; message: string; sites: Array<{ skill: string }> }>
  skipped: Array<{ dir: string; reason: string }>
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
  const r = Bun.spawnSync(['bun', CLI, 'lint', root, '--corpus', '--json'])
  if (r.stdout.length === 0) {
    console.error(`corpus lint produced no report for ${root}: ${r.stderr.toString().trim()}`)
    continue
  }
  const report = JSON.parse(r.stdout.toString()) as CorpusReport
  const perRule = new Map<string, { errors: number; warns: number; skills: Set<string> }>()
  let total = 0
  for (const s of report.skills) {
    if (s.runError !== undefined) {
      console.error(`lint failed on ${s.skill.dir}: ${s.runError}`)
      continue
    }
    total++
    for (const f of s.findings ?? []) {
      const e = perRule.get(f.ruleId) ?? { errors: 0, warns: 0, skills: new Set<string>() }
      if (f.severity === 'error') e.errors++
      else e.warns++
      e.skills.add(basename(s.skill.dir))
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
  if (report.corpusFindings.length > 0) {
    console.log('\n### Corpus findings\n')
    for (const f of report.corpusFindings) {
      console.log(`- ${f.ruleId} (${f.severity}): ${f.message} — sites: ${f.sites.map(s => s.skill).join(', ')}`)
    }
  }
  for (const sk of report.skipped) console.error(`skipped ${sk.dir} — ${sk.reason}`)
}
