import { expect, test } from 'bun:test'
import type { FileEntry } from '../../src/lib/types'
import { TR03 } from '../../src/lib/rules/TR03'
import { cleanSkillRaw, ctxFor, skillFromRaw } from '../helpers/skill'

const entry = (doc: unknown): FileEntry => {
  const text = typeof doc === 'string' ? doc : JSON.stringify(doc)
  return { relPath: 'evals/triggers.json', size: text.length, text }
}

const suite = (specs: Array<{ q: string; t: boolean }>) => ({
  skill_name: 'test-skill',
  queries: specs.map(s => ({ query: s.q, should_trigger: s.t })),
})

const CTX = ctxFor('TR03')

test('silent on a clean suite (prose and $-prefixed queries; interior "/" is fine)', () => {
  const doc = suite([
    { q: 'Run SDD on docs/spec.md please.', t: true },
    { q: '$aiw-sdd docs/spec.md', t: true },
    { q: 'What is the weather like?', t: false },
  ])
  expect(TR03.check(skillFromRaw(cleanSkillRaw(), [entry(doc)]), CTX)).toEqual([])
})

test('one finding enumerating leading-slash indices across positive and negative queries', () => {
  const doc = suite([
    { q: 'Run SDD on docs/spec.md please.', t: true },
    { q: '/aiw-sdd docs/spec.md', t: true },
    { q: 'What is the weather like?', t: false },
    { q: '  /compact the conversation', t: false },
  ])
  expect(TR03.check(skillFromRaw(cleanSkillRaw(), [entry(doc)]), CTX)).toEqual([
    {
      message: 'evals/triggers.json has leading-"/" queries at indices [1, 3] — the Claude Code CLI intercepts slash commands before the model sees them, so their trigger measurements are meaningless (measured, M5d); use $-prefixed or prose phrasings instead',
      file: 'evals/triggers.json',
      line: null,
    },
  ])
})

test('silent when "/" appears only in the frontmatter description (queries-only boundary)', () => {
  const raw = cleanSkillRaw({ description: 'Use when the user types /aiw-sdd or asks to run SDD on a spec.' })
  const doc = suite([
    { q: '$aiw-sdd docs/spec.md', t: true },
    { q: 'Unrelated question.', t: false },
  ])
  expect(TR03.check(skillFromRaw(raw, [entry(doc)]), CTX)).toEqual([])
})

test('silent when triggers.json is missing, unparsable, or schema-invalid (TR02 owns those)', () => {
  expect(TR03.check(skillFromRaw(cleanSkillRaw()), CTX)).toEqual([])
  expect(TR03.check(skillFromRaw(cleanSkillRaw(), [entry('{nope')]), CTX)).toEqual([])
  const invalid = { skill_name: '', queries: [{ query: '/x', should_trigger: 1 }] }
  expect(TR03.check(skillFromRaw(cleanSkillRaw(), [entry(invalid)]), CTX)).toEqual([])
})

test('silent when the file entry text is null (oversized/binary)', () => {
  const nullEntry: FileEntry = { relPath: 'evals/triggers.json', size: 999999, text: null }
  expect(TR03.check(skillFromRaw(cleanSkillRaw(), [nullEntry]), CTX)).toEqual([])
})
