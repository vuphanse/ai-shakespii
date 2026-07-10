import { cpSync, existsSync, lstatSync, mkdirSync, renameSync, rmSync, statSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { runRules } from '../lib/engine'
import { runDeterministic } from '../lib/harness/deterministic'
import type { HarnessFinding } from '../lib/harness/types'
import { decideGate } from '../lib/install/gate'
import { detectProviders, PROVIDER_NAMES, resolveProvider } from '../lib/install/registry'
import { parseSkill } from '../lib/parser'
import { loadProfile } from '../lib/profile/load'
import type { ParsedSkill, Profile } from '../lib/types'
import { installJsonReport, type TargetOutcome } from './format/install-json'
import { formatInstallPretty } from './format/install-pretty'
import { defaultProfilePath, packageRoot } from './paths'

const USAGE = 'usage: shakespii install <path-or-name> [--provider <name>]... [--target <dir>] [--force] [--json]'

interface ResolvedTarget {
  provider: string | null
  skillsDir: string
}

export function runInstall(argv: string[]): number {
  let json = false
  let force = false
  let target: string | null = null
  const providers: string[] = []
  const positionals: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--json') {
      json = true
    } else if (a === '--force') {
      force = true
    } else if (a === '--provider') {
      const v = argv[i + 1]
      if (v === undefined || v.startsWith('-')) {
        console.error(`--provider requires a value\n${USAGE}`)
        return 2
      }
      providers.push(v)
      i += 1
    } else if (a === '--target') {
      const v = argv[i + 1]
      if (v === undefined || v.startsWith('-')) {
        console.error(`--target requires a value\n${USAGE}`)
        return 2
      }
      target = v
      i += 1
    } else if (a.startsWith('-')) {
      console.error(`unknown option: ${a}\n${USAGE}`)
      return 2
    } else {
      positionals.push(a)
    }
  }
  if (positionals.length !== 1) {
    console.error(USAGE)
    return 2
  }
  if (target !== null && providers.length > 0) {
    console.error(`--provider and --target are mutually exclusive\n${USAGE}`)
    return 2
  }

  // Source resolution: an existing directory wins over a bundled name (spec §2.1).
  let sourceKind: 'path' | 'bundled'
  let sourceDir: string
  let candidate = resolve(positionals[0])
  if (basename(candidate) === 'SKILL.md') candidate = dirname(candidate)
  let candidateIsDir = false
  try {
    candidateIsDir = statSync(candidate).isDirectory()
  } catch {
    candidateIsDir = false
  }
  if (candidateIsDir) {
    if (!existsSync(join(candidate, 'SKILL.md'))) {
      console.error(`not a skill: no SKILL.md at ${candidate}`)
      return 2
    }
    sourceKind = 'path'
    sourceDir = candidate
  } else {
    const bundled = join(packageRoot, 'skills', positionals[0])
    if (existsSync(join(bundled, 'SKILL.md'))) {
      sourceKind = 'bundled'
      sourceDir = bundled
    } else {
      console.error(`not a skill: no directory at ${candidate} and no bundled skill named "${positionals[0]}"\n${USAGE}`)
      return 2
    }
  }

  let profile: Profile
  try {
    profile = loadProfile(defaultProfilePath)
  } catch (e) {
    console.error(`profile unreadable: ${(e as Error).message}`)
    return 2
  }
  let skill: ParsedSkill
  try {
    skill = parseSkill(sourceDir)
  } catch (e) {
    console.error(`install failed: ${(e as Error).message}`)
    return 2
  }
  const lintFindings = runRules(skill, profile)
  const hasEvals = skill.files.some(f => f.relPath === 'evals/evals.json')
  const testFindings: HarnessFinding[] | null = hasEvals ? runDeterministic(skill) : null
  const gate = decideGate({ lintFindings, testFindings })

  const fmName = skill.frontmatter.parsed?.['name']
  const installName = typeof fmName === 'string' && fmName.length > 0 ? fmName : null

  let resolved: ResolvedTarget[]
  if (target !== null) {
    const expanded = target.startsWith('~/') ? join(homedir(), target.slice(2)) : target
    resolved = [{ provider: null, skillsDir: resolve(expanded) }]
  } else if (providers.length === 0) {
    const claude = resolveProvider('claude')
    resolved = [{ provider: 'claude', skillsDir: claude === null ? '' : claude.skillsDir }]
  } else if (providers.includes('all')) {
    const detected = detectProviders()
    if (detected.length === 0) {
      console.error('no providers detected: none of the known provider root directories exist under this home')
      return 2
    }
    resolved = detected.map(p => ({ provider: p.name, skillsDir: p.skillsDir }))
  } else {
    resolved = []
    for (const name of providers) {
      const p = resolveProvider(name)
      if (p === null) {
        console.error(`unknown provider: ${name} (known: ${PROVIDER_NAMES.join(', ')}, all)\n${USAGE}`)
        return 2
      }
      resolved.push({ provider: p.name, skillsDir: p.skillsDir })
    }
    resolved = resolved.filter((t, i) => resolved.findIndex(x => x.skillsDir === t.skillsDir) === i)
  }

  const outcomes: TargetOutcome[] = []
  if (!gate.pass || installName === null) {
    const reason = !gate.pass
      ? gate.lint.status === 'fail'
        ? 'gate: lint errors'
        : 'gate: deterministic test failures'
      : 'no frontmatter name'
    for (const t of resolved) {
      outcomes.push({
        provider: t.provider,
        path: installName === null ? t.skillsDir : join(t.skillsDir, installName),
        advisory: null, // gate blocked before the advisory step could run
        installed: false,
        forced: false,
        reason,
      })
    }
  } else {
    for (const t of resolved) {
      outcomes.push(installTo(t, sourceDir, installName, force))
    }
  }

  const report = installJsonReport(installName, { kind: sourceKind, path: sourceDir }, gate, lintFindings, testFindings, outcomes)
  console.log(json ? JSON.stringify(report, null, 2) : formatInstallPretty(report))
  return outcomes.every(o => o.installed) ? 0 : 1
}

function installTo(t: ResolvedTarget, sourceDir: string, installName: string, force: boolean): TargetOutcome {
  const dest = join(t.skillsDir, installName)
  let occupied: string | null = null
  try {
    const st = lstatSync(dest)
    occupied = st.isSymbolicLink() ? 'symlink' : st.isDirectory() ? 'directory' : 'file'
  } catch {
    occupied = null
  }
  if (occupied !== null && !force) {
    return { provider: t.provider, path: dest, advisory: null, installed: false, forced: false, reason: `occupied: ${occupied}` }
  }
  try {
    mkdirSync(t.skillsDir, { recursive: true })
    if (occupied === null) {
      cpSync(sourceDir, dest, { recursive: true })
      return { provider: t.provider, path: dest, advisory: null, installed: true, forced: false, reason: null }
    }
    // Staged copy first, then swap: a completed copy exists before anything is removed.
    const staged = join(t.skillsDir, `.${installName}.shakespii-staging-${process.pid}`)
    rmSync(staged, { recursive: true, force: true })
    cpSync(sourceDir, staged, { recursive: true })
    if (lstatSync(dest).isSymbolicLink()) unlinkSync(dest)
    else rmSync(dest, { recursive: true, force: true })
    renameSync(staged, dest)
    return { provider: t.provider, path: dest, advisory: null, installed: true, forced: true, reason: null }
  } catch (e) {
    return { provider: t.provider, path: dest, advisory: null, installed: false, forced: false, reason: `write failed: ${(e as Error).message}` }
  }
}
