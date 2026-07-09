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

const isNonEmptyStringDiag = (v: unknown, path: string, out: SchemaDiagnostic[]): void => {
  if (!isNonEmptyString(v)) out.push({ path, message: 'must be a non-empty string' })
}

const GRADING_ROOT_KEYS = ['expectations', 'summary', 'execution_metrics', 'timing', 'claims', 'user_notes_summary', 'eval_feedback']
const GRADING_EXPECTATION_KEYS = ['text', 'passed', 'evidence']
const GRADING_SUMMARY_KEYS = ['passed', 'failed', 'total', 'pass_rate']

export function validateGradingJson(doc: unknown): SchemaDiagnostic[] {
  if (!isRecord(doc)) return [{ path: '$', message: 'root must be an object' }]
  const out: SchemaDiagnostic[] = []
  for (const key of Object.keys(doc)) {
    if (!GRADING_ROOT_KEYS.includes(key)) out.push({ path: key, message: `unknown key "${key}"` })
  }
  if (!Array.isArray(doc.expectations) || doc.expectations.length === 0) {
    out.push({ path: 'expectations', message: 'must be a non-empty array' })
  } else {
    doc.expectations.forEach((e: unknown, i: number) => {
      const at = `expectations[${i}]`
      if (!isRecord(e)) {
        out.push({ path: at, message: 'must be an object' })
        return
      }
      isNonEmptyStringDiag(e.text, `${at}.text`, out)
      if (typeof e.passed !== 'boolean') out.push({ path: `${at}.passed`, message: 'must be a boolean' })
      isNonEmptyStringDiag(e.evidence, `${at}.evidence`, out)
      for (const key of Object.keys(e)) {
        if (!GRADING_EXPECTATION_KEYS.includes(key)) out.push({ path: `${at}.${key}`, message: `unknown key "${key}"` })
      }
    })
  }
  if (!isRecord(doc.summary)) {
    out.push({ path: 'summary', message: 'must be an object' })
  } else {
    for (const k of ['passed', 'failed', 'total']) {
      if (!Number.isInteger(doc.summary[k])) out.push({ path: `summary.${k}`, message: 'must be an integer' })
    }
    const pr = doc.summary.pass_rate
    if (typeof pr !== 'number' || Number.isNaN(pr) || pr < 0 || pr > 1) {
      out.push({ path: 'summary.pass_rate', message: 'must be a number between 0 and 1' })
    }
    for (const key of Object.keys(doc.summary)) {
      if (!GRADING_SUMMARY_KEYS.includes(key)) out.push({ path: `summary.${key}`, message: `unknown key "${key}"` })
    }
  }
  for (const key of ['execution_metrics', 'timing', 'user_notes_summary', 'eval_feedback']) {
    if (doc[key] !== undefined && !isRecord(doc[key])) out.push({ path: key, message: 'must be an object' })
  }
  if (doc.claims !== undefined && !Array.isArray(doc.claims)) out.push({ path: 'claims', message: 'must be an array' })
  return out
}

const BENCHMARK_ROOT_KEYS = ['metadata', 'runs', 'run_summary', 'notes']
const BENCHMARK_RUN_KEYS = ['eval_id', 'eval_name', 'configuration', 'run_number', 'result', 'expectations', 'notes']
const BENCHMARK_RESULT_KEYS = ['pass_rate', 'passed', 'failed', 'total', 'time_seconds', 'tokens', 'tool_calls', 'errors']
const BENCHMARK_SUMMARY_KEYS = ['with_skill', 'without_skill', 'delta']
const BENCHMARK_SUMMARY_STAT_KEYS = ['pass_rate', 'time_seconds', 'tokens']
const BENCHMARK_STAT_FIELD_KEYS = ['mean', 'stddev', 'min', 'max']

