import { expect, test } from 'bun:test'
import { XS02 } from '../../../src/lib/rules/corpus/XS02'
import { cleanSkillRaw, corpusFromRaws, ctxFor } from '../../helpers/skill'

const CTX = ctxFor('XS02') // { similarity: 0.8 }

test('two skills with identical bodies form one cluster of two', () => {
  const raw = cleanSkillRaw()
  const skills = corpusFromRaws([raw, raw], ['clone-a', 'clone-b'])
  const f = XS02.check(skills, CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toBe('near-clone cluster of 2 skills (pairwise similarity ≥ 0.8) — consider parameterizing into one skill')
  expect(f[0].sites.map(s => s.skill)).toEqual(['clone-a', 'clone-b'])
})

test('three identical bodies form ONE cluster of three, not three pair findings', () => {
  const raw = cleanSkillRaw()
  const skills = corpusFromRaws([raw, raw, raw], ['clone-a', 'clone-b', 'clone-c'])
  const f = XS02.check(skills, CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toBe('near-clone cluster of 3 skills (pairwise similarity ≥ 0.8) — consider parameterizing into one skill')
  expect(f[0].sites.map(s => s.skill)).toEqual(['clone-a', 'clone-b', 'clone-c'])
})

test('dissimilar bodies stay silent', () => {
  const a = cleanSkillRaw({
    intent: 'Alpha intent prose.',
    inputs: 'Alpha inputs prose.',
    preconditions: 'Alpha preconditions prose.',
    procedure: 'Alpha procedure line one.\nAlpha procedure line two.\nAlpha procedure line three.',
    output: 'Alpha output prose.',
    examples: 'Given the input `a`, the expected output is `alpha`.',
    'anti-patterns': 'Alpha anti-pattern prose.',
  })
  const b = cleanSkillRaw({
    intent: 'Beta intent prose.',
    inputs: 'Beta inputs prose.',
    preconditions: 'Beta preconditions prose.',
    procedure: 'Beta procedure line one.\nBeta procedure line two.\nBeta procedure line three.',
    output: 'Beta output prose.',
    examples: 'Given the input `b`, the expected output is `beta`.',
    'anti-patterns': 'Beta anti-pattern prose.',
  })
  expect(XS02.check(corpusFromRaws([a, b], ['diff-a', 'diff-b']), CTX)).toHaveLength(0)
})

test('two separate clone groups produce two findings', () => {
  const raw1 = cleanSkillRaw({ procedure: 'Group one procedure prose, deliberately unlike group two.' })
  const raw2 = cleanSkillRaw({
    intent: 'Group two intent prose.',
    inputs: 'Group two inputs prose.',
    preconditions: 'Group two preconditions prose.',
    procedure: 'Group two procedure line one.\nGroup two procedure line two.',
    output: 'Group two output prose.',
    examples: 'Given the input `two`, the expected output is `group-two`.',
    'anti-patterns': 'Group two anti-pattern prose.',
  })
  const skills = corpusFromRaws([raw1, raw1, raw2, raw2], ['g1-a', 'g1-b', 'g2-a', 'g2-b'])
  const f = XS02.check(skills, CTX)
  expect(f).toHaveLength(2)
  expect(f[0].sites.map(s => s.skill)).toEqual(['g1-a', 'g1-b'])
  expect(f[1].sites.map(s => s.skill)).toEqual(['g2-a', 'g2-b'])
})

test('within-skill duplicate lines collapse (set semantics)', () => {
  const line = 'Repeated line of prose for the set-semantics check.'
  const a = cleanSkillRaw({ procedure: [line, line, line, line].join('\n') })
  const b = cleanSkillRaw({ procedure: line })
  const f = XS02.check(corpusFromRaws([a, b], ['set-a', 'set-b']), CTX)
  expect(f).toHaveLength(1)
})

test('sites span the full body range', () => {
  const raw = cleanSkillRaw()
  const skills = corpusFromRaws([raw, raw], ['clone-a', 'clone-b'])
  const f = XS02.check(skills, CTX)
  const body = skills[0].body
  const firstNonBlank = body.raw.split('\n').findIndex(l => l.trim() !== '') + body.lineOffset
  expect(f[0].sites[0].startLine).toBe(firstNonBlank)
  expect(f[0].sites[0].endLine).toBeGreaterThan(firstNonBlank)
})
