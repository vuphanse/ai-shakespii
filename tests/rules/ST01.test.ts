import { expect, test } from 'bun:test'
import { ST01 } from '../../src/lib/rules/ST01'
import { cleanSkillRaw, ctxFor, skillFromRaw } from '../helpers/skill'

const CTX = ctxFor('ST01')
const fmOnly = '---\nname: test-skill\ndescription: "Use when testing."\nversion: 0.1.0\n---\n'

test('clean skeleton: no findings', () => {
  expect(ST01.check(skillFromRaw(cleanSkillRaw()), CTX)).toHaveLength(0)
})

test('missing H1: one warn finding', () => {
  const f = ST01.check(skillFromRaw(`${fmOnly}\n## Intent\n\nNo title here.\n`), CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toBe('no H1 title found')
  expect(f[0].severity).toBeUndefined()
})

test('word budget breach: warn naming the count', () => {
  const f = ST01.check(skillFromRaw(`${fmOnly}# t\n\n${'word '.repeat(2100)}\n`), CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toMatch(/^body is \d+ words \(budget 2000\)$/)
  expect(f[0].severity).toBeUndefined()
})

test('hard word breach: single error-override finding subsumes the word warn', () => {
  const f = ST01.check(skillFromRaw(`${fmOnly}# t\n\n${'word '.repeat(3100)}\n`), CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toMatch(/^body is \d+ words \(hard limit 3000\)$/)
  expect(f[0].severity).toBe('error')
})

test('line budget breach: warn; co-fires with hard word breach', () => {
  const longLines = Array.from({ length: 520 }, () => 'seven words on this line here now').join('\n')
  const f = ST01.check(skillFromRaw(`${fmOnly}# t\n\n${longLines}\n`), CTX)
  expect(f).toHaveLength(2)
  expect(f.map(x => x.message).join(' | ')).toMatch(/hard limit 3000/)
  expect(f.map(x => x.message).join(' | ')).toMatch(/lines \(budget 500\)/)
})
