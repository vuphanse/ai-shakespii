import type { Rule } from '../types'
import { fieldLine } from './frontmatter-util'

// SemVer 2.0 (semver.org grammar): no leading zeros in numeric identifiers;
// pre-release/build identifiers are dot-separated and non-empty; numeric
// pre-release identifiers have no leading zeros.
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

export const FM05: Rule = {
  id: 'FM05',
  check(skill) {
    const fm = skill.frontmatter.parsed
    if (fm === null) return [] // FM01 owns malformed/absent frontmatter
    if (!('version' in fm)) {
      return [{ message: 'version field missing — skills are versioned components (semver)', file: 'SKILL.md', line: 1 }]
    }
    const v = fm['version']
    if (typeof v === 'string' && SEMVER.test(v)) return []
    const shown = typeof v === 'string' ? v : String(v)
    return [{ message: `version "${shown}" is not valid semver`, file: 'SKILL.md', line: fieldLine(skill, 'version') }]
  },
}
