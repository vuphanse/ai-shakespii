import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { parseSkill } from '../../src/lib/parser'
import { FM01 } from '../../src/lib/rules/FM01'

const CTX = { options: {}, anatomy: {} }
const fx = (name: string) => parseSkill(join(import.meta.dir, '../fixtures', name))

test('missing frontmatter: one error finding at line 1', () => {
  const f = FM01.check(fx('fm01-no-frontmatter'), CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toContain('frontmatter missing')
  expect(f[0].line).toBe(1)
  expect(f[0].severity).toBeUndefined()
})

test('bad YAML: one finding citing the captured parse error', () => {
  const f = FM01.check(fx('fm01-bad-yaml'), CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toContain('does not parse')
  expect(f[0].line).toBeGreaterThanOrEqual(2)
})

test('unknown field: exactly one warn-override finding naming the field', () => {
  const f = FM01.check(fx('fm01-unknown-field'), CTX)
  expect(f).toHaveLength(1)
  expect(f[0].severity).toBe('warn')
  expect(f[0].message).toContain('"author"')
  expect(f[0].line).toBe(4)
})

test('minimal-pass: zero findings', () => {
  expect(FM01.check(fx('minimal-pass'), CTX)).toHaveLength(0)
})
