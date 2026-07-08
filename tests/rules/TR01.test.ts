import { expect, test } from 'bun:test'
import type { FileEntry } from '../../src/lib/types'
import { TR01 } from '../../src/lib/rules/TR01'
import { cleanSkillRaw, ctxFor, skillFromRaw } from '../helpers/skill'

const entry = (doc: unknown): FileEntry => {
  const text = typeof doc === 'string' ? doc : JSON.stringify(doc)
  return { relPath: 'evals/evals.json', size: text.length, text }
}

const validDoc = (cases: number) => ({
  skill_name: 'test-skill',
  evals: Array.from({ length: cases }, (_, i) => ({
    id: i + 1,
    prompt: `Case ${i + 1}.`,
    expected_output: 'Out.',
    expectations: ['ok'],
  })),
})

test('shape 1: no evals/evals.json — single warn-destined finding on SKILL.md', () => {
  const findings = TR01.check(skillFromRaw(cleanSkillRaw()), ctxFor('TR01'))
  expect(findings).toEqual([
    { message: 'skill ships no evals/evals.json — no reproducible eval', file: 'SKILL.md', line: null },
  ])
})

test('shape 2: invalid JSON — single finding with pluralized error count', () => {
  const findings = TR01.check(skillFromRaw(cleanSkillRaw(), [entry('{nope')]), ctxFor('TR01'))
  expect(findings).toEqual([
    { message: 'evals/evals.json fails validation (1 error) — run shakespii test for details', file: 'evals/evals.json', line: null },
  ])
})

test('shape 2: schema and cross-document errors are counted together', () => {
  const doc = { skill_name: 'someone-else', evals: [{ id: 1, prompt: '', expected_output: 'o', expectations: ['e'] }, { id: 2, prompt: 'p', expected_output: 'o', expectations: ['e'] }, { id: 3, prompt: 'p', expected_output: 'o', expectations: ['e'] }] }
  const findings = TR01.check(skillFromRaw(cleanSkillRaw(), [entry(doc)]), ctxFor('TR01'))
  expect(findings).toEqual([
    { message: 'evals/evals.json fails validation (2 errors) — run shakespii test for details', file: 'evals/evals.json', line: null },
  ])
})

test('shape 3: valid but thin — case-count finding', () => {
  const findings = TR01.check(skillFromRaw(cleanSkillRaw(), [entry(validDoc(2))]), ctxFor('TR01'))
  expect(findings).toEqual([
    { message: 'only 2 eval case(s) — Anthropic guidance is a minimum of three', file: 'evals/evals.json', line: null },
  ])
})

test('silent on a valid three-case document', () => {
  expect(TR01.check(skillFromRaw(cleanSkillRaw(), [entry(validDoc(3))]), ctxFor('TR01'))).toEqual([])
})

test('minCases option is honored', () => {
  const ctx = { ...ctxFor('TR01'), options: { minCases: 2 } }
  expect(TR01.check(skillFromRaw(cleanSkillRaw(), [entry(validDoc(2))]), ctx)).toEqual([])
})
