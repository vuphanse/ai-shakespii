import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { runRules } from '../../src/lib/engine'
import { parseSkill } from '../../src/lib/parser'
import { loadProfile } from '../../src/lib/profile/load'

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
