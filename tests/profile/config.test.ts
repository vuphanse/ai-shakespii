import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { applyConfig } from '../../src/lib/profile/config'
import { loadProfile, resolveRule } from '../../src/lib/profile/load'

const base = loadProfile(join(import.meta.dir, '../../profiles/default.yaml'))

test('shorthand severity replaces severity and keeps default options', () => {
  const p = applyConfig(base, { rules: { FM03: 'error' } })
  expect(resolveRule(p.rules.FM03)).toEqual({ severity: 'error', options: { warnChars: 500, maxChars: 1024 } })
})

test('off is a legal severity', () => {
  const p = applyConfig(base, { rules: { PH01: 'off' } })
  expect(resolveRule(p.rules.PH01).severity).toBe('off')
})

test('object form: omitted severity keeps the default; options merge key-wise', () => {
  const p = applyConfig(base, { rules: { FM03: { options: { warnChars: 10 } } } })
  expect(resolveRule(p.rules.FM03)).toEqual({ severity: 'warn', options: { warnChars: 10, maxChars: 1024 } })
})

test('anatomy level is replaced; aliases untouched when not given', () => {
  const p = applyConfig(base, { anatomy: { intent: { level: 'error' } } })
  expect(p.anatomy.intent.level).toBe('error')
  expect(p.anatomy.intent.aliases).toEqual(['Overview', 'Purpose', 'Why'])
})

test('anatomy aliases are replaced wholesale, never merged', () => {
  const p = applyConfig(base, { anatomy: { intent: { aliases: ['Mission'] } } })
  expect(p.anatomy.intent.aliases).toEqual(['Mission'])
  expect(p.anatomy.intent.canonical).toBe('Intent')
})

test('the base profile is never mutated', () => {
  const aliasesBefore = [...base.anatomy.intent.aliases]
  applyConfig(base, { rules: { FM03: 'error' }, anatomy: { intent: { aliases: ['Mission'], level: 'error' } } })
  expect(base.anatomy.intent.aliases).toEqual(aliasesBefore)
  expect(resolveRule(base.rules.FM03).severity).toBe('warn')
})

test('empty rules/anatomy sections are no-ops', () => {
  const p = applyConfig(base, {})
  expect(p.rules).toEqual(base.rules)
  expect(p.anatomy).toEqual(base.anatomy)
})

test('unknown option key throws instead of silently no-oping', () => {
  expect(() => applyConfig(base, { rules: { XS01: { options: { minLine: 99 } } } })).toThrow('unknown option "minLine"')
})

test('a rule with no base options rejects any option key', () => {
  expect(() => applyConfig(base, { rules: { FM01: { options: { anything: 1 } } } })).toThrow('unknown option "anything"')
})

test('fail-loud: every invalid shape names the offending key', () => {
  expect(() => applyConfig(base, null)).toThrow('invalid config: not a mapping')
  expect(() => applyConfig(base, { provenance: {} })).toThrow('unknown top-level key "provenance"')
  expect(() => applyConfig(base, { rules: { HY99: 'off' } })).toThrow('unknown rule "HY99"')
  expect(() => applyConfig(base, { rules: { FM05: 'fatal' } })).toThrow('invalid severity')
  expect(() => applyConfig(base, { rules: { FM05: { level: 'warn' } } })).toThrow('unknown key "level"')
  expect(() => applyConfig(base, { anatomy: { nonexistent: { level: 'warn' } } })).toThrow('unknown anatomy key "nonexistent"')
  expect(() => applyConfig(base, { anatomy: { intent: { canonical: 'Mission' } } })).toThrow('cannot override "canonical"')
  expect(() => applyConfig(base, { anatomy: { intent: { level: 'off' } } })).toThrow('level must be error or warn')
  expect(() => applyConfig(base, { anatomy: { intent: { aliases: 'Mission' } } })).toThrow('aliases must be a list of strings')
})
