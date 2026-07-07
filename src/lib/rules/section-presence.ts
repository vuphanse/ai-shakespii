import type { Rule } from '../types'
import { matchAnatomySections } from './anatomy'

/** Presence-only anatomy check (CT01/CT02/CT04–CT07). Content depth is the M4 harness's job. */
export function sectionPresenceRule(id: string, anatomyKey: string): Rule {
  return {
    id,
    check(skill, ctx) {
      const entry = ctx.anatomy[anatomyKey]
      if (!entry) return []
      if (matchAnatomySections(skill, entry).length > 0) return []
      return [{
        message: `no ${entry.canonical} section found (canonical "${entry.canonical}" or an alias)`,
        file: 'SKILL.md',
        line: null,
      }]
    },
  }
}
