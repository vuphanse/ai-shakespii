import { expect, test } from 'bun:test'
import { jsonCorpusReport } from '../../src/cli/format/corpus-json'
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
        { ruleId: 'CT04', severity: 'warn', file: 'SKILL.md', line: 2, message: 'm2' },
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

test('corpus report shape, runError entries, and count-once summary identity', () => {
  const rep = jsonCorpusReport(result, 'default')
  expect(rep.version).toBe(1)
  expect(rep.mode).toBe('corpus')
  expect(rep.profile).toBe('default')
  expect(rep.root).toBe('/r')
  expect(rep.skills[0]).toEqual({
    skill: { dir: '/r/a', name: 'a' },
    summary: { errors: 1, warnings: 1 },
    findings: [
      { ruleId: 'FM05', severity: 'error', file: 'SKILL.md', line: 1, message: 'm1' },
      { ruleId: 'CT04', severity: 'warn', file: 'SKILL.md', line: 2, message: 'm2' },
    ],
  })
  expect(rep.skills[1]).toEqual({ skill: { dir: '/r/b', name: null }, runError: 'boom' })
  expect(rep.corpusFindings).toEqual(result.corpusFindings)
  expect(rep.skipped).toEqual([{ dir: '/r/notes', reason: 'no SKILL.md' }])
  // one XS01 warn counted once — not per site, not per involved skill
  expect(rep.summary).toEqual({ skills: 2, skipped: 1, errors: 1, warnings: 2 })
})
