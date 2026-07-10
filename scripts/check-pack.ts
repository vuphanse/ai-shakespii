#!/usr/bin/env bun
// Guards the npm tarball contents against the spec §1 whitelist: everything
// runtime-required is present, nothing internal leaks.
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const proc = Bun.spawnSync(['npm', 'pack', '--dry-run', '--json'], { cwd: repoRoot })
if (proc.exitCode !== 0) {
  console.error(proc.stderr.toString())
  process.exit(2)
}
const parsed = JSON.parse(proc.stdout.toString()) as Array<{ files: Array<{ path: string }> }>
const files = new Set(parsed[0].files.map(f => f.path))

const requiredFiles = [
  'package.json',
  'README.md',
  'LICENSE',
  'src/cli/index.ts',
  'src/cli/install.ts',
  'src/cli/paths.ts',
  'profiles/default.yaml',
  'skills/using-shakespii/SKILL.md',
  'skills/using-shakespii/evals/evals.json',
  'skills/authoring-skills/SKILL.md',
  'skills/authoring-skills/evals/evals.json',
]
const requiredPrefixes = ['templates/skill/']
const forbiddenPrefixes = ['tests/', 'docs/', 'scripts/', '.superpowers/', '.github/']
const forbiddenFiles = ['CLAUDE.md', 'bun.lock']

const problems: string[] = []
for (const p of requiredFiles) if (!files.has(p)) problems.push(`missing from pack: ${p}`)
for (const prefix of requiredPrefixes) {
  if (![...files].some(p => p.startsWith(prefix))) problems.push(`missing from pack: ${prefix}*`)
}
for (const p of files) {
  if (forbiddenPrefixes.some(prefix => p.startsWith(prefix)) || forbiddenFiles.includes(p)) {
    problems.push(`leaked into pack: ${p}`)
  }
}
if (problems.length > 0) {
  for (const p of problems) console.error(p)
  process.exit(1)
}
console.log(`pack ok: ${files.size} files`)
