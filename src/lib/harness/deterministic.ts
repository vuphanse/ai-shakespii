import { isRecord, validateEvalsJson } from '../evals/validate'
import type { ParsedSkill } from '../types'
import type { HarnessFinding } from './types'

const EVALS = 'evals/evals.json'
const MIN_CASES = 3

const err = (message: string): HarnessFinding => ({ severity: 'error', message, file: EVALS, line: null })

export function runDeterministic(skill: ParsedSkill): HarnessFinding[] {
  const entry = skill.files.find(f => f.relPath === EVALS)
  if (!entry) {
    return [err('no evals/evals.json — author evals first (see TR01); shakespii test requires a reproducible eval suite')]
  }
  if (entry.text === null) return [err('evals/evals.json is not readable as UTF-8 text')]
  let doc: unknown
  try {
    doc = JSON.parse(entry.text)
  } catch (e) {
    return [err(`evals/evals.json is not valid JSON: ${(e as Error).message}`)]
  }
  const diagnostics = validateEvalsJson(doc)
  const out: HarnessFinding[] = diagnostics.map(d => err(`${d.path}: ${d.message}`))
  if (isRecord(doc)) {
    const fmName = skill.frontmatter.parsed?.['name']
    if (typeof doc.skill_name === 'string' && doc.skill_name.length > 0 && typeof fmName === 'string' && doc.skill_name !== fmName) {
      out.push(err(`skill_name "${doc.skill_name}" does not match frontmatter name "${fmName}"`))
    }
    if (Array.isArray(doc.evals)) {
      const inventory = new Set(skill.files.map(f => f.relPath))
      doc.evals.forEach((c: unknown, i: number) => {
        if (!isRecord(c) || !Array.isArray(c.files)) return
        c.files.forEach((f: unknown, j: number) => {
          if (typeof f !== 'string' || f.length === 0) return
          if (f.startsWith('/') || f.split('/').includes('..')) {
            out.push(err(`evals[${i}].files[${j}]: path escapes the skill directory ("${f}")`))
          } else if (!inventory.has(f)) {
            out.push(err(`evals[${i}].files[${j}]: file not found ("${f}")`))
          }
        })
      })
      if (diagnostics.length === 0 && doc.evals.length < MIN_CASES) {
        out.push({
          severity: 'warn',
          message: `only ${doc.evals.length} eval case(s) — Anthropic guidance is a minimum of three`,
          file: EVALS,
          line: null,
        })
      }
    }
  }
  return out
}
