import { expect, test } from 'bun:test'
import { ST05 } from '../../src/lib/rules/ST05'
import { cleanSkillRaw, ctxFor, skillFromRaw } from '../helpers/skill'

const CTX = ctxFor('ST05')
const FURNITURE = '\n| Excuse | Reality |\n|---|---|\n| busy | do it |\n\n## Red Flags\n\n- skipping steps\n'

test('no discipline emphasis: silent even without furniture', () => {
  expect(ST05.check(skillFromRaw(cleanSkillRaw()), CTX)).toHaveLength(0)
})

test('iron law without any furniture: one finding naming both halves', () => {
  const raw = cleanSkillRaw({ procedure: 'This is the iron law of the skill.' })
  const f = ST05.check(skillFromRaw(raw), CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toBe(
    'discipline emphasis found without a rationalization table with a Reality column or a Red Flags heading',
  )
})

test('caps tag triggers; complete furniture satisfies', () => {
  const raw = cleanSkillRaw({ procedure: `<HARD-GATE>stop</HARD-GATE>\n${FURNITURE}` })
  expect(ST05.check(skillFromRaw(raw), CTX)).toHaveLength(0)
})

test('three MUST/NEVER tokens combined trigger; table-only names the missing heading', () => {
  const raw = cleanSkillRaw({ procedure: 'You MUST run it. NEVER skip. You MUST commit.\n\n| Thought | Reality |\n|---|---|\n| fine | not fine |' })
  const f = ST05.check(skillFromRaw(raw), CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toBe('discipline emphasis found without a Red Flags heading')
})

test('Reality only in a data row does not satisfy the table half', () => {
  const table = '| Excuse | Response |\n|---|---|\n| busy | Reality check |'
  const raw = cleanSkillRaw({ procedure: `This is the iron law.\n\n${table}\n\n## Red Flags\n\n- skipping steps` })
  const f = ST05.check(skillFromRaw(raw), CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toBe('discipline emphasis found without a rationalization table with a Reality column')
})

test('two MUST tokens do not trigger; caps inside fences do not trigger', () => {
  expect(ST05.check(skillFromRaw(cleanSkillRaw({ procedure: 'You MUST run it. You MUST commit.' })), CTX)).toHaveLength(0)
  expect(ST05.check(skillFromRaw(cleanSkillRaw({ procedure: '```\nMUST NEVER MUST <HARD-GATE>\n```' })), CTX)).toHaveLength(0)
})
