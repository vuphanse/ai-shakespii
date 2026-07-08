import { expect, test } from 'bun:test'
import { validateEvalsJson } from '../../src/lib/evals/validate'

const valid = () => ({
  skill_name: 'demo',
  evals: [
    { id: 1, prompt: 'Do the thing.', expected_output: 'Thing done.', files: [], expectations: ['Thing is done.'] },
    { id: 2, prompt: 'Do it again.', expected_output: 'Done again.', expectations: ['Done twice.'] },
    { id: 3, prompt: 'Edge case.', expected_output: 'Handled.', expectations: ['Edge handled.'] },
  ],
})

test('valid document: zero diagnostics', () => {
  expect(validateEvalsJson(valid())).toEqual([])
})

test('non-object root: single $ diagnostic', () => {
  for (const doc of [null, [], 'x', 7]) {
    expect(validateEvalsJson(doc)).toEqual([{ path: '$', message: 'root must be an object' }])
  }
})

test('missing or empty skill_name', () => {
  const doc = valid() as Record<string, unknown>
  delete doc.skill_name
  expect(validateEvalsJson(doc)).toEqual([{ path: 'skill_name', message: 'must be a non-empty string' }])
  doc.skill_name = ''
  expect(validateEvalsJson(doc)).toEqual([{ path: 'skill_name', message: 'must be a non-empty string' }])
})

test('unknown root key is named', () => {
  const doc = { ...valid(), skill: 'demo' }
  expect(validateEvalsJson(doc)).toEqual([{ path: 'skill', message: 'unknown key "skill"' }])
})

test('evals missing or empty', () => {
  expect(validateEvalsJson({ skill_name: 'demo' })).toEqual([{ path: 'evals', message: 'must be a non-empty array' }])
  expect(validateEvalsJson({ skill_name: 'demo', evals: [] })).toEqual([{ path: 'evals', message: 'must be a non-empty array' }])
})

test('per-case field diagnostics carry indexed paths', () => {
  const doc = valid()
  doc.evals[1] = { id: 'two', prompt: '', expected_output: 7, expectations: [] } as never
  expect(validateEvalsJson(doc)).toEqual([
    { path: 'evals[1].id', message: 'must be an integer' },
    { path: 'evals[1].prompt', message: 'must be a non-empty string' },
    { path: 'evals[1].expected_output', message: 'must be a non-empty string' },
    { path: 'evals[1].expectations', message: 'must be a non-empty array' },
  ])
})

test('non-object case', () => {
  const doc = valid()
  doc.evals[2] = 'nope' as never
  expect(validateEvalsJson(doc)).toEqual([{ path: 'evals[2]', message: 'must be an object' }])
})

test('duplicate ids: diagnostic on each later occurrence, naming the first', () => {
  const doc = valid()
  doc.evals[2].id = 1
  expect(validateEvalsJson(doc)).toEqual([
    { path: 'evals[2].id', message: 'duplicate id 1 (first used by evals[0])' },
  ])
})

test('files entries must be non-empty strings when present', () => {
  const doc = valid()
  doc.evals[0].files = ['ok.md', '', 3] as never
  expect(validateEvalsJson(doc)).toEqual([
    { path: 'evals[0].files[1]', message: 'must be a non-empty string' },
    { path: 'evals[0].files[2]', message: 'must be a non-empty string' },
  ])
})

test('non-array files', () => {
  const doc = valid()
  doc.evals[0].files = 'ok.md' as never
  expect(validateEvalsJson(doc)).toEqual([
    { path: 'evals[0].files', message: 'must be an array of non-empty strings' },
  ])
})

test('non-string expectation entries', () => {
  const doc = valid()
  doc.evals[0].expectations = ['fine', 0] as never
  expect(validateEvalsJson(doc)).toEqual([
    { path: 'evals[0].expectations[1]', message: 'must be a non-empty string' },
  ])
})

test('unknown case key is named with its case index', () => {
  const doc = valid()
  ;(doc.evals[0] as Record<string, unknown>).expectation = ['typo']
  expect(validateEvalsJson(doc)).toEqual([
    { path: 'evals[0].expectation', message: 'unknown key "expectation"' },
  ])
})

test('diagnostics are ordered by document position', () => {
  const doc = { skill_name: '', extra: 1, evals: [{ id: 'x', prompt: 'p', expected_output: 'o', expectations: ['e'] }] }
  expect(validateEvalsJson(doc).map(d => d.path)).toEqual(['skill_name', 'extra', 'evals[0].id'])
})
