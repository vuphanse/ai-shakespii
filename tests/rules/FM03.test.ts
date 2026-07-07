import { expect, test } from 'bun:test'
import { FM03 } from '../../src/lib/rules/FM03'
import { cleanSkillRaw, ctxFor, skillFromRaw } from '../helpers/skill'

const descOf = (n: number) => `Use when ${'x'.repeat(n)}`.slice(0, n)

test('short description: no findings', () => {
  expect(FM03.check(skillFromRaw(cleanSkillRaw()), ctxFor('FM03'))).toHaveLength(0)
})

test('description over 500 chars: one warn-tier finding', () => {
  const f = FM03.check(skillFromRaw(cleanSkillRaw({ description: descOf(501) })), ctxFor('FM03'))
  expect(f).toHaveLength(1)
  expect(f[0].message).toBe('description is 501 chars (warn threshold 500)')
  expect(f[0].severity).toBeUndefined()
  expect(f[0].line).toBe(3)
})

test('description over 1024 chars: one finding with error override, warn subsumed', () => {
  const f = FM03.check(skillFromRaw(cleanSkillRaw({ description: descOf(1025) })), ctxFor('FM03'))
  expect(f).toHaveLength(1)
  expect(f[0].message).toBe('description is 1025 chars (hard limit 1024)')
  expect(f[0].severity).toBe('error')
})
