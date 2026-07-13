import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { runRules } from '../../src/lib/engine'
import { parseSkill } from '../../src/lib/parser'
import { loadProfile } from '../../src/lib/profile/load'
import { cleanSkillRaw, skillFromRaw } from '../helpers/skill'

test('full engine + real profile on minimal-pass: TR02-only (no evals/triggers.json)', () => {
  const profile = loadProfile(join(import.meta.dir, '../../profiles/default.yaml'))
  const skill = parseSkill(join(import.meta.dir, '../fixtures/minimal-pass'))
  expect(runRules(skill, profile)).toEqual([
    {
      ruleId: 'TR02',
      severity: 'warn',
      file: 'SKILL.md',
      line: null,
      message: 'no evals/triggers.json — add a trigger-accuracy query set (16+ labeled queries incl. negatives)',
    },
  ])
})

test('default profile registers TR03: exactly one warn finding for a leading-slash query', () => {
  const profile = loadProfile(join(import.meta.dir, '../../profiles/default.yaml'))
  const doc = {
    skill_name: 'test-skill',
    queries: [
      { query: '/aiw-sdd docs/spec.md', should_trigger: true },
      ...Array.from({ length: 15 }, (_, i) => ({ query: `Prose query ${i + 1}.`, should_trigger: i > 0 })),
    ],
  }
  const text = JSON.stringify(doc)
  const skill = skillFromRaw(cleanSkillRaw(), [{ relPath: 'evals/triggers.json', size: text.length, text }])
  expect(runRules(skill, profile).filter(f => f.ruleId === 'TR03')).toEqual([
    {
      ruleId: 'TR03',
      severity: 'warn',
      file: 'evals/triggers.json',
      line: null,
      message: 'evals/triggers.json has leading-"/" queries at indices [0] — the Claude Code CLI intercepts slash commands before the model sees them, so their trigger measurements are meaningless (measured, M5d); use $-prefixed or prose phrasings instead',
    },
  ])
})
