import { existsSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { lintCorpus } from '../lib/corpus'
import { runRules } from '../lib/engine'
import { parseSkill } from '../lib/parser'
import { loadProfile } from '../lib/profile/load'
import type { Profile } from '../lib/types'
import { jsonCorpusReport } from './format/corpus-json'
import { formatCorpusPretty } from './format/corpus-pretty'
import { jsonReport } from './format/json'
import { formatPretty } from './format/pretty'
import { defaultProfilePath } from './paths'

const USAGE = 'usage: shakespii lint <path> [--json] [--corpus]'

export function runLint(argv: string[]): number {
  const json = argv.includes('--json')
  const corpus = argv.includes('--corpus')
  const positionals = argv.filter(a => a !== '--json' && a !== '--corpus')
  if (positionals.length !== 1) {
    console.error(USAGE)
    return 2
  }
  let profile: Profile
  try {
    profile = loadProfile(defaultProfilePath)
  } catch (e) {
    console.error(`profile unreadable: ${(e as Error).message}`)
    return 2
  }

  if (corpus) {
    const root = resolve(positionals[0])
    let result
    try {
      result = lintCorpus(root, profile)
    } catch (e) {
      console.error((e as Error).message)
      return 2
    }
    console.log(json ? JSON.stringify(jsonCorpusReport(result, profile.profile), null, 2) : formatCorpusPretty(result))
    if (result.skills.some(s => s.runError !== null)) return 2
    const anyError =
      result.skills.some(s => s.findings.some(f => f.severity === 'error')) ||
      result.corpusFindings.some(f => f.severity === 'error')
    return anyError ? 1 : 0
  }

  let dir = resolve(positionals[0])
  if (basename(dir) === 'SKILL.md') dir = dirname(dir)
  if (!existsSync(join(dir, 'SKILL.md'))) {
    console.error(`not a skill: no SKILL.md at ${dir}`)
    return 2
  }
  try {
    const skill = parseSkill(dir)
    const findings = runRules(skill, profile)
    if (json) {
      console.log(JSON.stringify(jsonReport(skill, profile.profile, findings), null, 2))
    } else {
      console.log(formatPretty(dir, findings))
    }
    return findings.some(f => f.severity === 'error') ? 1 : 0
  } catch (e) {
    console.error(`lint failed: ${(e as Error).message}`)
    return 2
  }
}
