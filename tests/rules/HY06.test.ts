import { expect, test } from 'bun:test'
import { HY06 } from '../../src/lib/rules/HY06'
import { ctxFor, skillFromRaw } from '../helpers/skill'

const CTX = ctxFor('HY06')
const body = (claim: string) =>
  `---\nname: test-skill\ndescription: "Use when testing claims."\nversion: 0.1.0\n---\n# t\n\n## Intent\n\n${claim}\n`

test('percent figure near a claim word fires', () => {
  const f = HY06.check(skillFromRaw(body('Saves ~75% of tokens on long threads.')), CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toBe('quantitative claim "75%" near "saves" — back it with a shipped eval or mark it unverified')
})

test('Nx multiplier near a claim word fires', () => {
  expect(HY06.check(skillFromRaw(body('Roughly 3x faster than the naive loop.')), CTX)).toHaveLength(1)
})

test('figures without a claim word in range stay silent', () => {
  expect(HY06.check(skillFromRaw(body('Set the threshold to 80% in the profile.')), CTX)).toHaveLength(0)
})

test('unverified/anecdotal marker on the line exempts it', () => {
  expect(HY06.check(skillFromRaw(body('Saves ~75% of tokens (unverified).')), CTX)).toHaveLength(0)
  expect(HY06.check(skillFromRaw(body('Anecdotal: 2x speedup on my machine.')), CTX)).toHaveLength(0)
})

test('shipped evals/evals.json exempts the whole skill', () => {
  const evals = { relPath: 'evals/evals.json', size: 2, text: '{}' }
  expect(HY06.check(skillFromRaw(body('Saves ~75% of tokens.'), [evals]), CTX)).toHaveLength(0)
})

test('claims inside fences stay silent', () => {
  expect(HY06.check(skillFromRaw(body('```\nSaves 75% faster\n```')), CTX)).toHaveLength(0)
})
