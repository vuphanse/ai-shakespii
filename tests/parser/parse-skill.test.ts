import { expect, test } from 'bun:test'
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
  expect(skill.files.map(f => f.relPath)).toEqual(['README.md'])
})
