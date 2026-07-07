import { expect, test } from 'bun:test'
import { ST03 } from '../../src/lib/rules/ST03'
import { cleanSkillRaw, ctxFor, skillFromRaw } from '../helpers/skill'
import type { FileEntry } from '../../src/lib/types'

const CTX = ctxFor('ST03')
const md = (relPath: string, text: string): FileEntry => ({ relPath, size: text.length, text })
const longBody = (head: string) => `${head}\n${Array.from({ length: 120 }, (_, i) => `line ${i}`).join('\n')}`

test('101+ line md sibling with no TOC: one finding on that file', () => {
  const skill = skillFromRaw(cleanSkillRaw(), [md('references/big.md', longBody('# big'))])
  const f = ST03.check(skill, CTX)
  expect(f).toHaveLength(1)
  expect(f[0].file).toBe('references/big.md')
  expect(f[0].message).toBe('references/big.md is 121 lines with no table of contents')
})

test('Contents heading in the first 40 lines satisfies the TOC', () => {
  const skill = skillFromRaw(cleanSkillRaw(), [md('references/big.md', longBody('# big\n\n## Contents'))])
  expect(ST03.check(skill, CTX)).toHaveLength(0)
})

test('three anchor links in the first 40 lines satisfy the TOC', () => {
  const head = '# big\n- [a](#a)\n- [b](#b)\n- [c](#c)'
  const skill = skillFromRaw(cleanSkillRaw(), [md('references/big.md', longBody(head))])
  expect(ST03.check(skill, CTX)).toHaveLength(0)
})

test('short sibling and non-md sibling are ignored', () => {
  const skill = skillFromRaw(cleanSkillRaw(), [
    md('references/short.md', '# short\nfine'),
    { relPath: 'scripts/gen.py', size: 10, text: longBody('# not md') },
  ])
  expect(ST03.check(skill, CTX)).toHaveLength(0)
})
