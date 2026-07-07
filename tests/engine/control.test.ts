import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { runRules } from '../../src/lib/engine'
import { parseSkill } from '../../src/lib/parser'
import { loadProfile } from '../../src/lib/profile/load'

test('full engine + real profile on minimal-pass: zero findings', () => {
  const profile = loadProfile(join(import.meta.dir, '../../profiles/default.yaml'))
  const skill = parseSkill(join(import.meta.dir, '../fixtures/minimal-pass'))
  expect(runRules(skill, profile)).toEqual([])
})
