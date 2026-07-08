import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import type { AnatomySection, AnatomyTable, Profile, RuleSetting, RuleSeverity } from '../types'
import { resolveRule } from './load'

const RULE_SEVERITIES = new Set(['error', 'warn', 'off'])
const ANATOMY_LEVELS = new Set(['error', 'warn'])

export function loadConfigOverride(path: string, base: Profile): Profile {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (e) {
    throw new Error(`config unreadable: ${(e as Error).message}`)
  }
  let doc: unknown
  try {
    doc = parse(text)
  } catch (e) {
    throw new Error(`invalid config: malformed YAML — ${(e as Error).message}`)
  }
  return applyConfig(base, doc)
}

/**
 * A config file is a partial profile (spec §4): rules may be re-severitied
 * (error|warn|off) or re-optioned (key-wise merge); anatomy entries may change
 * level or replace their alias list wholesale. Everything else — unknown keys,
 * unknown rules, canonical overrides, bad severities — throws with the
 * offending key named. Never silently ignores a typo.
 */
export function applyConfig(base: Profile, doc: unknown): Profile {
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
    throw new Error('invalid config: not a mapping')
  }
  const c = doc as Record<string, unknown>
  for (const key of Object.keys(c)) {
    if (key !== 'rules' && key !== 'anatomy') {
      throw new Error(`invalid config: unknown top-level key "${key}" (only "rules" and "anatomy" are allowed)`)
    }
  }
  return { ...base, rules: mergeRules(base, c.rules), anatomy: mergeAnatomy(base, c.anatomy) }
}

function assertSeverity(id: string, val: unknown): RuleSeverity {
  if (typeof val !== 'string' || !RULE_SEVERITIES.has(val)) {
    throw new Error(`invalid config: rule "${id}" has invalid severity ${JSON.stringify(val)} (use error, warn, or off)`)
  }
  return val as RuleSeverity
}

function mergeRuleSetting(id: string, baseSetting: RuleSetting, val: unknown): RuleSetting {
  const { severity: baseSeverity, options: baseOptions } = resolveRule(baseSetting)
  if (typeof val === 'string') {
    const severity = assertSeverity(id, val)
    return Object.keys(baseOptions).length === 0 ? severity : { severity, options: baseOptions }
  }
  if (typeof val !== 'object' || val === null || Array.isArray(val)) {
    throw new Error(`invalid config: rule "${id}" must be a severity string or a { severity, options } mapping`)
  }
  const entry = val as Record<string, unknown>
  for (const key of Object.keys(entry)) {
    if (key !== 'severity' && key !== 'options') {
      throw new Error(`invalid config: rule "${id}" has unknown key "${key}"`)
    }
  }
  const severity = entry.severity === undefined ? baseSeverity : assertSeverity(id, entry.severity)
  let options = baseOptions
  if (entry.options !== undefined) {
    if (typeof entry.options !== 'object' || entry.options === null || Array.isArray(entry.options)) {
      throw new Error(`invalid config: rule "${id}" options is not a mapping`)
    }
    const overrideOptions = entry.options as Record<string, unknown>
    for (const key of Object.keys(overrideOptions)) {
      if (!Object.hasOwn(baseOptions, key)) {
        throw new Error(`invalid config: rule "${id}" has unknown option "${key}"`)
      }
    }
    options = { ...baseOptions, ...overrideOptions }
  }
  return Object.keys(options).length === 0 ? severity : { severity, options }
}

function mergeRules(base: Profile, raw: unknown): Record<string, RuleSetting> {
  if (raw === undefined) return base.rules
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('invalid config: "rules" is not a mapping')
  }
  const rules = { ...base.rules }
  for (const [id, val] of Object.entries(raw as Record<string, unknown>)) {
    const baseSetting = base.rules[id]
    if (baseSetting === undefined) throw new Error(`invalid config: unknown rule "${id}"`)
    rules[id] = mergeRuleSetting(id, baseSetting, val)
  }
  return rules
}

function mergeAnatomy(base: Profile, raw: unknown): AnatomyTable {
  if (raw === undefined) return base.anatomy
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('invalid config: "anatomy" is not a mapping')
  }
  const anatomy: AnatomyTable = { ...base.anatomy }
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    const baseEntry = base.anatomy[key]
    if (baseEntry === undefined) throw new Error(`invalid config: unknown anatomy key "${key}"`)
    if (typeof val !== 'object' || val === null || Array.isArray(val)) {
      throw new Error(`invalid config: anatomy "${key}" is not a mapping`)
    }
    const next: AnatomySection = { ...baseEntry, aliases: [...baseEntry.aliases] }
    for (const [field, fv] of Object.entries(val as Record<string, unknown>)) {
      if (field === 'canonical') {
        throw new Error(`invalid config: anatomy "${key}" cannot override "canonical"`)
      } else if (field === 'level') {
        if (typeof fv !== 'string' || !ANATOMY_LEVELS.has(fv)) {
          throw new Error(`invalid config: anatomy "${key}" level must be error or warn`)
        }
        next.level = fv as AnatomySection['level']
      } else if (field === 'aliases') {
        if (!Array.isArray(fv) || fv.some(x => typeof x !== 'string')) {
          throw new Error(`invalid config: anatomy "${key}" aliases must be a list of strings`)
        }
        next.aliases = fv as string[]
      } else {
        throw new Error(`invalid config: anatomy "${key}" has unknown key "${field}"`)
      }
    }
    anatomy[key] = next
  }
  return anatomy
}
