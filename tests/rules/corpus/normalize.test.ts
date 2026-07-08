import { expect, test } from 'bun:test'
import { bodyLines } from '../../../src/lib/rules/corpus/normalize'
import { skillFromRaw } from '../../helpers/skill'

const RAW = [
  '---',
  'name: test-skill',
  'description: "Use when testing normalization."',
  '---',
  '# test-skill',
  '',
  'alpha   ',
  '',
  '',
  'beta',
].join('\n')

test('strips trailing whitespace and drops blank lines, keeping original line numbers', () => {
  const lines = bodyLines(skillFromRaw(RAW))
  expect(lines).toEqual([
    { text: '# test-skill', line: 5 },
    { text: 'alpha', line: 7 },
    { text: 'beta', line: 10 },
  ])
})

test('frontmatter is excluded by construction', () => {
  const lines = bodyLines(skillFromRaw(RAW))
  expect(lines.some(l => l.text.startsWith('name:'))).toBe(false)
})

test('whitespace-only lines count as blank', () => {
  const raw = '---\nname: t\ndescription: "Use when testing."\n---\nx\n   \ny\n'
  const texts = bodyLines(skillFromRaw(raw)).map(l => l.text)
  expect(texts).toEqual(['x', 'y'])
})
