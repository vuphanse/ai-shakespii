import { isRecord, validateEvalsJson } from '../evals/validate'
import type { ParsedSkill } from '../types'
import type { HarnessFinding } from './types'

const EVALS = 'evals/evals.json'
const MIN_CASES = 3

const err = (message: string): HarnessFinding => ({ severity: 'error', message, file: EVALS, line: null })
const fmErr = (message: string): HarnessFinding => ({ severity: 'error', message, file: 'SKILL.md', line: null })

/**
 * Routing-frontmatter gate: the LLM stages depend on frontmatter `name` and
 * `description` (skillRoutingHash keys trigger caches on them), and the
 * documented precondition everywhere is that deterministic-clean guarantees
 * both. Enforce it here so a malformed skill fails this stage with a finding
 * instead of crashing an internal invariant later. Same non-empty-string
 * semantics as lint's FM01.
 */
function routingFrontmatterFindings(skill: ParsedSkill): HarnessFinding[] {
  const out: HarnessFinding[] = []
  for (const field of ['name', 'description']) {
    const v = skill.frontmatter.parsed?.[field]
    if (typeof v !== 'string' || v.trim() === '') {
      out.push(fmErr(`frontmatter ${field} must be a non-empty string — the harness requires routing frontmatter (see FM01)`))
    }
  }
  return out
}

export function runDeterministic(skill: ParsedSkill): HarnessFinding[] {
  const fm = routingFrontmatterFindings(skill)
  const entry = skill.files.find(f => f.relPath === EVALS)
  if (!entry) {
    return [...fm, err('no evals/evals.json — author evals first (see TR01); shakespii test requires a reproducible eval suite')]
  }
  if (entry.text === null) return [...fm, err('evals/evals.json is not readable as UTF-8 text')]
  let doc: unknown
  try {
    doc = JSON.parse(entry.text)
  } catch (e) {
    return [...fm, err(`evals/evals.json is not valid JSON: ${(e as Error).message}`)]
  }
  const diagnostics = validateEvalsJson(doc)
  const out: HarnessFinding[] = [...fm, ...diagnostics.map(d => err(`${d.path}: ${d.message}`))]
  if (isRecord(doc)) {
    const fmName = skill.frontmatter.parsed?.['name']
    if (typeof doc.skill_name === 'string' && doc.skill_name.length > 0 && typeof fmName === 'string' && doc.skill_name !== fmName) {
      out.push(err(`skill_name "${doc.skill_name}" does not match frontmatter name "${fmName}"`))
    }
    if (typeof doc.skill_name === 'string' && doc.skill_name.length > 0 && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(doc.skill_name)) {
      out.push(err('skill_name must be a safe path segment'))
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
