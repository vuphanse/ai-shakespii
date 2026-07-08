import { existsSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { testSkill } from '../lib/harness'
import { parseSkill } from '../lib/parser'
import { jsonTestReport } from './format/test-json'
import { formatTestPretty } from './format/test-pretty'

const USAGE = 'usage: shakespii test <path> [--json]'

export function runTest(argv: string[]): number {
  let json = false
  const positionals: string[] = []
  for (const a of argv) {
    if (a === '--json') {
      json = true
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
  const dir = resolve(positionals[0])
  let isDir = false
  try {
    isDir = statSync(dir).isDirectory()
  } catch {
    isDir = false
  }
  if (!isDir) {
    console.error(`not a directory: ${dir}`)
    return 2
  }
  if (!existsSync(join(dir, 'SKILL.md'))) {
    console.error(`not a skill: no SKILL.md at ${dir}`)
    return 2
  }
  try {
    const skill = parseSkill(dir)
    const result = testSkill(skill)
    console.log(json ? JSON.stringify(jsonTestReport(result), null, 2) : formatTestPretty(result))
    return result.summary.errors > 0 ? 1 : 0
  } catch (e) {
    console.error(`test failed: ${(e as Error).message}`)
    return 2
  }
}
