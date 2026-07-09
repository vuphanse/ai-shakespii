import { expect, test } from 'bun:test'
import type { FileEntry } from '../../src/lib/types'
import { TR02 } from '../../src/lib/rules/TR02'
import { cleanSkillRaw, ctxFor, skillFromRaw } from '../helpers/skill'

const entry = (doc: unknown): FileEntry => {
  const text = typeof doc === 'string' ? doc : JSON.stringify(doc)
  return { relPath: 'evals/triggers.json', size: text.length, text }
}

const validDoc = (n: number, negatives = 1) => ({
  skill_name: 'test-skill',
  queries: Array.from({ length: n }, (_, i) => ({
    query: `Query ${i + 1}.`,
    should_trigger: i >= negatives,
  })),
})

const CTX = ctxFor('TR02')

test('shape 1: no evals/triggers.json — single finding on SKILL.md', () => {
  expect(TR02.check(skillFromRaw(cleanSkillRaw()), CTX)).toEqual([
    {
      message: 'no evals/triggers.json — add a trigger-accuracy query set (16+ labeled queries incl. negatives)',
      file: 'SKILL.md',
      line: null,
    },
  ])
})

test('shape 2: unparsable JSON counts as 1 error', () => {
  expect(TR02.check(skillFromRaw(cleanSkillRaw(), [entry('{nope')]), CTX)).toEqual([
    { message: 'evals/triggers.json fails validation (1 error)', file: 'evals/triggers.json', line: null },
  ])
})

test('shape 2: validator diagnostics counted with pluralization', () => {
  const doc = { skill_name: '', queries: [{ query: '', should_trigger: true }] }
  expect(TR02.check(skillFromRaw(cleanSkillRaw(), [entry(doc)]), CTX)).toEqual([
    { message: 'evals/triggers.json fails validation (2 errors)', file: 'evals/triggers.json', line: null },
  ])
})

test('shape 3: valid but fewer than minQueries', () => {
  expect(TR02.check(skillFromRaw(cleanSkillRaw(), [entry(validDoc(15))]), CTX)).toEqual([
    { message: 'evals/triggers.json has 15 queries, fewer than 16', file: 'evals/triggers.json', line: null },
  ])
})

test('shape 4: no negative queries', () => {
  expect(TR02.check(skillFromRaw(cleanSkillRaw(), [entry(validDoc(16, 0))]), CTX)).toEqual([
    { message: 'evals/triggers.json has no negative queries (should_trigger: false)', file: 'evals/triggers.json', line: null },
  ])
})

test('silent on a valid 16-query set with negatives', () => {
  expect(TR02.check(skillFromRaw(cleanSkillRaw(), [entry(validDoc(16))]), CTX)).toEqual([])
})

test('single-finding cap: shape order is first match wins', () => {
  // 3 queries, zero negatives: shape 3 fires, shape 4 does not.
  expect(TR02.check(skillFromRaw(cleanSkillRaw(), [entry(validDoc(3, 0))]), CTX)).toHaveLength(1)
})

test('minQueries option is honored', () => {
  const ctx = { ...CTX, options: { minQueries: 10 } }
  expect(TR02.check(skillFromRaw(cleanSkillRaw(), [entry(validDoc(10))]), ctx)).toEqual([])
})
