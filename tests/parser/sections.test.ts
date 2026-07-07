import { expect, test } from 'bun:test'
import { extractLinks, extractSections, normalizeHeading } from '../../src/lib/parser/sections'

test('normalizeHeading strips emphasis, trailing punctuation, collapses case/space', () => {
  expect(normalizeHeading('**Examples:**')).toBe('examples')
  expect(normalizeHeading('The  Process!')).toBe('the process')
  expect(normalizeHeading('`Output` format')).toBe('output format')
})

const BODY = [
  '# Title',        // 1
  '',               // 2
  '## Intent',      // 3
  '',               // 4
  'why',            // 5
  '',               // 6
  '### Sub Point',  // 7
  'detail',         // 8
  '',               // 9
  '#### deep',      // 10 — h4 creates no section
  'deep text',      // 11
  '',               // 12
  '## Examples',    // 13
  'Given x, output y.', // 14
].join('\n')

test('extractSections: h2/h3 only, flat slicing, absolute lines, h1 captured', () => {
  const { h1, sections } = extractSections(BODY, 5) // body starts at SKILL.md line 5
  expect(h1).toBe('Title')
  expect(sections.map(s => s.normalized)).toEqual(['intent', 'sub point', 'examples'])
  const intent = sections[0]
  expect(intent.depth).toBe(2)
  expect(intent.startLine).toBe(3 + 5 - 1)
  expect(intent.text).toContain('why')
  expect(intent.text).not.toContain('detail')       // ends at next h3
  const sub = sections[1]
  expect(sub.text).toContain('deep text')           // h4 belongs to enclosing section
  const ex = sections[2]
  expect(ex.startLine).toBe(13 + 5 - 1)
  expect(ex.text).toContain('Given x')
})

test('extractLinks returns relative targets with absolute lines', () => {
  const body = 'See [ref](references/guide.md) and [site](https://example.com).\n![img](assets/a.png)'
  const links = extractLinks(body, 10)
  expect(links).toEqual([
    { target: 'references/guide.md', line: 10 },
    { target: 'https://example.com', line: 10 },
    { target: 'assets/a.png', line: 11 },
  ])
})
