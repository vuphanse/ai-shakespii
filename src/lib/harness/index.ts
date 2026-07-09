import type { ParsedSkill } from '../types'
import type { ClaudeRunner } from './claude-runner'
import { DEFAULT_MODEL, spawnClaudeRunner } from './claude-runner'
import { runDeterministic } from './deterministic'
import { runLlmStages } from './llm-stages'
import { cacheRoot } from './run-dir'
import { runTriggerStage } from './trigger-stage'
import type { HarnessFinding, StageReport, TestResult } from './types'

export type { HarnessFinding, StageReport, TestResult } from './types'
export { ClaudeUnavailableError, DEFAULT_MODEL, RUN_TIMEOUT_MS } from './claude-runner'
export type { ClaudeRunner } from './claude-runner'

export interface TestOptions {
  run?: boolean
  fresh?: boolean
  model?: string
  triggers?: boolean
  runner?: ClaudeRunner
  cacheRoot?: string
}

const SKIP_NO_RUN = 'pass --run to execute LLM stages'
const SKIP_DET_FAILED = 'deterministic stage failed'

const countBySeverity = (findings: HarnessFinding[]): { errors: number; warnings: number } => {
  const errors = findings.filter(f => f.severity === 'error').length
  return { errors, warnings: findings.length - errors }
}

export async function testSkill(skill: ParsedSkill, options: TestOptions = {}): Promise<TestResult> {
  const detFindings = runDeterministic(skill)
  const det = countBySeverity(detFindings)
  const deterministic: StageReport = { stage: 'deterministic', status: det.errors > 0 ? 'fail' : 'pass', findings: detFindings }

  let scenario: StageReport
  let grading: StageReport
  let trigger: StageReport | null = null
  if (!options.run) {
    scenario = { stage: 'scenario', status: 'skipped', note: SKIP_NO_RUN }
    grading = { stage: 'grading', status: 'skipped', note: SKIP_NO_RUN }
  } else if (det.errors > 0) {
    scenario = { stage: 'scenario', status: 'skipped', note: SKIP_DET_FAILED }
    grading = { stage: 'grading', status: 'skipped', note: SKIP_DET_FAILED }
    if (options.triggers) trigger = { stage: 'trigger', status: 'skipped', note: SKIP_DET_FAILED }
  } else {
    const stageOptions = {
      runner: options.runner ?? spawnClaudeRunner(),
      cacheRoot: options.cacheRoot ?? cacheRoot(),
      model: options.model ?? DEFAULT_MODEL,
      fresh: options.fresh ?? false,
    }
    const res = await runLlmStages(skill, stageOptions)
    scenario = res.scenario
    grading = res.grading
    if (options.triggers) trigger = await runTriggerStage(skill, stageOptions)
  }

  const stages: StageReport[] = trigger === null ? [deterministic, scenario, grading] : [deterministic, scenario, grading, trigger]
  const allFindings = stages.flatMap(s => ('findings' in s ? s.findings : []))
  const name = skill.frontmatter.parsed?.['name']
  return {
    skill: { dir: skill.dir, name: typeof name === 'string' ? name : null },
    stages,
    summary: countBySeverity(allFindings),
  }
}
