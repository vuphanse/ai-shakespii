import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { parseSkill } from '../../src/lib/parser'
import { loadProfile, resolveRule } from '../../src/lib/profile/load'
import { CT03 } from '../../src/lib/rules/CT03'
import { cleanSkillRaw, ctxFor, skillFromRaw } from '../helpers/skill'

const profile = loadProfile(join(import.meta.dir, '../../profiles/default.yaml'))
const CTX = { options: resolveRule(profile.rules['CT03']).options, anatomy: profile.anatomy }
const fx = (name: string) => parseSkill(join(import.meta.dir, '../fixtures', name))

test('no Examples section: one finding with null line', () => {
  const f = CT03.check(fx('ct03-no-examples'), CTX)
  expect(f).toHaveLength(1)
  expect(f[0].line).toBeNull()
  expect(f[0].message).toContain('no Examples section')
})

test('alias heading with a real worked pair passes', () => {
  expect(CT03.check(fx('ct03-alias-heading'), CTX)).toHaveLength(0)
})

test('placeholder-only Examples fails via the token branch', () => {
  const f = CT03.check(fx('ct03-placeholder-only'), CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toContain('unfilled placeholder')
  expect(f[0].line).toBe(7)
})

test('trigger-phrase list does not count', () => {
  const f = CT03.check(fx('ct03-trigger-list-only'), CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toContain('no concrete input→output')
})

test('generic prose without an input→output pair fails', () => {
  const f = CT03.check(fx('ct03-generic-prose'), CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toContain('no concrete input→output')
})

test('minimal-pass passes (Given … expected output …)', () => {
  expect(CT03.check(fx('minimal-pass'), CTX)).toHaveLength(0)
})

test('quoted input→output one-liner counts as a worked example', () => {
  // The example must carry an input marker ("given") — CT03's marker logic is
  // unchanged by this fix; only the over-eager stripping is corrected.
  const raw = cleanSkillRaw({ examples: '- "given report.pdf" → "the extracted tables as CSV"' })
  expect(CT03.check(skillFromRaw(raw), ctxFor('CT03'))).toHaveLength(0)
})

test('bare quoted trigger-phrase list is still stripped', () => {
  const raw = cleanSkillRaw({ examples: '- "use this for PDFs"\n- "extract my tables"' })
  const f = CT03.check(skillFromRaw(raw), ctxFor('CT03'))
  expect(f).toHaveLength(1)
  expect(f[0].message).toContain('no concrete input→output')
})
