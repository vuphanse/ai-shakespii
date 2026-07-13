import { validateTriggersJson } from '../evals/validate'
import type { TriggersJson } from '../evals/types'
import type { Rule } from '../types'

const TRIGGERS = 'evals/triggers.json'

/**
 * Leading-"/" trigger queries never reach the model — the Claude Code CLI
 * intercepts them as slash commands — so their trigger measurements are
 * meaningless (measured, M5d: /-prefixed kickoff queries fired 0/3 while
 * $-prefixed equivalents fired 3/3). Queries only: a description may
 * legitimately document /-forms, which work in real interactive use; only
 * the harness measurement path is blind to them — never extend this rule to
 * descriptions. Gated behind TR02's validity checks so missing/invalid
 * suites stay TR02's findings; at most one finding per skill (TR01/TR02
 * cap precedent).
 */
export const TR03: Rule = {
  id: 'TR03',
  check(skill) {
    const entry = skill.files.find(f => f.relPath === TRIGGERS)
    if (!entry || entry.text === null) return []
    let doc: unknown
    try {
      doc = JSON.parse(entry.text)
    } catch {
      return []
    }
    if (validateTriggersJson(doc).length > 0) return []
    const triggers = doc as TriggersJson
    const indices = triggers.queries.flatMap((q, i) => (q.query.trimStart().startsWith('/') ? [i] : []))
    if (indices.length === 0) return []
    return [{
      message: `evals/triggers.json has leading-"/" queries at indices [${indices.join(', ')}] — the Claude Code CLI intercepts slash commands before the model sees them, so their trigger measurements are meaningless (measured, M5d); use $-prefixed or prose phrasings instead`,
      file: TRIGGERS,
      line: null,
    }]
  },
}
