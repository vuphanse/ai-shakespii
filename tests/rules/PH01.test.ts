import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { parseSkill } from '../../src/lib/parser'
import { PH01 } from '../../src/lib/rules/PH01'

const CTX = { options: { token: 'TODO(shakespii):' }, anatomy: {} }
const fx = (name: string) => parseSkill(join(import.meta.dir, '../fixtures', name))

test('one finding per occurrence across SKILL.md and siblings, with file+line', () => {
  const f = PH01.check(fx('ph01-one-token'), CTX)
  expect(f).toHaveLength(2)
  expect(f.map(x => ({ file: x.file, line: x.line }))).toEqual([
    { file: 'SKILL.md', line: 9 },
    { file: 'README.md', line: 1 },
  ])
})

test('two tokens on one line produce two findings', () => {
  const skill = fx('minimal-pass')
  const doctored = { ...skill, raw: 'TODO(shakespii): a TODO(shakespii): b', files: [] }
  expect(PH01.check(doctored, CTX)).toHaveLength(2)
})

test('minimal-pass: zero findings', () => {
  expect(PH01.check(fx('minimal-pass'), CTX)).toHaveLength(0)
})
