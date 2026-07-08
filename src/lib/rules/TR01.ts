import { runDeterministic } from '../harness/deterministic'
import type { Rule } from '../types'

const EVALS = 'evals/evals.json'

/**
 * At most one finding per skill: lint is the cheap always-on surface; the full
 * diagnostic list lives in `shakespii test` (ST02/CT02 dedup precedent).
 */
export const TR01: Rule = {
  id: 'TR01',
  check(skill, ctx) {
    const entry = skill.files.find(f => f.relPath === EVALS)
    if (!entry) {
      return [{ message: 'skill ships no evals/evals.json — no reproducible eval', file: 'SKILL.md', line: null }]
    }
    const errors = runDeterministic(skill).filter(f => f.severity === 'error').length
    if (errors > 0) {
      return [{
        message: `evals/evals.json fails validation (${errors} error${errors === 1 ? '' : 's'}) — run shakespii test for details`,
        file: EVALS,
        line: null,
      }]
    }
    const minCases = typeof ctx.options.minCases === 'number' ? ctx.options.minCases : 3
    const doc = JSON.parse(entry.text as string) as { evals?: unknown[] }
    const n = Array.isArray(doc.evals) ? doc.evals.length : 0
    if (n < minCases) {
      return [{ message: `only ${n} eval case(s) — Anthropic guidance is a minimum of three`, file: EVALS, line: null }]
    }
    return []
  },
}
