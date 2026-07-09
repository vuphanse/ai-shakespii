import { expect, test } from 'bun:test'
import { validateTriggersJson } from '../../src/lib/evals/validate'

const valid = {
  skill_name: 'using-shakespii',
  queries: [
    { query: 'Lint the skill I just wrote and fix the findings', should_trigger: true },
    { query: 'Run eslint on my TypeScript project', should_trigger: false },
  ],
}

test('valid document produces no diagnostics', () => {
  expect(validateTriggersJson(valid)).toEqual([])
})

test('non-object root', () => {
  expect(validateTriggersJson([])).toEqual([{ path: '$', message: 'root must be an object' }])
  expect(validateTriggersJson('nope')).toEqual([{ path: '$', message: 'root must be an object' }])
})

test('missing and empty skill_name', () => {
  expect(validateTriggersJson({ queries: valid.queries })).toEqual([
    { path: 'skill_name', message: 'must be a non-empty string' },
  ])
  expect(validateTriggersJson({ skill_name: '', queries: valid.queries })).toEqual([
    { path: 'skill_name', message: 'must be a non-empty string' },
  ])
})

test('unknown root key', () => {
  expect(validateTriggersJson({ ...valid, extra: 1 })).toEqual([{ path: 'extra', message: 'unknown key "extra"' }])
})

test('queries must be a non-empty array', () => {
  expect(validateTriggersJson({ skill_name: 'x', queries: [] })).toEqual([
    { path: 'queries', message: 'must be a non-empty array' },
  ])
  expect(validateTriggersJson({ skill_name: 'x' })).toEqual([
    { path: 'queries', message: 'must be a non-empty array' },
  ])
})

test('per-entry diagnostics in pinned order: query, should_trigger, unknown keys', () => {
  const doc = {
    skill_name: 'x',
    queries: [{ query: '', should_trigger: 'yes', note: 'hm' }, 'not-an-object'],
  }
  expect(validateTriggersJson(doc)).toEqual([
    { path: 'queries[0].query', message: 'must be a non-empty string' },
    { path: 'queries[0].should_trigger', message: 'must be a boolean' },
    { path: 'queries[0].note', message: 'unknown key "note"' },
    { path: 'queries[1]', message: 'must be an object' },
  ])
})

test('root diagnostics precede entry diagnostics (document order)', () => {
  const doc = { queries: [{ query: 'q', should_trigger: 1 }] }
  expect(validateTriggersJson(doc)).toEqual([
    { path: 'skill_name', message: 'must be a non-empty string' },
    { path: 'queries[0].should_trigger', message: 'must be a boolean' },
  ])
})
