import { expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildExecutorPrompt, readValidCachedGrading, stageRunDir } from '../../src/lib/harness/executor'
import { parseSkill } from '../../src/lib/parser'

const COMPRESS = join(import.meta.dir, '../fixtures/harness/compress')

test('buildExecutorPrompt: exact contractual template', () => {
  expect(buildExecutorPrompt('compress', 'Compress the memory file evals/files/sample-memory.md to save tokens.')).toBe(
    'A skill named "compress" is installed at .claude/skills/compress/. Read .claude/skills/compress/SKILL.md first, then complete this task following the skill:\n\nCompress the memory file evals/files/sample-memory.md to save tokens.',
  )
})

test('stageRunDir mounts the skill and stages eval files at their relPaths', () => {
  const skill = parseSkill(COMPRESS)
  const dir = join(mkdtempSync(join(tmpdir(), 'shakespii-stage-')), 'run')
  const evalCase = { id: 1, prompt: 'p', expected_output: 'o', files: ['evals/files/sample-memory.md'], expectations: ['e'] }
  const outputs = stageRunDir(skill, evalCase, 'compress', dir)
  expect(outputs).toBe(join(dir, 'outputs'))
  expect(existsSync(join(outputs, '.claude/skills/compress/SKILL.md'))).toBe(true)
  expect(existsSync(join(outputs, '.claude/skills/compress/evals/evals.json'))).toBe(true)
  expect(existsSync(join(outputs, 'evals/files/sample-memory.md'))).toBe(true)
  expect(readFileSync(join(outputs, 'evals/files/sample-memory.md'), 'utf8')).toBe(
    readFileSync(join(COMPRESS, 'evals/files/sample-memory.md'), 'utf8'),
  )
})

test('stageRunDir wipes a stale run dir', () => {
  const skill = parseSkill(COMPRESS)
  const dir = join(mkdtempSync(join(tmpdir(), 'shakespii-stale-')), 'run')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'leftover.txt'), 'stale')
  stageRunDir(skill, { id: 1, prompt: 'p', expected_output: 'o', expectations: ['e'] }, 'compress', dir)
  expect(existsSync(join(dir, 'leftover.txt'))).toBe(false)
})

const grading = (texts: string[]) => ({
  expectations: texts.map(t => ({ text: t, passed: true, evidence: 'ok' })),
  summary: { passed: texts.length, failed: 0, total: texts.length, pass_rate: 1 },
})

test('readValidCachedGrading: hit on schema-valid, rubric-matching file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-cache-'))
  writeFileSync(join(dir, 'grading.json'), JSON.stringify(grading(['a', 'b'])))
  expect(readValidCachedGrading(dir, ['a', 'b'])).not.toBeNull()
})

test('readValidCachedGrading: miss on absence, bad JSON, and schema-invalid', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-cache-miss-'))
  expect(readValidCachedGrading(dir, ['a'])).toBeNull()
  writeFileSync(join(dir, 'grading.json'), '{not json')
  expect(readValidCachedGrading(dir, ['a'])).toBeNull()
  writeFileSync(join(dir, 'grading.json'), JSON.stringify({ expectations: [], summary: {} }))
  expect(readValidCachedGrading(dir, ['a'])).toBeNull()
})

test('readValidCachedGrading: rubric-mismatch self-heal — schema-valid file with wrong texts is a miss', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-cache-rubric-'))
  writeFileSync(join(dir, 'grading.json'), JSON.stringify(grading(['stale expectation'])))
  expect(readValidCachedGrading(dir, ['current expectation'])).toBeNull()
  writeFileSync(join(dir, 'grading.json'), JSON.stringify(grading(['a', 'b'])))
  expect(readValidCachedGrading(dir, ['b', 'a'])).toBeNull() // order matters
  expect(readValidCachedGrading(dir, ['a'])).toBeNull() // count matters
})
