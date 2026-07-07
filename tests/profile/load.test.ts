import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { loadProfile, mergeProfile, resolveRule } from '../../src/lib/profile/load'

const PROFILE_PATH = join(import.meta.dir, '../../profiles/default.yaml')
const LINT_RULES_PATH = join(import.meta.dir, '../../docs/LINT-RULES.md')

test('loads the real default profile: 7 anatomy sections, 28 rules', () => {
  const p = loadProfile(PROFILE_PATH)
  expect(p.profile).toBe('default')
  expect(Object.keys(p.anatomy)).toEqual([
    'intent', 'inputs', 'preconditions', 'procedure', 'output', 'examples', 'anti-patterns',
  ])
  expect(Object.keys(p.rules).length).toBe(28)
})

test('rule-ID parity with LINT-RULES.md (replaces the M1 ephemeral check)', () => {
  const p = loadProfile(PROFILE_PATH)
  const md = readFileSync(LINT_RULES_PATH, 'utf8')
  const catalogIds = [...md.matchAll(/^\| ((?:FM|CT|ST|HY|XS|TR|PH)\d{2}) \|/gm)].map(m => m[1])
  expect(new Set(catalogIds)).toEqual(new Set(Object.keys(p.rules)))
})

test('CT03 token mirrors PH01 token', () => {
  const p = loadProfile(PROFILE_PATH)
  const ct03 = resolveRule(p.rules['CT03'])
  const ph01 = resolveRule(p.rules['PH01'])
  expect(ct03.options.token).toBe('TODO(shakespii):')
  expect(ct03.options.token).toBe(ph01.options.token)
})

test('resolveRule normalizes both setting forms', () => {
  expect(resolveRule('error')).toEqual({ severity: 'error', options: {} })
  expect(resolveRule({ severity: 'warn', options: { n: 1 } })).toEqual({ severity: 'warn', options: { n: 1 } })
  expect(resolveRule({ severity: 'warn' })).toEqual({ severity: 'warn', options: {} })
})

test('mergeProfile deep-merges and replaces arrays wholesale', () => {
  const base = loadProfile(PROFILE_PATH)
  const merged = mergeProfile(base, {
    anatomy: { intent: { aliases: ['Mission'] } },
    rules: { FM03: { severity: 'error' } },
  })
  expect(merged.anatomy['intent'].aliases).toEqual(['Mission'])
  expect(merged.anatomy['intent'].canonical).toBe('Intent')
  expect(resolveRule(merged.rules['FM03']).severity).toBe('error')
  expect(resolveRule(base.rules['FM03']).severity).toBe('warn')
})

test('loadProfile throws on malformed shape', () => {
  expect(() => loadProfile(join(import.meta.dir, 'no-such.yaml'))).toThrow()
})

test('anatomy levels mirror the CT-rule severities (spec §8)', () => {
  const p = loadProfile(PROFILE_PATH)
  const pairs: Array<[string, string]> = [
    ['intent', 'CT06'], ['inputs', 'CT04'], ['preconditions', 'CT01'],
    ['procedure', 'CT07'], ['output', 'CT02'], ['examples', 'CT03'], ['anti-patterns', 'CT05'],
  ]
  for (const [key, ruleId] of pairs) {
    expect(resolveRule(p.rules[ruleId]).severity).toBe(p.anatomy[key].level)
  }
})
