import { validateTriggersJson } from '../evals/validate'
import type { TriggersJson } from '../evals/types'
import type { Rule } from '../types'

const TRIGGERS = 'evals/triggers.json'

/**
 * At most one finding per skill (TR01 cap precedent): lint is the cheap
 * always-on surface; measured trigger accuracy lives in `test --triggers`.
 * Static and tokenless — never spawns anything.
 */
export const TR02: Rule = {
  id: 'TR02',
  check(skill, ctx) {
    const entry = skill.files.find(f => f.relPath === TRIGGERS)
    if (!entry) {
      return [{
        message: 'no evals/triggers.json — add a trigger-accuracy query set (16+ labeled queries incl. negatives)',
        file: 'SKILL.md',
        line: null,
      }]
    }
    let doc: unknown
    let parseFailed = entry.text === null
    if (!parseFailed) {
      try {
        doc = JSON.parse(entry.text as string)
      } catch {
        parseFailed = true
      }
    }
    const n = parseFailed ? 1 : validateTriggersJson(doc).length
    if (n > 0) {
      return [{
        message: `evals/triggers.json fails validation (${n} error${n === 1 ? '' : 's'})`,
        file: TRIGGERS,
        line: null,
      }]
    }
    const triggers = doc as TriggersJson
    const minQueries = typeof ctx.options.minQueries === 'number' ? ctx.options.minQueries : 16
    if (triggers.queries.length < minQueries) {
      return [{
        message: `evals/triggers.json has ${triggers.queries.length} queries, fewer than ${minQueries}`,
        file: TRIGGERS,
        line: null,
      }]
    }
    if (!triggers.queries.some(q => q.should_trigger === false)) {
      return [{ message: 'evals/triggers.json has no negative queries (should_trigger: false)', file: TRIGGERS, line: null }]
    }
    return []
  },
}
