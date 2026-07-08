export interface SchemaDiagnostic {
  path: string
  message: string
}

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0

const EVALS_ROOT_KEYS = ['skill_name', 'evals']
const CASE_KEYS = ['id', 'prompt', 'expected_output', 'files', 'expectations']

export function validateEvalsJson(doc: unknown): SchemaDiagnostic[] {
  if (!isRecord(doc)) return [{ path: '$', message: 'root must be an object' }]
  const out: SchemaDiagnostic[] = []
  if (!isNonEmptyString(doc.skill_name)) out.push({ path: 'skill_name', message: 'must be a non-empty string' })
  for (const key of Object.keys(doc)) {
    if (!EVALS_ROOT_KEYS.includes(key)) out.push({ path: key, message: `unknown key "${key}"` })
  }
  if (!Array.isArray(doc.evals) || doc.evals.length === 0) {
    out.push({ path: 'evals', message: 'must be a non-empty array' })
    return out
  }
  const firstUse = new Map<number, number>()
  doc.evals.forEach((c: unknown, i: number) => {
    const at = `evals[${i}]`
    if (!isRecord(c)) {
      out.push({ path: at, message: 'must be an object' })
      return
    }
    if (!Number.isInteger(c.id)) {
      out.push({ path: `${at}.id`, message: 'must be an integer' })
    } else if (firstUse.has(c.id as number)) {
      out.push({ path: `${at}.id`, message: `duplicate id ${c.id} (first used by evals[${firstUse.get(c.id as number)}])` })
    } else {
      firstUse.set(c.id as number, i)
    }
    if (!isNonEmptyString(c.prompt)) out.push({ path: `${at}.prompt`, message: 'must be a non-empty string' })
    if (!isNonEmptyString(c.expected_output)) out.push({ path: `${at}.expected_output`, message: 'must be a non-empty string' })
    if (c.files !== undefined) {
      if (!Array.isArray(c.files)) {
        out.push({ path: `${at}.files`, message: 'must be an array of non-empty strings' })
      } else {
        c.files.forEach((f: unknown, j: number) => {
          if (!isNonEmptyString(f)) out.push({ path: `${at}.files[${j}]`, message: 'must be a non-empty string' })
        })
      }
    }
    if (!Array.isArray(c.expectations) || c.expectations.length === 0) {
      out.push({ path: `${at}.expectations`, message: 'must be a non-empty array' })
    } else {
      c.expectations.forEach((e: unknown, j: number) => {
        if (!isNonEmptyString(e)) out.push({ path: `${at}.expectations[${j}]`, message: 'must be a non-empty string' })
      })
    }
    for (const key of Object.keys(c)) {
      if (!CASE_KEYS.includes(key)) out.push({ path: `${at}.${key}`, message: `unknown key "${key}"` })
    }
  })
  return out
}
