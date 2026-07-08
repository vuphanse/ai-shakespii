import { expect, test } from 'bun:test'
import { formatCorpusPretty } from '../../src/cli/format/corpus-pretty'
import type { CorpusResult } from '../../src/lib/corpus'

const result: CorpusResult = {
  root: '/r',
  skills: [
    {
      dir: '/r/a',
      name: 'a',
      runError: null,
      findings: [
        { ruleId: 'FM05', severity: 'error', file: 'SKILL.md', line: 1, message: 'm1' },
        { ruleId: 'FM06', severity: 'warn', file: 'SKILL.md', line: 2, message: 'm2' },
      ],
    },
    { dir: '/r/b', name: null, findings: [], runError: 'boom' },
  ],
  corpusFindings: [
    {
      ruleId: 'XS01',
      severity: 'warn',
      message: 'dup',
      sites: [
        { skill: 'a', file: 'SKILL.md', startLine: 1, endLine: 20 },
        { skill: 'c', file: 'SKILL.md', startLine: 2, endLine: 21 },
      ],
    },
  ],
  skipped: [{ dir: '/r/notes', reason: 'no SKILL.md' }],
}

test('sections, corpus findings under involved skills, skipped lines, and the closing summary', () => {
  const out = formatCorpusPretty(result)
  expect(out).toContain('dup [with: c]')
  expect(out).toContain('lint failed')
  expect(out).toContain('boom')
  expect(out).toContain('skipped /r/notes — no SKILL.md')
  expect(out).toContain('2 skills linted, 1 skipped · 1 errors, 2 warnings (of which 1 corpus-level)')
})

test('a corpus finding is not rendered under an uninvolved skill', () => {
  const out = formatCorpusPretty(result)
  const sectionB = out.slice(out.indexOf('corpus-b') === -1 ? out.indexOf('/r/b') : 0)
  expect(sectionB).not.toContain('dup [with:')
})
