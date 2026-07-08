import { expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseSkill } from '../../src/lib/parser'

const FIXTURE = join(import.meta.dir, '../fixtures/minimal-pass')

test('parseSkill composes frontmatter, sections, and inventory', () => {
  const skill = parseSkill(FIXTURE)
  expect(skill.dirName).toBe('minimal-pass')
  expect(skill.frontmatter.parsed).toEqual({
    name: 'minimal-pass',
    description: 'Use when verifying the shakespii seed rules against a known-clean fixture skill.',
    version: '0.1.0',
  })
  expect(skill.body.h1).toBe('minimal-pass')
  expect(skill.body.sections.map(s => s.normalized)).toEqual([
    'intent', 'inputs', 'preconditions', 'procedure', 'output', 'examples', 'anti-patterns',
  ])
  expect(skill.body.lineOffset).toBe(6)
  expect(skill.files.map(f => f.relPath)).toEqual(['README.md', 'evals/evals.json'])
})

test('CRLF input is normalized to LF for SKILL.md and sibling text', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-crlf-'))
  writeFileSync(
    join(dir, 'SKILL.md'),
    '---\r\nname: crlf-skill\r\ndescription: "Use when testing CRLF."\r\n---\r\n# crlf-skill\r\n\r\n## Examples\r\n\r\n```\r\nfenced\r\n```\r\n',
  )
  mkdirSync(join(dir, 'references'))
  writeFileSync(join(dir, 'references/note.md'), 'line one\r\nline two\r\n')
  const skill = parseSkill(dir)
  expect(skill.raw).not.toContain('\r')
  expect(skill.body.raw).not.toContain('\r')
  expect(skill.body.sections.map(s => s.normalized)).toEqual(['examples'])
  const note = skill.files.find(f => f.relPath === 'references/note.md')
  expect(note?.text).toBe('line one\nline two\n')
})
