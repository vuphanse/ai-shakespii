import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { EvalCase, GradingJson } from '../evals/types'
import { validateGradingJson } from '../evals/validate'
import type { ParsedSkill } from '../types'

export interface ScenarioRunMeta {
  evalId: number
  cached: boolean
  status: 'ok' | 'timeout' | 'nonzero-exit' | 'no-result'
  durationSeconds: number
}

export function buildExecutorPrompt(skillName: string, evalPrompt: string): string {
  return `A skill named "${skillName}" is installed at .claude/skills/${skillName}/. Read .claude/skills/${skillName}/SKILL.md first, then complete this task following the skill:\n\n${evalPrompt}`
}

/** Wipes and recreates the run dir, stages the skill mount and eval files, returns the outputs/ path (the executor cwd). */
export function stageRunDir(skill: ParsedSkill, evalCase: EvalCase, skillName: string, dir: string): string {
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
  for (const rel of evalCase.files ?? []) {
    const dest = join(outputs, rel)
    mkdirSync(dirname(dest), { recursive: true })
    cpSync(join(skill.dir, rel), dest)
  }
  return outputs
}

/**
 * Cache gate: grading.json must exist, parse, pass validateGradingJson, AND pass
 * rubric fidelity (expectation texts verbatim, same count and order vs the current
 * case). Anything else is a self-healing cache miss (spec §5 step 2).
 */
export function readValidCachedGrading(dir: string, expectations: string[]): GradingJson | null {
  const p = join(dir, 'grading.json')
  if (!existsSync(p)) return null
  let doc: unknown
  try {
    doc = JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return null
  }
  if (validateGradingJson(doc).length > 0) return null
  const g = doc as GradingJson
  if (g.expectations.length !== expectations.length) return null
  for (let i = 0; i < expectations.length; i++) {
    if (g.expectations[i].text !== expectations[i]) return null
  }
  return g
}
