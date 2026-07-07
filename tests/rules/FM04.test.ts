import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { parseSkill } from '../../src/lib/parser'
import { FM04 } from '../../src/lib/rules/FM04'
import { cleanSkillRaw, ctxFor, skillFromRaw } from '../helpers/skill'

const CTX = {
  options: { triggerPatterns: ['use when', 'use for', 'use if', 'use this', 'invoke when', 'when the user'] },
  anatomy: {},
}
const fx = (name: string) => parseSkill(join(import.meta.dir, '../fixtures', name))

test('first person: one finding (trigger prefix is satisfied)', () => {
  const f = FM04.check(fx('fm04-first-person'), CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toContain('third person')
  expect(f[0].line).toBe(3)
})

test('no trigger phrase at all: one finding', () => {
  const f = FM04.check(fx('fm04-no-trigger'), CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toContain('begin with a trigger phrase')
})

test('trigger phrase mid-prose is NOT enough (prefix semantics)', () => {
  const f = FM04.check(fx('fm04-trigger-not-first'), CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toContain('begin with a trigger phrase')
})

test('scaffold placeholder description fails FM04 (M1 §3.4)', () => {
  const skill = fx('minimal-pass')
  const doctored = {
    ...skill,
    frontmatter: {
      ...skill.frontmatter,
      parsed: { ...skill.frontmatter.parsed!, description: 'TODO(shakespii): Use when <trigger>… — third person, concrete searchable keywords; do not summarize the workflow.' },
    },
  }
  expect(FM04.check(doctored, CTX)).toHaveLength(1)
})

test('absent description: zero findings (FM01 territory)', () => {
  expect(FM04.check(fx('fm01-no-frontmatter'), CTX)).toHaveLength(0)
})

test('minimal-pass: zero findings', () => {
  expect(FM04.check(fx('minimal-pass'), CTX)).toHaveLength(0)
})

test('"I/O" in the description is not first person', () => {
  const raw = cleanSkillRaw({ description: 'Use when handling file I/O in a build script.' })
  expect(FM04.check(skillFromRaw(raw), ctxFor('FM04'))).toHaveLength(0)
})

test('pronoun I still fires', () => {
  const raw = cleanSkillRaw({ description: 'Use when I need to summarize a thread.' })
  const f = FM04.check(skillFromRaw(raw), ctxFor('FM04'))
  expect(f).toHaveLength(1)
  expect(f[0].message).toContain('third person')
})
