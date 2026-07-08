import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import type { Profile, RuleSetting, RuleSeverity, Severity } from '../types'

export function loadProfile(path: string): Profile {
  const doc: unknown = parse(readFileSync(path, 'utf8'))
  validateProfile(doc)
  return doc
}

function validateProfile(doc: unknown): asserts doc is Profile {
  if (typeof doc !== 'object' || doc === null) throw new Error('invalid profile: not a mapping')
  const p = doc as Record<string, unknown>
  if (typeof p.profile !== 'string') throw new Error('invalid profile: missing "profile" name')
  if (typeof p.anatomy !== 'object' || p.anatomy === null || Object.keys(p.anatomy).length === 0) {
    throw new Error('invalid profile: missing anatomy table')
  }
  for (const [key, entry] of Object.entries(p.anatomy as Record<string, unknown>)) {
    const e = entry as Record<string, unknown>
    if (typeof e?.canonical !== 'string' || !Array.isArray(e?.aliases) || (e?.level !== 'error' && e?.level !== 'warn')) {
      throw new Error(`invalid profile: anatomy entry "${key}" malformed`)
    }
  }
  if (typeof p.rules !== 'object' || p.rules === null || Object.keys(p.rules).length === 0) {
    throw new Error('invalid profile: missing rules map')
  }
}

export function resolveRule(setting: RuleSetting): {
  severity: RuleSeverity
  options: Record<string, unknown>
} {
  if (typeof setting === 'string') return { severity: setting, options: {} }
  return { severity: setting.severity, options: setting.options ?? {} }
}

function deepMerge(a: unknown, b: unknown): unknown {
  if (b === undefined) return a
  if (
    Array.isArray(a) || Array.isArray(b) ||
    typeof a !== 'object' || typeof b !== 'object' ||
    a === null || b === null
  ) {
    return b
  }
  const out: Record<string, unknown> = { ...(a as Record<string, unknown>) }
  for (const [k, v] of Object.entries(b as Record<string, unknown>)) {
    out[k] = deepMerge((a as Record<string, unknown>)[k], v)
  }
  return out
}

export function mergeProfile(base: Profile, override: unknown): Profile {
  const merged = deepMerge(base, override)
  validateProfile(merged)
  return merged
}
