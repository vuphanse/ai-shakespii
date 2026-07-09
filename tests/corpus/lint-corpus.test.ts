import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { lintCorpus } from '../../src/lib/corpus'
import { loadProfile } from '../../src/lib/profile/load'

const FIXTURES = join(import.meta.dir, '../fixtures/corpus')
const profile = loadProfile(join(import.meta.dir, '../../profiles/default.yaml'))

test('clean pair: two named reports, zero corpus findings; each skill warns TR02 (no triggers.json)', () => {
  const r = lintCorpus(join(FIXTURES, 'clean-pair'), profile)
  expect(r.skills.map(s => s.name)).toEqual(['corpus-clean-a', 'corpus-clean-b'])
  expect(r.skills.every(s => s.findings.length === 1 && s.findings[0].ruleId === 'TR02' && s.runError === null)).toBe(true)
  expect(r.corpusFindings).toEqual([])
  expect(r.skipped).toEqual([])
})

test('broken skill: runError captured, neighbors still lint, exit decision left to the CLI', () => {
  const r = lintCorpus(join(FIXTURES, 'with-broken'), profile)
  expect(r.skills).toHaveLength(2)
  const broken = r.skills.find(s => s.dir.endsWith('broken'))!
  const good = r.skills.find(s => s.dir.endsWith('corpus-good'))!
  expect(typeof broken.runError).toBe('string')
  expect((broken.runError as string).length).toBeGreaterThan(0)
  expect(broken.findings).toEqual([])
  expect(broken.name).toBeNull()
  expect(good.runError).toBeNull()
  expect(good.findings).toEqual([
    {
      ruleId: 'TR02',
      severity: 'warn',
      file: 'SKILL.md',
      line: null,
      message: 'no evals/triggers.json — add a trigger-accuracy query set (16+ labeled queries incl. negatives)',
    },
  ])
})

test('broken skill is excluded from the XS pass input', () => {
  const r = lintCorpus(join(FIXTURES, 'with-broken'), profile)
  expect(r.corpusFindings).toEqual([])
})

test('skipped directories pass through from discovery', () => {
  const r = lintCorpus(join(FIXTURES, 'with-skipped'), profile)
  expect(r.skipped).toEqual([{ dir: join(FIXTURES, 'with-skipped/notes'), reason: 'no SKILL.md' }])
})
