import { expect, test } from 'bun:test'
import { splitFrontmatter } from '../../src/lib/parser/frontmatter'

test('no opening fence: raw null, whole file is body at offset 1', () => {
  const r = splitFrontmatter('# title\nbody')
  expect(r.fm.raw).toBeNull()
  expect(r.fm.parsed).toBeNull()
  expect(r.fm.error).toBeNull()
  expect(r.body).toBe('# title\nbody')
  expect(r.bodyLineOffset).toBe(1)
})

test('valid frontmatter: parsed fields, body offset after closing fence', () => {
  const r = splitFrontmatter('---\nname: a\ndescription: b\n---\n# t\n')
  expect(r.fm.raw).toBe('name: a\ndescription: b')
  expect(r.fm.parsed).toEqual({ name: 'a', description: 'b' })
  expect(r.fm.error).toBeNull()
  expect(r.body).toBe('# t\n')
  expect(r.bodyLineOffset).toBe(5)
})

test('unterminated fence: raw null with error at line 1', () => {
  const r = splitFrontmatter('---\nname: a\n# no closing')
  expect(r.fm.raw).toBeNull()
  expect(r.fm.error).toEqual({ message: 'unterminated frontmatter fence', line: 1 })
})

test('bad YAML: raw preserved, parsed null, error line is absolute', () => {
  const r = splitFrontmatter('---\nname: [unclosed\n---\nbody')
  expect(r.fm.raw).toBe('name: [unclosed')
  expect(r.fm.parsed).toBeNull()
  expect(r.fm.error?.line).toBeGreaterThanOrEqual(2)
  expect(r.body).toBe('body')
})

test('non-mapping YAML: parsed null with mapping error', () => {
  const r = splitFrontmatter('---\n- just\n- a list\n---\nbody')
  expect(r.fm.parsed).toBeNull()
  expect(r.fm.error?.message).toContain('mapping')
})

test('empty frontmatter parses to empty object', () => {
  const r = splitFrontmatter('---\n---\nbody')
  expect(r.fm.parsed).toEqual({})
})
