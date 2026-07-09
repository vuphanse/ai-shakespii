import { existsSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { BENCH_DEFAULT_RUNS, runBenchSuite } from '../lib/harness/bench'
import type { ClaudeRunner } from '../lib/harness/claude-runner'
import { DEFAULT_MODEL, spawnClaudeRunner } from '../lib/harness/claude-runner'
import { runDeterministic } from '../lib/harness/deterministic'
import { cacheRoot } from '../lib/harness/run-dir'
import { parseSkill } from '../lib/parser'
import { formatBenchPretty } from './format/bench-pretty'
import { harnessFindingLines } from './format/test-pretty'

const USAGE = 'usage: shakespii bench <path> [--json] [--runs <n>] [--model <name>] [--fresh]'

export interface RunBenchDeps {
  runner?: ClaudeRunner
  cacheRoot?: string
}

export async function runBench(argv: string[], deps: RunBenchDeps = {}): Promise<number> {
  let json = false
  let fresh = false
  let runs: number | undefined
  let model: string | undefined
  const positionals: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--json') {
      json = true
    } else if (a === '--fresh') {
      fresh = true
    } else if (a === '--runs') {
      const v = argv[i + 1]
      if (v === undefined) {
        console.error(`--runs requires a value\n${USAGE}`)
        return 2
      }
      if (!/^\d+$/.test(v) || Number.parseInt(v, 10) < 1) {
        console.error(`--runs must be a positive integer\n${USAGE}`)
        return 2
      }
      runs = Number.parseInt(v, 10)
      i += 1
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
    const findings = runDeterministic(skill)
    if (findings.length > 0) {
      console.error(harnessFindingLines(findings).join('\n'))
      console.error('bench requires a valid eval suite — fix the findings above first')
      return 2
    }
    const outcome = await runBenchSuite(skill, {
      runner: deps.runner ?? spawnClaudeRunner(),
      cacheRoot: deps.cacheRoot ?? cacheRoot(),
      model: model ?? DEFAULT_MODEL,
      runs: runs ?? BENCH_DEFAULT_RUNS,
      fresh,
    })
    if (!outcome.ok) {
      console.log(json ? JSON.stringify({ error: outcome.message }) : outcome.message)
      return 1
    }
    console.log(json ? JSON.stringify(outcome.doc, null, 2) : formatBenchPretty(outcome.doc, outcome.cachedRuns, outcome.totalRuns))
    return 0
  } catch (e) {
    console.error(`bench failed: ${(e as Error).message}`)
    return 2
  }
}
