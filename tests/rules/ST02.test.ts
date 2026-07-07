import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { parseSkill } from '../../src/lib/parser'
import { ST02 } from '../../src/lib/rules/ST02'

const CTX = { options: {}, anatomy: {} }
const fx = (name: string) => parseSkill(join(import.meta.dir, '../fixtures', name))

test('missing target: one finding citing the link line; URLs ignored', () => {
  const f = ST02.check(fx('st02-broken-link'), CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toContain('references/guide.md')
  expect(f[0].line).toBe(7)
})

test('../ escape: one finding', () => {
  const f = ST02.check(fx('st02-parent-escape'), CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toContain('..')
})

test('existing file, directory target, and pure anchor all pass', () => {
  expect(ST02.check(fx('st02-ok'), CTX)).toHaveLength(0)
})

test('minimal-pass: zero findings', () => {
  expect(ST02.check(fx('minimal-pass'), CTX)).toHaveLength(0)
})
