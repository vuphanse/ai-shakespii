import { expect, test } from 'bun:test'
import { HY03 } from '../../src/lib/rules/HY03'
import { cleanSkillRaw, ctxFor, skillFromRaw } from '../helpers/skill'

const CTX = ctxFor('HY03')

test('phrase hits fire once per phrase per line, with the phrase named', () => {
  const raw = cleanSkillRaw({ intent: 'Currently the tool ships as of 2026.' })
  const f = HY03.check(skillFromRaw(raw), CTX)
  expect(f).toHaveLength(2)
  expect(f[0].message).toBe('time-sensitive phrase "currently" — describe the steady state or move it under an Old patterns heading')
  expect(f[1].message).toContain('"as of"')
  expect(f[0].line).toBe(10)
})

test('bare dates and provenance markers never fire', () => {
  const raw = cleanSkillRaw({ intent: 'Last reviewed: 2026-07-07. Calibrated 2026-07.' })
  expect(HY03.check(skillFromRaw(raw), CTX)).toHaveLength(0)
})

test('<details> block and Old patterns heading are exempt', () => {
  const details = '<details>\nCurrently broken.\n</details>'
  expect(HY03.check(skillFromRaw(cleanSkillRaw({ intent: details })), CTX)).toHaveLength(0)
  const sib = {
    relPath: 'references/history.md',
    size: 80,
    text: '# history\n\n## Old patterns\n\nRecently we did X.\n\n## Now\n\nRecently again.\n',
  }
  const f = HY03.check(skillFromRaw(cleanSkillRaw(), [sib]), CTX)
  expect(f).toHaveLength(1)
  expect(f[0].file).toBe('references/history.md')
  expect(f[0].line).toBe(9)
})

test('phrases inside fences stay silent', () => {
  const raw = cleanSkillRaw({ intent: '```\ncurrently as of recently\n```' })
  expect(HY03.check(skillFromRaw(raw), CTX)).toHaveLength(0)
})
