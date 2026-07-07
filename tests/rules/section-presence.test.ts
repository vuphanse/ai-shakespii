import { expect, test } from 'bun:test'
import { CT01 } from '../../src/lib/rules/CT01'
import { CT02 } from '../../src/lib/rules/CT02'
import { CT04 } from '../../src/lib/rules/CT04'
import { CT05 } from '../../src/lib/rules/CT05'
import { CT06 } from '../../src/lib/rules/CT06'
import { CT07 } from '../../src/lib/rules/CT07'
import { cleanSkillRaw, ctxFor, skillFromRaw } from '../helpers/skill'
import type { Rule } from '../../src/lib/types'

const CASES: Array<[Rule, string, string, string]> = [
  // rule, canonical heading to remove, canonical name in message, passing alias heading
  [CT01, 'Preconditions', 'Preconditions', 'Requirements'],
  [CT02, 'Output', 'Output', 'Output format'],
  [CT04, 'Inputs', 'Inputs', 'Arguments'],
  [CT05, 'Anti-patterns', 'Anti-patterns', 'Common Mistakes'],
  [CT06, 'Intent', 'Intent', 'Overview'],
  [CT07, 'Procedure', 'Procedure', 'Steps'],
]

for (const [rule, heading, canonical, alias] of CASES) {
  test(`${rule.id}: missing ${canonical} section is one null-line finding`, () => {
    const raw = cleanSkillRaw().replace(`## ${heading}`, '## Unrelated')
    const f = rule.check(skillFromRaw(raw), ctxFor(rule.id))
    expect(f).toHaveLength(1)
    expect(f[0].line).toBeNull()
    expect(f[0].message).toBe(`no ${canonical} section found (canonical "${canonical}" or an alias)`)
  })

  test(`${rule.id}: alias heading "${alias}" satisfies presence`, () => {
    const raw = cleanSkillRaw().replace(`## ${heading}`, `## ${alias}`)
    expect(rule.check(skillFromRaw(raw), ctxFor(rule.id))).toHaveLength(0)
  })

  test(`${rule.id}: no anatomy entry → no findings`, () => {
    const raw = cleanSkillRaw().replace(`## ${heading}`, '## Unrelated')
    expect(rule.check(skillFromRaw(raw), { options: {}, anatomy: {} })).toHaveLength(0)
  })
}

test('canonical full skeleton passes all six', () => {
  const skill = skillFromRaw(cleanSkillRaw())
  for (const [rule] of CASES) expect(rule.check(skill, ctxFor(rule.id))).toHaveLength(0)
})
