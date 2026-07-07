import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { parseSkill } from '../../src/lib/parser'
import { FM02, NAME_RE } from '../../src/lib/rules/FM02'

const CTX = { options: {}, anatomy: {} }
const fx = (name: string) => parseSkill(join(import.meta.dir, '../fixtures', name))

test('NAME_RE accepts kebab-case, rejects everything else', () => {
  expect(NAME_RE.test('good-name-2')).toBe(true)
  expect(NAME_RE.test('Bad_Name')).toBe(false)
  expect(NAME_RE.test('-leading')).toBe(false)
  expect(NAME_RE.test('double--dash')).toBe(false)
})

test('bad name: regex violation and dir mismatch each produce a finding', () => {
  const f = FM02.check(fx('fm02-bad-name'), CTX)
  expect(f).toHaveLength(2) // "Bad_Name" fails regex AND differs from dir "fm02-bad-name"
  expect(f[0].message).toContain('kebab-case')
  expect(f[0].line).toBe(2)
})

test('dir mismatch only: exactly one finding naming both values', () => {
  const f = FM02.check(fx('fm02-dir-mismatch'), CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toContain('"other-name"')
  expect(f[0].message).toContain('"fm02-dir-mismatch"')
})

test('absent name: zero findings (FM01 territory)', () => {
  expect(FM02.check(fx('fm01-no-frontmatter'), CTX)).toHaveLength(0)
})

test('minimal-pass: zero findings', () => {
  expect(FM02.check(fx('minimal-pass'), CTX)).toHaveLength(0)
})
