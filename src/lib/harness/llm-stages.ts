import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { EvalCase, EvalsJson } from '../evals/types'
import type { ParsedSkill } from '../types'
import type { ClaudeRunner } from './claude-runner'
import { RUN_TIMEOUT_MS } from './claude-runner'
import type { ScenarioRunMeta } from './executor'
import { buildExecutorPrompt, readValidCachedGrading, stageRunDir } from './executor'
import { gradeCase, gradingFindings } from './grader'
import { runDir, runKey, skillContentHash } from './run-dir'
import { deriveMetrics, extractFinalText, renderTranscript } from './stream-json'
import type { HarnessFinding, StageReport } from './types'

export interface LlmStagesOptions {
  runner: ClaudeRunner
  cacheRoot: string
  model: string
  fresh: boolean
}

const err = (message: string): HarnessFinding => ({ severity: 'error', message, file: 'evals/evals.json', line: null })

/** Precondition: the deterministic stage ran on this skill with zero errors. */
export async function runLlmStages(
  skill: ParsedSkill,
  options: LlmStagesOptions,
): Promise<{
  scenario: Extract<StageReport, { stage: 'scenario'; status: 'pass' | 'fail' }>
  grading: Extract<StageReport, { stage: 'grading'; status: 'pass' | 'fail' }>
}> {
  const entry = skill.files.find(f => f.relPath === 'evals/evals.json')
  if (!entry || entry.text === null) throw new Error('internal: runLlmStages requires a deterministic-clean eval suite')
  const doc = JSON.parse(entry.text) as EvalsJson
  const cases: EvalCase[] = [...doc.evals].sort((a, b) => a.id - b.id)
  const skillName = doc.skill_name
  const skillHash = skillContentHash(skill)

  const scenarioFindings: HarnessFinding[] = []
  const gradingFindingsAll: HarnessFinding[] = []
  const runs: ScenarioRunMeta[] = []
  let passedTotal = 0
  let gradedTotal = 0

  for (const evalCase of cases) {
    const key = runKey({ skillHash, evalId: evalCase.id, model: options.model })
    const dir = runDir(options.cacheRoot, skillName, key)

    if (!options.fresh) {
      const cached = readValidCachedGrading(dir, evalCase.expectations)
      if (cached !== null) {
        runs.push({ evalId: evalCase.id, cached: true, status: 'ok', durationSeconds: 0 })
        gradingFindingsAll.push(...gradingFindings(evalCase.id, cached))
        passedTotal += cached.summary.passed
        gradedTotal += cached.summary.total
        continue
      }
    }

    const outputs = stageRunDir(skill, evalCase, skillName, dir)
    const prompt = buildExecutorPrompt(skillName, evalCase.prompt)
    const result = await options.runner.run({ prompt, cwd: outputs, model: options.model, timeoutMs: RUN_TIMEOUT_MS })

    const transcript = renderTranscript({ skillName, evalId: evalCase.id, prompt, events: result.events })
    const metrics = deriveMetrics(result.events, transcript)
    writeFileSync(join(dir, 'events.jsonl'), result.events.map(e => JSON.stringify(e)).join('\n') + (result.events.length > 0 ? '\n' : ''))
    writeFileSync(join(dir, 'transcript.md'), transcript)
    writeFileSync(join(outputs, 'metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`)

    const noResult = result.status === 'completed' && extractFinalText(result.events) === null
    if (result.status !== 'completed' || noResult) {
      const status = result.status === 'completed' ? 'no-result' : result.status
      scenarioFindings.push(err(`eval ${evalCase.id}: executor ${status} — ${result.errorMessage ?? 'no result event'}`))
      runs.push({ evalId: evalCase.id, cached: false, status, durationSeconds: result.durationSeconds })
      continue
    }
    runs.push({ evalId: evalCase.id, cached: false, status: 'ok', durationSeconds: result.durationSeconds })

    const graded = await gradeCase({
      evalCase,
      dir,
      runner: options.runner,
      model: options.model,
      executorDurationSeconds: result.durationSeconds,
      metrics,
    })
    if ('failure' in graded) {
      gradingFindingsAll.push(err(`eval ${evalCase.id}: ${graded.failure}`))
      continue
    }
    gradingFindingsAll.push(...gradingFindings(evalCase.id, graded.grading))
    passedTotal += graded.grading.summary.passed
    gradedTotal += graded.grading.summary.total
  }

  return {
    scenario: {
      stage: 'scenario',
      status: scenarioFindings.length > 0 ? 'fail' : 'pass',
      findings: scenarioFindings,
      runs,
    },
    grading: {
      stage: 'grading',
      status: gradingFindingsAll.length > 0 ? 'fail' : 'pass',
      findings: gradingFindingsAll,
      expectations: { passed: passedTotal, total: gradedTotal },
    },
  }
}
