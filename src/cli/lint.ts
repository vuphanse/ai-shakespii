import { existsSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { runRules } from '../lib/engine'
import { parseSkill } from '../lib/parser'
import { loadProfile } from '../lib/profile/load'
import type { Profile } from '../lib/types'
import { jsonReport } from './format/json'
import { formatPretty } from './format/pretty'
import { defaultProfilePath } from './paths'

export function runLint(argv: string[]): number {
  const json = argv.includes('--json')
  const positionals = argv.filter(a => a !== '--json')
  if (positionals.length !== 1) {
    console.error('usage: shakespii lint <path> [--json]')
    return 2
  }
  let dir = resolve(positionals[0])
  if (basename(dir) === 'SKILL.md') dir = dirname(dir)
  if (!existsSync(join(dir, 'SKILL.md'))) {
    console.error(`not a skill: no SKILL.md at ${dir}`)
    return 2
  }
  let profile: Profile
  try {
    profile = loadProfile(defaultProfilePath)
  } catch (e) {
    console.error(`profile unreadable: ${(e as Error).message}`)
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
