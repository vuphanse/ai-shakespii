import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { EvalsJson, TriggersJson } from '../evals/types'
import { isRecord, validateTriggersJson } from '../evals/validate'
import type { ParsedSkill } from '../types'
import type { ClaudeRunner } from './claude-runner'
import { RUN_TIMEOUT_MS } from './claude-runner'
import { contaminationMessage, readPersistedEvents, scanContamination } from './contamination'
import { runDir, skillContentHash, triggerKey } from './run-dir'
import { renderTranscript } from './stream-json'
import type { HarnessFinding, StageReport, TriggerRunMeta } from './types'

export const TRIGGER_REPS = 3
export const TRIGGER_PASS_THRESHOLD = 0.5
export const TRIGGER_ACCURACY_THRESHOLD = 0.8

const TRIGGERS = 'evals/triggers.json'

const err = (message: string): HarnessFinding => ({ severity: 'error', message, file: TRIGGERS, line: null })
const warnF = (message: string): HarnessFinding => ({ severity: 'warn', message, file: TRIGGERS, line: null })

export type TriggerStageReport = Extract<StageReport, { stage: 'trigger'; status: 'pass' | 'fail' }>

export interface TriggerStageOptions {
  runner: ClaudeRunner
  cacheRoot: string
  model: string
  fresh: boolean
}

/** Wipes and recreates the rep dir, mounts the skill (no eval files, no preamble), returns outputs/. */
export function stageTriggerRunDir(skill: ParsedSkill, skillName: string, dir: string): string {
  rmSync(dir, { recursive: true, force: true })
  const outputs = join(dir, 'outputs')
  const mount = join(outputs, '.claude', 'skills', skillName)
  mkdirSync(mount, { recursive: true })
  cpSync(join(skill.dir, 'SKILL.md'), join(mount, 'SKILL.md'))
  for (const f of skill.files) {
    const dest = join(mount, f.relPath)
    mkdirSync(dirname(dest), { recursive: true })
    cpSync(join(skill.dir, f.relPath), dest)
  }
  return outputs
}

/** Cache gate: trigger.json exists, parses, and query/shouldTrigger match verbatim. Anything else is a self-healing miss. */
export function readValidCachedTrigger(dir: string, query: string, shouldTrigger: boolean): { triggered: boolean } | null {
  const p = join(dir, 'trigger.json')
  if (!existsSync(p)) return null
  let doc: unknown
  try {
    doc = JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return null
  }
  if (!isRecord(doc)) return null
  if (doc.query !== query || doc.shouldTrigger !== shouldTrigger) return null
  if (typeof doc.triggered !== 'boolean') return null
  return { triggered: doc.triggered }
}

