import { expect, test } from 'bun:test'
import { ST04 } from '../../src/lib/rules/ST04'
import { cleanSkillRaw, ctxFor, skillFromRaw } from '../helpers/skill'

const CTX = ctxFor('ST04')

test('@path in body prose fires with the bare-path suggestion', () => {
  const raw = cleanSkillRaw({ procedure: '1. Read @references/guide.md first.' })
  const f = ST04.check(skillFromRaw(raw), CTX)
  expect(f).toHaveLength(1)
  expect(f[0].file).toBe('SKILL.md')
  expect(f[0].message).toBe('@-prefixed link "@references/guide.md" force-loads the file into context — use the bare path instead')
})

test('email addresses and non-path @mentions stay silent', () => {
  const raw = cleanSkillRaw({ procedure: 'Mail vu.phan.se@gmail.com or ping @reviewer.' })
  expect(ST04.check(skillFromRaw(raw), CTX)).toHaveLength(0)
})

test('@path inside a fence or inline code stays silent', () => {
  const raw = cleanSkillRaw({ procedure: '```\n@references/guide.md\n```\nAnd `@references/guide.md` inline.' })
  expect(ST04.check(skillFromRaw(raw), CTX)).toHaveLength(0)
})

test('md siblings are scanned with sibling attribution', () => {
  const sib = { relPath: 'references/notes.md', size: 30, text: 'Read @docs/plan.md now.\n' }
  const f = ST04.check(skillFromRaw(cleanSkillRaw(), [sib]), CTX)
  expect(f).toHaveLength(1)
  expect(f[0].file).toBe('references/notes.md')
  expect(f[0].line).toBe(1)
})

test('quoted-utterance @-paths still fire (verified 2026-07-08: @-expansion ignores quoting — docs/CALIBRATION-M3B.md)', () => {
  const f = ST04.check(skillFromRaw(cleanSkillRaw({ procedure: '- *"run SDD on the spec @docs/spec.md"*' })), CTX)
  expect(f).toHaveLength(1)
})
