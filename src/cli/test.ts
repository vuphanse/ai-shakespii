import { existsSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { ClaudeRunner } from '../lib/harness'
import { testSkill } from '../lib/harness'
import { parseSkill } from '../lib/parser'
import { jsonTestReport } from './format/test-json'
import { formatTestPretty } from './format/test-pretty'

const USAGE = 'usage: shakespii test <path> [--json] [--run] [--fresh] [--model <name>]'

export interface RunTestDeps {
  runner?: ClaudeRunner
  cacheRoot?: string
}

export async function runTest(argv: string[], deps: RunTestDeps = {}): Promise<number> {
  let json = false
  let run = false
  let fresh = false
  let model: string | undefined
  const positionals: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--json') {
      json = true
    } else if (a === '--run') {
      run = true
    } else if (a === '--fresh') {
      fresh = true
    } else if (a === '--model') {
      const v = argv[i + 1]
      if (v === undefined || v.startsWith('-')) {
        console.error(`--model requires a value\n${USAGE}`)
        return 2
      }
      model = v
      i += 1
    } else if (a.startsWith('-')) {
      console.error(`unknown option: ${a}\n${USAGE}`)
      return 2
    } else {
      positionals.push(a)
    }
  }
  if (fresh && !run) {
    console.error(`--fresh requires --run\n${USAGE}`)
    return 2
  }
  if (model !== undefined && !run) {
    console.error(`--model requires --run\n${USAGE}`)
    return 2
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
    const result = await testSkill(skill, { run, fresh, model, runner: deps.runner, cacheRoot: deps.cacheRoot })
    console.log(json ? JSON.stringify(jsonTestReport(result), null, 2) : formatTestPretty(result))
    return result.summary.errors > 0 ? 1 : 0
  } catch (e) {
    console.error(`test failed: ${(e as Error).message}`)
    return 2
  }
}
