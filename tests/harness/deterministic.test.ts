import { expect, test } from 'bun:test'
import type { FileEntry } from '../../src/lib/types'
import { runDeterministic } from '../../src/lib/harness/deterministic'
import { testSkill } from '../../src/lib/harness'
import { cleanSkillRaw, skillFromRaw } from '../helpers/skill'

const MISSING_MSG = 'no evals/evals.json — author evals first (see TR01); shakespii test requires a reproducible eval suite'

const evalsEntry = (doc: unknown): FileEntry => {
  const text = JSON.stringify(doc, null, 2)
  return { relPath: 'evals/evals.json', size: text.length, text }
}

const validDoc = (name = 'test-skill') => ({
  skill_name: name,
  evals: [
    { id: 1, prompt: 'One.', expected_output: 'Out.', files: [] as string[], expectations: ['ok'] },
    { id: 2, prompt: 'Two.', expected_output: 'Out.', expectations: ['ok'] },
    { id: 3, prompt: 'Three.', expected_output: 'Out.', expectations: ['ok'] },
  ],
})

test('missing evals/evals.json: single contractual error', () => {
  const skill = skillFromRaw(cleanSkillRaw())
  expect(runDeterministic(skill)).toEqual([
    { severity: 'error', message: MISSING_MSG, file: 'evals/evals.json', line: null },
  ])
})

test('unreadable (binary) evals.json: single error', () => {
  const skill = skillFromRaw(cleanSkillRaw(), [{ relPath: 'evals/evals.json', size: 4, text: null }])
  expect(runDeterministic(skill)).toEqual([
    { severity: 'error', message: 'evals/evals.json is not readable as UTF-8 text', file: 'evals/evals.json', line: null },
  ])
})

test('invalid JSON: single error carrying the parser message', () => {
  const skill = skillFromRaw(cleanSkillRaw(), [{ relPath: 'evals/evals.json', size: 2, text: '{,' }])
  const findings = runDeterministic(skill)
  expect(findings).toHaveLength(1)
  expect(findings[0].severity).toBe('error')
  expect(findings[0].message).toStartWith('evals/evals.json is not valid JSON:')
})

test('valid document with three cases: zero findings', () => {
  const skill = skillFromRaw(cleanSkillRaw(), [evalsEntry(validDoc())])
  expect(runDeterministic(skill)).toEqual([])
})

test('schema diagnostics become error findings with path-prefixed messages', () => {
  const doc = validDoc()
  doc.evals[0].prompt = '' as never
  const skill = skillFromRaw(cleanSkillRaw(), [evalsEntry(doc)])
  expect(runDeterministic(skill)).toEqual([
    { severity: 'error', message: 'evals[0].prompt: must be a non-empty string', file: 'evals/evals.json', line: null },
  ])
})

test('skill_name mismatch: cross-document error', () => {
  const skill = skillFromRaw(cleanSkillRaw(), [evalsEntry(validDoc('other-skill'))])
  expect(runDeterministic(skill)).toEqual([
    { severity: 'error', message: 'skill_name "other-skill" does not match frontmatter name "test-skill"', file: 'evals/evals.json', line: null },
  ])
})

test('skill_name check is skipped when frontmatter has no parseable name', () => {
  const raw = ['---', 'description: "Use when testing."', '---', '# x', '', 'Body.'].join('\n')
  const skill = skillFromRaw(raw, [evalsEntry(validDoc('whatever'))])
  expect(runDeterministic(skill)).toEqual([])
})

test('files entries: escape and not-found are separate errors, in case order', () => {
  const doc = validDoc()
  doc.evals[0].files = ['../outside.md', '/abs.md', 'evals/files/missing.md']
  const skill = skillFromRaw(cleanSkillRaw(), [evalsEntry(doc)])
  expect(runDeterministic(skill)).toEqual([
    { severity: 'error', message: 'evals[0].files[0]: path escapes the skill directory ("../outside.md")', file: 'evals/evals.json', line: null },
    { severity: 'error', message: 'evals[0].files[1]: path escapes the skill directory ("/abs.md")', file: 'evals/evals.json', line: null },
    { severity: 'error', message: 'evals[0].files[2]: file not found ("evals/files/missing.md")', file: 'evals/evals.json', line: null },
  ])
})

test('files entries resolve against the inventory', () => {
  const doc = validDoc()
  doc.evals[0].files = ['evals/files/sample.md']
  const skill = skillFromRaw(cleanSkillRaw(), [
    evalsEntry(doc),
    { relPath: 'evals/files/sample.md', size: 5, text: 'hello' },
  ])
  expect(runDeterministic(skill)).toEqual([])
})

test('fewer than three cases in a structurally valid file: one warning', () => {
  const doc = validDoc()
  doc.evals = doc.evals.slice(0, 2)
  const skill = skillFromRaw(cleanSkillRaw(), [evalsEntry(doc)])
  expect(runDeterministic(skill)).toEqual([
    { severity: 'warn', message: 'only 2 eval case(s) — Anthropic guidance is a minimum of three', file: 'evals/evals.json', line: null },
  ])
})

test('case-count warning is suppressed while structural errors exist', () => {
  const doc = { skill_name: 'test-skill', evals: [{ id: 1, prompt: '', expected_output: 'o', expectations: ['e'] }] }
  const skill = skillFromRaw(cleanSkillRaw(), [evalsEntry(doc)])
  const findings = runDeterministic(skill)
  expect(findings.every(f => f.severity === 'error')).toBe(true)
})

test('testSkill: stage pipeline shape, summary, and status transitions', async () => {
  const pass = await testSkill(skillFromRaw(cleanSkillRaw(), [evalsEntry(validDoc())]))
  expect(pass.stages).toEqual([
    { stage: 'deterministic', status: 'pass', findings: [] },
    { stage: 'scenario', status: 'skipped', note: 'pass --run to execute LLM stages' },
    { stage: 'grading', status: 'skipped', note: 'pass --run to execute LLM stages' },
  ])
  expect(pass.summary).toEqual({ errors: 0, warnings: 0 })
  expect(pass.skill.name).toBe('test-skill')

  const fail = await testSkill(skillFromRaw(cleanSkillRaw()))
  expect(fail.stages[0]).toMatchObject({ stage: 'deterministic', status: 'fail' })
  expect(fail.summary).toEqual({ errors: 1, warnings: 0 })

  const doc = validDoc()
  doc.evals = doc.evals.slice(0, 2)
  const warnOnly = await testSkill(skillFromRaw(cleanSkillRaw(), [evalsEntry(doc)]))
  expect(warnOnly.stages[0]).toMatchObject({ stage: 'deterministic', status: 'pass' })
  expect(warnOnly.summary).toEqual({ errors: 0, warnings: 1 })
})