/** Precondition: the deterministic stage ran on this skill with zero errors. */
export async function runTriggerStage(skill: ParsedSkill, options: TriggerStageOptions): Promise<TriggerStageReport> {
  const fail = (findings: HarnessFinding[]): TriggerStageReport =>
    ({ stage: 'trigger', status: 'fail', findings, queries: { passed: 0, total: 0 }, runs: [] })

  const entry = skill.files.find(f => f.relPath === TRIGGERS)
  if (!entry) return fail([err('evals/triggers.json missing — required by --triggers')])
  if (entry.text === null) return fail([err('evals/triggers.json is not valid JSON')])
  let doc: unknown
  try {
    doc = JSON.parse(entry.text)
  } catch {
    return fail([err('evals/triggers.json is not valid JSON')])
  }
  const diagnostics = validateTriggersJson(doc)
  if (diagnostics.length > 0) return fail(diagnostics.map(d => err(`evals/triggers.json: ${d.path} — ${d.message}`)))
  const triggers = doc as TriggersJson

  const evalsEntry = skill.files.find(f => f.relPath === 'evals/evals.json')
  if (!evalsEntry || evalsEntry.text === null) throw new Error('internal: runTriggerStage requires a deterministic-clean eval suite')
  const evalsDoc = JSON.parse(evalsEntry.text) as EvalsJson
  if (triggers.skill_name !== evalsDoc.skill_name) {
    return fail([err('evals/triggers.json: skill_name — must match evals.json skill_name')])
  }

  const skillName = evalsDoc.skill_name
  const skillHash = skillContentHash(skill)
  const findings: HarnessFinding[] = []
  const runs: TriggerRunMeta[] = []
  let passed = 0
  let measured = 0

  for (let qi = 0; qi < triggers.queries.length; qi++) {
    const { query, should_trigger } = triggers.queries[qi]
    let fired = 0
    let cached = 0
    let reps = 0
    let failStatus: 'timeout' | 'nonzero-exit' | null = null

    for (let rep = 1; rep <= TRIGGER_REPS; rep++) {
      const key = triggerKey({ skillHash, query, rep, model: options.model })
      const dir = runDir(options.cacheRoot, skillName, key)

      if (!options.fresh) {
        const hit = readValidCachedTrigger(dir, query, should_trigger)
        if (hit !== null) {
          reps += 1
          cached += 1
          if (hit.triggered) fired += 1
          for (const c of scanContamination(readPersistedEvents(dir), [skillName])) {
            findings.push(warnF(contaminationMessage(c, `query ${qi} rep ${rep}`)))
          }
          continue
        }
      }

      const attemptOnce = async () => {
        const outputs = stageTriggerRunDir(skill, skillName, dir)
        const result = await options.runner.run({
          prompt: query,
          cwd: outputs,
          model: options.model,
          timeoutMs: RUN_TIMEOUT_MS,
          detect: { skillName },
        })
        writeFileSync(join(dir, 'events.jsonl'), result.events.map(e => JSON.stringify(e)).join('\n') + (result.events.length > 0 ? '\n' : ''))
        writeFileSync(join(dir, 'transcript.md'), renderTranscript({ skillName, evalId: qi, prompt: query, events: result.events }))
        return result
      }

      let result = await attemptOnce()
      if (result.status !== 'completed') result = await attemptOnce() // single retry, identical request
      reps += 1
      for (const c of scanContamination(result.events, [skillName])) {
        findings.push(warnF(contaminationMessage(c, `query ${qi} rep ${rep}`)))
      }
      if (result.status !== 'completed') {
        failStatus = result.status
        findings.push(err(`trigger run failed (query ${qi}, rep ${rep}): ${result.status} — ${result.errorMessage ?? 'no detail'}`))
        break
      }
      const triggered = result.triggered === true
      if (triggered) fired += 1
      writeFileSync(
        join(dir, 'trigger.json'),
        `${JSON.stringify({ query, shouldTrigger: should_trigger, rep, triggered, status: 'ok', durationSeconds: result.durationSeconds }, null, 2)}\n`,
      )
    }

    if (failStatus !== null) {
      runs.push({ queryIndex: qi, shouldTrigger: should_trigger, triggered: fired, reps, cached, status: failStatus })
      continue
    }
    measured += 1
    const rate = fired / TRIGGER_REPS
    const pass = should_trigger ? rate >= TRIGGER_PASS_THRESHOLD : rate < TRIGGER_PASS_THRESHOLD
    if (pass) passed += 1
    runs.push({ queryIndex: qi, shouldTrigger: should_trigger, triggered: fired, reps, cached, status: 'ok' })
  }

  if (measured > 0) {
    const accuracy = passed / measured
    if (accuracy < TRIGGER_ACCURACY_THRESHOLD) {
      findings.push(err(`trigger accuracy ${accuracy.toFixed(2)} below threshold 0.8 (${passed}/${measured} queries)`))
    }
  }
  return { stage: 'trigger', status: findings.some(f => f.severity === 'error') ? 'fail' : 'pass', findings, queries: { passed, total: measured }, runs }
}