export function validateBenchmarkJson(doc: unknown): SchemaDiagnostic[] {
  if (!isRecord(doc)) return [{ path: '$', message: 'root must be an object' }]
  const out: SchemaDiagnostic[] = []
  for (const key of Object.keys(doc)) {
    if (!BENCHMARK_ROOT_KEYS.includes(key)) out.push({ path: key, message: `unknown key "${key}"` })
  }
  if (!isRecord(doc.metadata)) out.push({ path: 'metadata', message: 'must be an object' })
  if (!Array.isArray(doc.runs) || doc.runs.length === 0) {
    out.push({ path: 'runs', message: 'must be a non-empty array' })
  } else {
    doc.runs.forEach((r: unknown, i: number) => {
      const at = `runs[${i}]`
      if (!isRecord(r)) {
        out.push({ path: at, message: 'must be an object' })
        return
      }
      if (!Number.isInteger(r.eval_id)) out.push({ path: `${at}.eval_id`, message: 'must be an integer' })
      if (r.eval_name !== undefined) isNonEmptyStringDiag(r.eval_name, `${at}.eval_name`, out)
      if (r.configuration !== 'with_skill' && r.configuration !== 'without_skill') {
        out.push({ path: `${at}.configuration`, message: 'must be "with_skill" or "without_skill"' })
      }
      if (!Number.isInteger(r.run_number)) out.push({ path: `${at}.run_number`, message: 'must be an integer' })
      if (!isRecord(r.result)) {
        out.push({ path: `${at}.result`, message: 'must be an object' })
      } else {
        const pr = r.result.pass_rate
        if (typeof pr !== 'number' || Number.isNaN(pr) || pr < 0 || pr > 1) {
          out.push({ path: `${at}.result.pass_rate`, message: 'must be a number between 0 and 1' })
        }
        for (const k of ['passed', 'failed', 'total']) {
          if (!Number.isInteger(r.result[k])) out.push({ path: `${at}.result.${k}`, message: 'must be an integer' })
        }
        for (const k of ['time_seconds', 'tokens']) {
          const v = r.result[k]
          if (typeof v !== 'number' || Number.isNaN(v)) out.push({ path: `${at}.result.${k}`, message: 'must be a number' })
        }
        if (!Number.isInteger(r.result.errors)) out.push({ path: `${at}.result.errors`, message: 'must be an integer' })
        if (r.result.tool_calls !== undefined && !Number.isInteger(r.result.tool_calls)) {
          out.push({ path: `${at}.result.tool_calls`, message: 'must be an integer' })
        }
        for (const key of Object.keys(r.result)) {
          if (!BENCHMARK_RESULT_KEYS.includes(key)) out.push({ path: `${at}.result.${key}`, message: `unknown key "${key}"` })
        }
      }
      if (r.expectations !== undefined && !Array.isArray(r.expectations)) {
        out.push({ path: `${at}.expectations`, message: 'must be an array' })
      }
      if (r.notes !== undefined && !Array.isArray(r.notes)) out.push({ path: `${at}.notes`, message: 'must be an array' })
      for (const key of Object.keys(r)) {
        if (!BENCHMARK_RUN_KEYS.includes(key)) out.push({ path: `${at}.${key}`, message: `unknown key "${key}"` })
      }
    })
  }
  if (!isRecord(doc.run_summary)) {
    out.push({ path: 'run_summary', message: 'must be an object' })
  } else {
    for (const cfgName of ['with_skill', 'without_skill']) {
      const cfg = doc.run_summary[cfgName]
      if (!isRecord(cfg)) {
        out.push({ path: `run_summary.${cfgName}`, message: 'must be an object' })
        continue
      }
      for (const stat of BENCHMARK_SUMMARY_STAT_KEYS) {
        const v = cfg[stat]
        if (!isRecord(v)) {
          out.push({ path: `run_summary.${cfgName}.${stat}`, message: 'must be an object with mean and stddev' })
          continue
        }
        for (const field of ['mean', 'stddev']) {
          const n = v[field]
          if (typeof n !== 'number' || Number.isNaN(n)) {
            out.push({ path: `run_summary.${cfgName}.${stat}.${field}`, message: 'must be a number' })
          }
        }
        for (const field of ['min', 'max']) {
          const n = v[field]
          if (n !== undefined && (typeof n !== 'number' || Number.isNaN(n))) {
            out.push({ path: `run_summary.${cfgName}.${stat}.${field}`, message: 'must be a number' })
          }
        }
        for (const key of Object.keys(v)) {
          if (!BENCHMARK_STAT_FIELD_KEYS.includes(key)) {
            out.push({ path: `run_summary.${cfgName}.${stat}.${key}`, message: `unknown key "${key}"` })
          }
        }
      }
      for (const key of Object.keys(cfg)) {
        if (!BENCHMARK_SUMMARY_STAT_KEYS.includes(key)) {
          out.push({ path: `run_summary.${cfgName}.${key}`, message: `unknown key "${key}"` })
        }
      }
    }
    const delta = doc.run_summary.delta
    if (!isRecord(delta)) {
      out.push({ path: 'run_summary.delta', message: 'must be an object' })
    } else {
      for (const key of BENCHMARK_SUMMARY_STAT_KEYS) {
        if (!isNonEmptyString(delta[key])) out.push({ path: `run_summary.delta.${key}`, message: 'must be a non-empty string' })
      }
      for (const key of Object.keys(delta)) {
        if (!BENCHMARK_SUMMARY_STAT_KEYS.includes(key)) out.push({ path: `run_summary.delta.${key}`, message: `unknown key "${key}"` })
      }
    }
    for (const key of Object.keys(doc.run_summary)) {
      if (!BENCHMARK_SUMMARY_KEYS.includes(key)) out.push({ path: `run_summary.${key}`, message: `unknown key "${key}"` })
    }
  }
  if (doc.notes !== undefined) {
    if (!Array.isArray(doc.notes)) {
      out.push({ path: 'notes', message: 'must be an array' })
    } else {
      doc.notes.forEach((n: unknown, i: number) => {
        if (!isNonEmptyString(n)) out.push({ path: `notes[${i}]`, message: 'must be a non-empty string' })
      })
    }
  }
  return out
}

const TRIGGERS_ROOT_KEYS = ['skill_name', 'queries']
const TRIGGER_QUERY_KEYS = ['query', 'should_trigger']

export function validateTriggersJson(doc: unknown): SchemaDiagnostic[] {
  if (!isRecord(doc)) return [{ path: '$', message: 'root must be an object' }]
  const out: SchemaDiagnostic[] = []
  if (!isNonEmptyString(doc.skill_name)) out.push({ path: 'skill_name', message: 'must be a non-empty string' })
  for (const key of Object.keys(doc)) {
    if (!TRIGGERS_ROOT_KEYS.includes(key)) out.push({ path: key, message: `unknown key "${key}"` })
  }
  if (!Array.isArray(doc.queries) || doc.queries.length === 0) {
    out.push({ path: 'queries', message: 'must be a non-empty array' })
    return out
  }
  doc.queries.forEach((q: unknown, i: number) => {
    const at = `queries[${i}]`
    if (!isRecord(q)) {
      out.push({ path: at, message: 'must be an object' })
      return
    }
    if (!isNonEmptyString(q.query)) out.push({ path: `${at}.query`, message: 'must be a non-empty string' })
    if (typeof q.should_trigger !== 'boolean') out.push({ path: `${at}.should_trigger`, message: 'must be a boolean' })
    for (const key of Object.keys(q)) {
      if (!TRIGGER_QUERY_KEYS.includes(key)) out.push({ path: `${at}.${key}`, message: `unknown key "${key}"` })
    }
  })
  return out
}
