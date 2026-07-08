# M4a Harness-Static Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the static half of the M4 test harness: `shakespii test <path> [--json]` with a live deterministic stage, skill-creator-schema validators, the TR01 lint rule, a run-dir/cache skeleton, and the repaired compress fixture — zero LLM tokens spent.

**Architecture:** Validator-core mirroring the lint architecture (spec §0 adjudication #5). Hand-rolled pure validators over `unknown` in `src/lib/evals/`; a stage-pipeline harness in `src/lib/harness/` whose `deterministic` stage is live and whose `scenario`/`grading` stages report `unavailable` until M4b; TR01 as an ordinary registry rule delegating detail to `shakespii test`.

**Tech Stack:** Bun + TypeScript, zero new dependencies. Spec: `docs/specs/2026-07-08-m4a-harness-static-design.md` (amended per the plan-time discoveries below).

## Global Constraints

Every task's requirements implicitly include this section. Copied from the spec / project invariants:

1. **Zero LLM calls.** No task invokes `claude`, any API, or any model. Calibration runs are shakespii CLI invocations only.
2. **Frozen lint surface.** `shakespii lint <path> [--json] [--corpus] [--config <file>]` usage, lint JSON v1, and lint exit semantics are untouched. The new surface is exactly `shakespii test <path> [--json]`, exit 0 (no error findings) / 1 (≥1 error finding) / 2 (run error: bad usage, unknown option, unreadable target). Nothing else exits 2.
3. **Corpus read-only.** Never create, modify, or delete anything under `~/.claude/skills/` or any plugin cache. Live-corpus commands during calibration are read-only invocations.
4. **`profiles/default.yaml` is not edited.** It already contains `TR01: { severity: warn, options: { minCases: 3 } }` (line 75). TR01's implementation consumes `options.minCases`.
5. **Keystones.** Scaffold keystone stays exactly `{ errors: 20, warnings: 0 }` with PH01=18 (SKILL.md 8, evals/evals.json 9, README.md 1), FM04=1, CT03=1 (`tests/cli/keystone.test.ts`). Weld stays `{ errors: 0, warnings: 0 }` (`tests/skill/using-shakespii.test.ts`). Corpus keystone locked values stay byte-identical (`tests/cli/corpus-keystone.test.ts`). New test-command keystones per Task 9.
6. **Never weaken an assertion to absorb a new finding.** A fixture whose test focus is not TR01 gains a minimal valid `evals/evals.json` instead (spec §6).
7. **TDD.** Write the failing test, run it and watch it fail, implement minimally, watch it pass. Full suite via **unpiped** `bun test` (exit code preserved — never pipe through `head`/`tail`/`grep`).
8. **Contractual output shapes.** test-JSON v1 top-level key order `version, mode, skill, stages, summary`; finding key order `severity, message, file, line`; stage order `deterministic, scenario, grading`; pretty summary line `deterministic: ${E} error(s'-pluralized), ${W} warning(s'-pluralized) · scenario/grading pending M4b`.
9. **Docs are dual-location.** Canonical `~/.ai-pref-nsync/local-docs/ai-shakespii/` (specs/, plans/, knowledge-references/), repo mirror in `docs/` — every touched doc synced and `cmp`-verified.
10. **Commit per task** with conventional messages. Normal prose in code, comments, commits, and committed docs.
11. **PH01 scaffold token.** The template's placeholder token is exactly `TODO(shakespii):` — the template migration in Task 5 must preserve all nine occurrences in `templates/skill/evals/evals.json`.

## Plan-time spec amendments (discovered while reading the code)

The spec was approved on three assumptions the codebase contradicts. Resolutions below follow the repo's non-negotiable #1 (standard format only — never invent a parallel format) and the locked decision `745a9a` (skill-creator schemas byte-compatible). These amendments are **already applied to the spec** — its §12 documents all three with rationale — so this plan implements the amended spec verbatim; no task edits the spec.

1. **The scaffold template already ships `evals/evals.json`** (`templates/skill/evals/evals.json`) — the spec's §4/§6 assumed it didn't. Worse, its shape is deviant: a `skill` key instead of `skill_name`, string ids (`{{name}}-case-1`) instead of integers. Resolution: **migrate the template to the skill-creator shape** (Task 5). Consequences: the scaffold keystone stays `{ errors: 20, warnings: 0 }` (a migrated template validates structurally — TR01 stays silent on fresh scaffolds), and the spec's "free init→test RED loop" claim is dropped (a fresh scaffold passes the deterministic stage; placeholder enforcement remains lint/PH01's job).
2. **`skills/using-shakespii/evals/evals.json` already exists** in the same deviant shape, and the weld test (`tests/skill/using-shakespii.test.ts`) pins `evals.skill` + string ids. Resolution: **migrate the file to the skill-creator shape, add a corpus-audit case, and update the weld test** (Task 5).
3. **`profiles/default.yaml` already declares TR01** with `options.minCases: 3`. Resolution: no profile edit anywhere; TR01 reads `minCases` from options.

## Model allocation guidance (for the controller)

Tasks 1, 2, 3, 4, 7 are transcription-complete (full code in this plan): cheapest tier. Tasks 5, 6, 8, 9, 10, 11, 12 touch many files or need judgment: mid tier. Task reviewers: strong tier scaled to diff risk; final whole-branch review: most capable model.

---

### Task 1: evals types + `validateEvalsJson`

**Files:**
- Create: `src/lib/evals/types.ts`
- Create: `src/lib/evals/validate.ts`
- Test: `tests/evals/validate-evals.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces: `EvalCase`, `EvalsJson`, `SchemaDiagnostic { path: string; message: string }`, `validateEvalsJson(doc: unknown): SchemaDiagnostic[]`, and the exported guard `isRecord(v: unknown): v is Record<string, unknown>` — Tasks 2, 3, 6 import these exact names.

- [ ] **Step 1: Write the failing test**

Create `tests/evals/validate-evals.test.ts`:

```ts
import { expect, test } from 'bun:test'
import { validateEvalsJson } from '../../src/lib/evals/validate'

const valid = () => ({
  skill_name: 'demo',
  evals: [
    { id: 1, prompt: 'Do the thing.', expected_output: 'Thing done.', files: [], expectations: ['Thing is done.'] },
    { id: 2, prompt: 'Do it again.', expected_output: 'Done again.', expectations: ['Done twice.'] },
    { id: 3, prompt: 'Edge case.', expected_output: 'Handled.', expectations: ['Edge handled.'] },
  ],
})

test('valid document: zero diagnostics', () => {
  expect(validateEvalsJson(valid())).toEqual([])
})

test('non-object root: single $ diagnostic', () => {
  for (const doc of [null, [], 'x', 7]) {
    expect(validateEvalsJson(doc)).toEqual([{ path: '$', message: 'root must be an object' }])
  }
})

test('missing or empty skill_name', () => {
  const doc = valid() as Record<string, unknown>
  delete doc.skill_name
  expect(validateEvalsJson(doc)).toEqual([{ path: 'skill_name', message: 'must be a non-empty string' }])
  doc.skill_name = ''
  expect(validateEvalsJson(doc)).toEqual([{ path: 'skill_name', message: 'must be a non-empty string' }])
})

test('unknown root key is named', () => {
  const doc = { ...valid(), skill: 'demo' }
  expect(validateEvalsJson(doc)).toEqual([{ path: 'skill', message: 'unknown key "skill"' }])
})

test('evals missing or empty', () => {
  expect(validateEvalsJson({ skill_name: 'demo' })).toEqual([{ path: 'evals', message: 'must be a non-empty array' }])
  expect(validateEvalsJson({ skill_name: 'demo', evals: [] })).toEqual([{ path: 'evals', message: 'must be a non-empty array' }])
})

test('per-case field diagnostics carry indexed paths', () => {
  const doc = valid()
  doc.evals[1] = { id: 'two', prompt: '', expected_output: 7, expectations: [] } as never
  expect(validateEvalsJson(doc)).toEqual([
    { path: 'evals[1].id', message: 'must be an integer' },
    { path: 'evals[1].prompt', message: 'must be a non-empty string' },
    { path: 'evals[1].expected_output', message: 'must be a non-empty string' },
    { path: 'evals[1].expectations', message: 'must be a non-empty array' },
  ])
})

test('non-object case', () => {
  const doc = valid()
  doc.evals[2] = 'nope' as never
  expect(validateEvalsJson(doc)).toEqual([{ path: 'evals[2]', message: 'must be an object' }])
})

test('duplicate ids: diagnostic on each later occurrence, naming the first', () => {
  const doc = valid()
  doc.evals[2].id = 1
  expect(validateEvalsJson(doc)).toEqual([
    { path: 'evals[2].id', message: 'duplicate id 1 (first used by evals[0])' },
  ])
})

test('files entries must be non-empty strings when present', () => {
  const doc = valid()
  doc.evals[0].files = ['ok.md', '', 3] as never
  expect(validateEvalsJson(doc)).toEqual([
    { path: 'evals[0].files[1]', message: 'must be a non-empty string' },
    { path: 'evals[0].files[2]', message: 'must be a non-empty string' },
  ])
})

test('non-array files', () => {
  const doc = valid()
  doc.evals[0].files = 'ok.md' as never
  expect(validateEvalsJson(doc)).toEqual([
    { path: 'evals[0].files', message: 'must be an array of non-empty strings' },
  ])
})

test('non-string expectation entries', () => {
  const doc = valid()
  doc.evals[0].expectations = ['fine', 0] as never
  expect(validateEvalsJson(doc)).toEqual([
    { path: 'evals[0].expectations[1]', message: 'must be a non-empty string' },
  ])
})

test('unknown case key is named with its case index', () => {
  const doc = valid()
  ;(doc.evals[0] as Record<string, unknown>).expectation = ['typo']
  expect(validateEvalsJson(doc)).toEqual([
    { path: 'evals[0].expectation', message: 'unknown key "expectation"' },
  ])
})

test('diagnostics are ordered by document position', () => {
  const doc = { skill_name: '', extra: 1, evals: [{ id: 'x', prompt: 'p', expected_output: 'o', expectations: ['e'] }] }
  expect(validateEvalsJson(doc).map(d => d.path)).toEqual(['skill_name', 'extra', 'evals[0].id'])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/evals/validate-evals.test.ts`
Expected: FAIL — `Cannot find module '../../src/lib/evals/validate'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/evals/types.ts`:

```ts
/** Byte-compatible with skill-creator references/schemas.md — do not rename fields. */

export interface EvalCase {
  id: number
  prompt: string
  expected_output: string
  files?: string[]
  expectations: string[]
}

export interface EvalsJson {
  skill_name: string
  evals: EvalCase[]
}

export interface GradingExpectation {
  text: string
  passed: boolean
  evidence: string
}

export interface GradingJson {
  expectations: GradingExpectation[]
  summary: { passed: number; failed: number; total: number; pass_rate: number }
  execution_metrics?: Record<string, unknown>
  timing?: Record<string, unknown>
  claims?: unknown[]
  user_notes_summary?: Record<string, unknown>
  eval_feedback?: Record<string, unknown>
}

export interface BenchmarkRun {
  eval_id: number
  eval_name?: string
  configuration: 'with_skill' | 'without_skill'
  run_number: number
  result: {
    pass_rate: number
    passed: number
    failed: number
    total: number
    time_seconds: number
    tokens: number
    tool_calls?: number
    errors: number
  }
  expectations?: unknown[]
  notes?: string[]
}

export interface BenchmarkJson {
  metadata: Record<string, unknown>
  runs: BenchmarkRun[]
  run_summary: {
    with_skill: Record<string, unknown>
    without_skill: Record<string, unknown>
    delta: Record<string, unknown>
  }
  notes?: string[]
}
```

Create `src/lib/evals/validate.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/evals/validate-evals.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Full suite, then commit**

Run: `bun test`
Expected: exit 0, no existing test broken.

```bash
git add src/lib/evals tests/evals
git commit -m "feat(harness): evals schema types and validateEvalsJson"
```

---

### Task 2: `validateGradingJson` + `validateBenchmarkJson`

**Files:**
- Modify: `src/lib/evals/validate.ts` (append two functions)
- Test: `tests/evals/validate-docs.test.ts`

**Interfaces:**
- Consumes: `SchemaDiagnostic`, `isRecord` from Task 1.
- Produces: `validateGradingJson(doc: unknown): SchemaDiagnostic[]`, `validateBenchmarkJson(doc: unknown): SchemaDiagnostic[]` — these are M4b's output contracts; nothing in the M4a CLI path calls them.

- [ ] **Step 1: Write the failing test**

Create `tests/evals/validate-docs.test.ts`:

```ts
import { expect, test } from 'bun:test'
import { validateBenchmarkJson, validateGradingJson } from '../../src/lib/evals/validate'

const grading = () => ({
  expectations: [{ text: 'Output includes X', passed: true, evidence: 'Found in step 3' }],
  summary: { passed: 1, failed: 0, total: 1, pass_rate: 1.0 },
})

test('valid grading document: zero diagnostics', () => {
  expect(validateGradingJson(grading())).toEqual([])
})

test('grading: optional blocks accepted when well-typed', () => {
  const doc = {
    ...grading(),
    execution_metrics: { total_tool_calls: 3 },
    timing: { total_duration_seconds: 5 },
    claims: [],
    user_notes_summary: { uncertainties: [] },
    eval_feedback: { suggestions: [] },
  }
  expect(validateGradingJson(doc)).toEqual([])
})

test('grading: non-object root', () => {
  expect(validateGradingJson([])).toEqual([{ path: '$', message: 'root must be an object' }])
})

test('grading: unknown root key, malformed expectation, bad pass_rate', () => {
  const doc = {
    expectation: [],
    expectations: [{ text: '', passed: 'yes', evidence: 'e' }],
    summary: { passed: 0, failed: 1, total: 1, pass_rate: 1.5 },
  }
  expect(validateGradingJson(doc)).toEqual([
    { path: 'expectation', message: 'unknown key "expectation"' },
    { path: 'expectations[0].text', message: 'must be a non-empty string' },
    { path: 'expectations[0].passed', message: 'must be a boolean' },
    { path: 'summary.pass_rate', message: 'must be a number between 0 and 1' },
  ])
})

test('grading: missing expectations and summary', () => {
  expect(validateGradingJson({})).toEqual([
    { path: 'expectations', message: 'must be a non-empty array' },
    { path: 'summary', message: 'must be an object' },
  ])
})

test('grading: summary counters must be integers', () => {
  const doc = grading()
  doc.summary = { passed: 0.5, failed: 0, total: 1, pass_rate: 0.5 } as never
  expect(validateGradingJson(doc)).toEqual([
    { path: 'summary.passed', message: 'must be an integer' },
  ])
})

test('grading: mistyped optional block', () => {
  const doc = { ...grading(), timing: 'fast' }
  expect(validateGradingJson(doc)).toEqual([{ path: 'timing', message: 'must be an object' }])
})

const benchmark = () => ({
  metadata: { skill_name: 'demo', runs_per_configuration: 3 },
  runs: [
    {
      eval_id: 1,
      eval_name: 'Ocean',
      configuration: 'with_skill',
      run_number: 1,
      result: { pass_rate: 0.85, passed: 6, failed: 1, total: 7, time_seconds: 42.5, tokens: 3800, tool_calls: 18, errors: 0 },
    },
  ],
  run_summary: { with_skill: { pass_rate: { mean: 0.85 } }, without_skill: { pass_rate: { mean: 0.35 } }, delta: { pass_rate: '+0.50' } },
  notes: ['observation'],
})

test('valid benchmark document: zero diagnostics', () => {
  expect(validateBenchmarkJson(benchmark())).toEqual([])
})

test('benchmark: non-object root', () => {
  expect(validateBenchmarkJson('x')).toEqual([{ path: '$', message: 'root must be an object' }])
})

test('benchmark: missing required roots', () => {
  expect(validateBenchmarkJson({})).toEqual([
    { path: 'metadata', message: 'must be an object' },
    { path: 'runs', message: 'must be a non-empty array' },
    { path: 'run_summary', message: 'must be an object' },
  ])
})

test('benchmark: configuration is restricted to the two viewer strings', () => {
  const doc = benchmark()
  doc.runs[0].configuration = 'config_a' as never
  expect(validateBenchmarkJson(doc)).toEqual([
    { path: 'runs[0].configuration', message: 'must be "with_skill" or "without_skill"' },
  ])
})

test('benchmark: per-run diagnostics carry indexed paths', () => {
  const doc = benchmark()
  doc.runs[0] = {
    eval_id: 1.5,
    configuration: 'with_skill',
    run_number: 1,
    result: { pass_rate: 2, passed: 6, failed: 1, total: 7, time_seconds: 42.5, tokens: 3800, errors: 0 },
    extra: true,
  } as never
  expect(validateBenchmarkJson(doc)).toEqual([
    { path: 'runs[0].eval_id', message: 'must be an integer' },
    { path: 'runs[0].result.pass_rate', message: 'must be a number between 0 and 1' },
    { path: 'runs[0].extra', message: 'unknown key "extra"' },
  ])
})

test('benchmark: required result fields are enforced, in fixed order', () => {
  const doc = benchmark()
  doc.runs[0].result = { pass_rate: 0.5 } as never
  expect(validateBenchmarkJson(doc)).toEqual([
    { path: 'runs[0].result.passed', message: 'must be an integer' },
    { path: 'runs[0].result.failed', message: 'must be an integer' },
    { path: 'runs[0].result.total', message: 'must be an integer' },
    { path: 'runs[0].result.time_seconds', message: 'must be a number' },
    { path: 'runs[0].result.tokens', message: 'must be a number' },
    { path: 'runs[0].result.errors', message: 'must be an integer' },
  ])
})

test('benchmark: unknown result key and mistyped tool_calls', () => {
  const doc = benchmark()
  doc.runs[0].result = { pass_rate: 0.5, passed: 1, failed: 0, total: 1, time_seconds: 1, tokens: 10, tool_calls: 'many', errors: 0, bonus: 1 } as never
  expect(validateBenchmarkJson(doc)).toEqual([
    { path: 'runs[0].result.tool_calls', message: 'must be an integer' },
    { path: 'runs[0].result.bonus', message: 'unknown key "bonus"' },
  ])
})

test('benchmark: run_summary must carry both configurations and delta', () => {
  const doc = benchmark()
  doc.run_summary = { with_skill: {} } as never
  expect(validateBenchmarkJson(doc)).toEqual([
    { path: 'run_summary.without_skill', message: 'must be an object' },
    { path: 'run_summary.delta', message: 'must be an object' },
  ])
})

test('benchmark: unknown root key and non-string notes entries', () => {
  const doc = { ...benchmark(), commentary: 'x' }
  doc.notes = ['fine', 4] as never
  expect(validateBenchmarkJson(doc)).toEqual([
    { path: 'commentary', message: 'unknown key "commentary"' },
    { path: 'notes[1]', message: 'must be a non-empty string' },
  ])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/evals/validate-docs.test.ts`
Expected: FAIL — `validateGradingJson` is not exported.

- [ ] **Step 3: Append the implementations to `src/lib/evals/validate.ts`**

```ts
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
    for (const k of ['with_skill', 'without_skill', 'delta']) {
      if (!isRecord(doc.run_summary[k])) out.push({ path: `run_summary.${k}`, message: 'must be an object' })
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/evals/validate-docs.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite, then commit**

Run: `bun test`
Expected: exit 0.

```bash
git add src/lib/evals/validate.ts tests/evals/validate-docs.test.ts
git commit -m "feat(harness): grading.json and benchmark.json output-contract validators"
```

---

### Task 3: harness types, deterministic stage, `testSkill` orchestrator

**Files:**
- Create: `src/lib/harness/types.ts`
- Create: `src/lib/harness/deterministic.ts`
- Create: `src/lib/harness/index.ts`
- Test: `tests/harness/deterministic.test.ts`

**Interfaces:**
- Consumes: `validateEvalsJson`, `isRecord` (Task 1); `ParsedSkill`, `Severity` from `src/lib/types.ts`; `skillFromRaw`, `cleanSkillRaw` from `tests/helpers/skill.ts`.
- Produces: `HarnessFinding { severity: Severity; message: string; file: string; line: number | null }`, `StageReport` (discriminated union), `TestResult { skill: { dir: string; name: string | null }; stages: StageReport[]; summary: { errors: number; warnings: number } }`, `runDeterministic(skill: ParsedSkill): HarnessFinding[]`, `testSkill(skill: ParsedSkill): TestResult` — Tasks 7, 8 import these exact names. The contractual missing-evals message is `no evals/evals.json — author evals first (see TR01); shakespii test requires a reproducible eval suite`.

- [ ] **Step 1: Write the failing test**

Create `tests/harness/deterministic.test.ts`:

```ts
import { expect, test } from 'bun:test'
import type { FileEntry } from '../../src/lib/types'
import { runDeterministic } from '../../src/lib/harness/deterministic'
import { testSkill } from '../../src/lib/harness'
import { cleanSkillRaw, skillFromRaw } from '../helpers/skill'

const MISSING_MSG = 'no evals/evals.json — author evals first (see TR01); shakespii test requires a reproducible eval suite'

const evalsEntry = (doc: unknown): FileEntry => {
  const text = JSON.stringify(doc, null, 2)
  return { relPath: 'evals/evals.json', size: text.length, text }
}

const validDoc = (name = 'test-skill') => ({
  skill_name: name,
  evals: [
    { id: 1, prompt: 'One.', expected_output: 'Out.', files: [] as string[], expectations: ['ok'] },
    { id: 2, prompt: 'Two.', expected_output: 'Out.', expectations: ['ok'] },
    { id: 3, prompt: 'Three.', expected_output: 'Out.', expectations: ['ok'] },
  ],
})

test('missing evals/evals.json: single contractual error', () => {
  const skill = skillFromRaw(cleanSkillRaw())
  expect(runDeterministic(skill)).toEqual([
    { severity: 'error', message: MISSING_MSG, file: 'evals/evals.json', line: null },
  ])
})

test('unreadable (binary) evals.json: single error', () => {
  const skill = skillFromRaw(cleanSkillRaw(), [{ relPath: 'evals/evals.json', size: 4, text: null }])
  expect(runDeterministic(skill)).toEqual([
    { severity: 'error', message: 'evals/evals.json is not readable as UTF-8 text', file: 'evals/evals.json', line: null },
  ])
})

test('invalid JSON: single error carrying the parser message', () => {
  const skill = skillFromRaw(cleanSkillRaw(), [{ relPath: 'evals/evals.json', size: 2, text: '{,' }])
  const findings = runDeterministic(skill)
  expect(findings).toHaveLength(1)
  expect(findings[0].severity).toBe('error')
  expect(findings[0].message).toStartWith('evals/evals.json is not valid JSON:')
})

test('valid document with three cases: zero findings', () => {
  const skill = skillFromRaw(cleanSkillRaw(), [evalsEntry(validDoc())])
  expect(runDeterministic(skill)).toEqual([])
})

test('schema diagnostics become error findings with path-prefixed messages', () => {
  const doc = validDoc()
  doc.evals[0].prompt = '' as never
  const skill = skillFromRaw(cleanSkillRaw(), [evalsEntry(doc)])
  expect(runDeterministic(skill)).toEqual([
    { severity: 'error', message: 'evals[0].prompt: must be a non-empty string', file: 'evals/evals.json', line: null },
  ])
})

test('skill_name mismatch: cross-document error', () => {
  const skill = skillFromRaw(cleanSkillRaw(), [evalsEntry(validDoc('other-skill'))])
  expect(runDeterministic(skill)).toEqual([
    { severity: 'error', message: 'skill_name "other-skill" does not match frontmatter name "test-skill"', file: 'evals/evals.json', line: null },
  ])
})

test('skill_name check is skipped when frontmatter has no parseable name', () => {
  const raw = ['---', 'description: "Use when testing."', '---', '# x', '', 'Body.'].join('\n')
  const skill = skillFromRaw(raw, [evalsEntry(validDoc('whatever'))])
  expect(runDeterministic(skill)).toEqual([])
})

test('files entries: escape and not-found are separate errors, in case order', () => {
  const doc = validDoc()
  doc.evals[0].files = ['../outside.md', '/abs.md', 'evals/files/missing.md']
  const skill = skillFromRaw(cleanSkillRaw(), [evalsEntry(doc)])
  expect(runDeterministic(skill)).toEqual([
    { severity: 'error', message: 'evals[0].files[0]: path escapes the skill directory ("../outside.md")', file: 'evals/evals.json', line: null },
    { severity: 'error', message: 'evals[0].files[1]: path escapes the skill directory ("/abs.md")', file: 'evals/evals.json', line: null },
    { severity: 'error', message: 'evals[0].files[2]: file not found ("evals/files/missing.md")', file: 'evals/evals.json', line: null },
  ])
})

test('files entries resolve against the inventory', () => {
  const doc = validDoc()
  doc.evals[0].files = ['evals/files/sample.md']
  const skill = skillFromRaw(cleanSkillRaw(), [
    evalsEntry(doc),
    { relPath: 'evals/files/sample.md', size: 5, text: 'hello' },
  ])
  expect(runDeterministic(skill)).toEqual([])
})

test('fewer than three cases in a structurally valid file: one warning', () => {
  const doc = validDoc()
  doc.evals = doc.evals.slice(0, 2)
  const skill = skillFromRaw(cleanSkillRaw(), [evalsEntry(doc)])
  expect(runDeterministic(skill)).toEqual([
    { severity: 'warn', message: 'only 2 eval case(s) — Anthropic guidance is a minimum of three', file: 'evals/evals.json', line: null },
  ])
})

test('case-count warning is suppressed while structural errors exist', () => {
  const doc = { skill_name: 'test-skill', evals: [{ id: 1, prompt: '', expected_output: 'o', expectations: ['e'] }] }
  const skill = skillFromRaw(cleanSkillRaw(), [evalsEntry(doc)])
  const findings = runDeterministic(skill)
  expect(findings.every(f => f.severity === 'error')).toBe(true)
})

test('testSkill: stage pipeline shape, summary, and status transitions', () => {
  const pass = testSkill(skillFromRaw(cleanSkillRaw(), [evalsEntry(validDoc())]))
  expect(pass.stages).toEqual([
    { stage: 'deterministic', status: 'pass', findings: [] },
    { stage: 'scenario', status: 'unavailable', note: 'ships in M4b' },
    { stage: 'grading', status: 'unavailable', note: 'ships in M4b' },
  ])
  expect(pass.summary).toEqual({ errors: 0, warnings: 0 })
  expect(pass.skill.name).toBe('test-skill')

  const fail = testSkill(skillFromRaw(cleanSkillRaw()))
  expect(fail.stages[0]).toMatchObject({ stage: 'deterministic', status: 'fail' })
  expect(fail.summary).toEqual({ errors: 1, warnings: 0 })

  const doc = validDoc()
  doc.evals = doc.evals.slice(0, 2)
  const warnOnly = testSkill(skillFromRaw(cleanSkillRaw(), [evalsEntry(doc)]))
  expect(warnOnly.stages[0]).toMatchObject({ stage: 'deterministic', status: 'pass' })
  expect(warnOnly.summary).toEqual({ errors: 0, warnings: 1 })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/harness/deterministic.test.ts`
Expected: FAIL — cannot find `src/lib/harness/deterministic`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/harness/types.ts`:

```ts
import type { Severity } from '../types'

export interface HarnessFinding {
  severity: Severity
  message: string
  file: string
  line: number | null
}

export type StageReport =
  | { stage: 'deterministic'; status: 'pass' | 'fail'; findings: HarnessFinding[] }
  | { stage: 'scenario' | 'grading'; status: 'unavailable'; note: 'ships in M4b' }

export interface TestResult {
  skill: { dir: string; name: string | null }
  stages: StageReport[]
  summary: { errors: number; warnings: number }
}
```

Create `src/lib/harness/deterministic.ts`:

```ts
import { isRecord, validateEvalsJson } from '../evals/validate'
import type { ParsedSkill } from '../types'
import type { HarnessFinding } from './types'

const EVALS = 'evals/evals.json'
const MIN_CASES = 3

const err = (message: string): HarnessFinding => ({ severity: 'error', message, file: EVALS, line: null })

export function runDeterministic(skill: ParsedSkill): HarnessFinding[] {
  const entry = skill.files.find(f => f.relPath === EVALS)
  if (!entry) {
    return [err('no evals/evals.json — author evals first (see TR01); shakespii test requires a reproducible eval suite')]
  }
  if (entry.text === null) return [err('evals/evals.json is not readable as UTF-8 text')]
  let doc: unknown
  try {
    doc = JSON.parse(entry.text)
  } catch (e) {
    return [err(`evals/evals.json is not valid JSON: ${(e as Error).message}`)]
  }
  const diagnostics = validateEvalsJson(doc)
  const out: HarnessFinding[] = diagnostics.map(d => err(`${d.path}: ${d.message}`))
  if (isRecord(doc)) {
    const fmName = skill.frontmatter.parsed?.['name']
    if (typeof doc.skill_name === 'string' && doc.skill_name.length > 0 && typeof fmName === 'string' && doc.skill_name !== fmName) {
      out.push(err(`skill_name "${doc.skill_name}" does not match frontmatter name "${fmName}"`))
    }
    if (Array.isArray(doc.evals)) {
      const inventory = new Set(skill.files.map(f => f.relPath))
      doc.evals.forEach((c: unknown, i: number) => {
        if (!isRecord(c) || !Array.isArray(c.files)) return
        c.files.forEach((f: unknown, j: number) => {
          if (typeof f !== 'string' || f.length === 0) return
          if (f.startsWith('/') || f.split('/').includes('..')) {
            out.push(err(`evals[${i}].files[${j}]: path escapes the skill directory ("${f}")`))
          } else if (!inventory.has(f)) {
            out.push(err(`evals[${i}].files[${j}]: file not found ("${f}")`))
          }
        })
      })
      if (diagnostics.length === 0 && doc.evals.length < MIN_CASES) {
        out.push({
          severity: 'warn',
          message: `only ${doc.evals.length} eval case(s) — Anthropic guidance is a minimum of three`,
          file: EVALS,
          line: null,
        })
      }
    }
  }
  return out
}
```

Create `src/lib/harness/index.ts`:

```ts
import type { ParsedSkill } from '../types'
import { runDeterministic } from './deterministic'
import type { StageReport, TestResult } from './types'

export type { HarnessFinding, StageReport, TestResult } from './types'

export function testSkill(skill: ParsedSkill): TestResult {
  const findings = runDeterministic(skill)
  const errors = findings.filter(f => f.severity === 'error').length
  const warnings = findings.length - errors
  const stages: StageReport[] = [
    { stage: 'deterministic', status: errors > 0 ? 'fail' : 'pass', findings },
    { stage: 'scenario', status: 'unavailable', note: 'ships in M4b' },
    { stage: 'grading', status: 'unavailable', note: 'ships in M4b' },
  ]
  const name = skill.frontmatter.parsed?.['name']
  return {
    skill: { dir: skill.dir, name: typeof name === 'string' ? name : null },
    stages,
    summary: { errors, warnings },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/harness/deterministic.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite, then commit**

Run: `bun test`
Expected: exit 0.

```bash
git add src/lib/harness tests/harness
git commit -m "feat(harness): deterministic stage and testSkill stage pipeline"
```

---

### Task 4: run-dir / cache skeleton

**Files:**
- Create: `src/lib/harness/run-dir.ts`
- Test: `tests/harness/run-dir.test.ts`

**Interfaces:**
- Consumes: `ParsedSkill` from `src/lib/types.ts`; `parseSkill` from `src/lib/parser`.
- Produces: `HARNESS_SCHEMA_VERSION = 1`, `cacheRoot(env?): string`, `skillContentHash(skill: ParsedSkill): string`, `runKey(input: { skillHash: string; evalId: number; model: string }): string` (16 hex chars), `runDir(root, skillName, key): string`, `ensureRunDir(root, skillName, key): string`. M4b consumes all of these; nothing in the M4a CLI path calls them.

- [ ] **Step 1: Write the failing test**

Create `tests/harness/run-dir.test.ts`:

```ts
import { expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseSkill } from '../../src/lib/parser'
import {
  HARNESS_SCHEMA_VERSION,
  cacheRoot,
  ensureRunDir,
  runDir,
  runKey,
  skillContentHash,
} from '../../src/lib/harness/run-dir'

const SKILL_MD = ['---', 'name: hash-me', 'description: "Use when hashing."', '---', '# hash-me', '', 'Body.'].join('\n')

function makeSkill(mutate?: (dir: string) => void): string {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-rundir-'))
  writeFileSync(join(dir, 'SKILL.md'), SKILL_MD)
  mkdirSync(join(dir, 'evals'), { recursive: true })
  writeFileSync(join(dir, 'evals/evals.json'), '{"skill_name":"hash-me","evals":[]}')
  writeFileSync(join(dir, 'blob.bin'), Buffer.from([0, 1, 2, 3]))
  mutate?.(dir)
  return dir
}

test('cacheRoot precedence: SHAKESPII_CACHE_DIR, then XDG_CACHE_HOME, then ~/.cache', () => {
  expect(cacheRoot({ SHAKESPII_CACHE_DIR: '/x', XDG_CACHE_HOME: '/y' })).toBe('/x')
  expect(cacheRoot({ XDG_CACHE_HOME: '/y' })).toBe('/y/shakespii')
  expect(cacheRoot({})).toEndWith('/.cache/shakespii')
})

test('hash is deterministic for identical content', () => {
  const a = skillContentHash(parseSkill(makeSkill()))
  const b = skillContentHash(parseSkill(makeSkill()))
  expect(a).toBe(b)
  expect(a).toMatch(/^[0-9a-f]{64}$/)
})

test('any text change changes the hash', () => {
  const base = skillContentHash(parseSkill(makeSkill()))
  const changed = skillContentHash(parseSkill(makeSkill(d => writeFileSync(join(d, 'evals/evals.json'), '{"skill_name":"hash-me","evals":[1]}'))))
  expect(changed).not.toBe(base)
})

test('SKILL.md change changes the hash', () => {
  const base = skillContentHash(parseSkill(makeSkill()))
  const changed = skillContentHash(parseSkill(makeSkill(d => writeFileSync(join(d, 'SKILL.md'), SKILL_MD + '\nMore.'))))
  expect(changed).not.toBe(base)
})

test('same-size binary mutation changes the hash', () => {
  const base = skillContentHash(parseSkill(makeSkill()))
  const changed = skillContentHash(parseSkill(makeSkill(d => writeFileSync(join(d, 'blob.bin'), Buffer.from([0, 1, 2, 4])))))
  expect(changed).not.toBe(base)
})

test('runKey: 16 hex chars, distinct per eval id, model, and schema version input', () => {
  const key = runKey({ skillHash: 'a'.repeat(64), evalId: 1, model: 'claude-sonnet-5' })
  expect(key).toMatch(/^[0-9a-f]{16}$/)
  expect(runKey({ skillHash: 'a'.repeat(64), evalId: 2, model: 'claude-sonnet-5' })).not.toBe(key)
  expect(runKey({ skillHash: 'a'.repeat(64), evalId: 1, model: 'claude-haiku-4-5' })).not.toBe(key)
  expect(HARNESS_SCHEMA_VERSION).toBe(1)
})

test('runDir layout and ensureRunDir creation', () => {
  const root = mkdtempSync(join(tmpdir(), 'shakespii-cache-'))
  const dir = runDir(root, 'demo', 'deadbeefdeadbeef')
  expect(dir).toBe(join(root, 'runs', 'demo', 'deadbeefdeadbeef'))
  expect(existsSync(dir)).toBe(false)
  expect(ensureRunDir(root, 'demo', 'deadbeefdeadbeef')).toBe(dir)
  expect(existsSync(dir)).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/harness/run-dir.test.ts`
Expected: FAIL — cannot find `src/lib/harness/run-dir`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/harness/run-dir.ts`:

```ts
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ParsedSkill } from '../types'

/** Bumps when the run-dir layout or grading contract changes; invalidates stale caches. */
export const HARNESS_SCHEMA_VERSION = 1

export function cacheRoot(env: Record<string, string | undefined> = process.env): string {
  if (env.SHAKESPII_CACHE_DIR) return env.SHAKESPII_CACHE_DIR
  if (env.XDG_CACHE_HOME) return join(env.XDG_CACHE_HOME, 'shakespii')
  return join(homedir(), '.cache', 'shakespii')
}

/**
 * sha256 over SKILL.md raw bytes plus every inventory file's (relPath, raw bytes),
 * in sorted relPath order. Reads bytes from disk — FileEntry.text is null for
 * binary and oversized files, so hashing it would miss same-size binary mutations.
 */
export function skillContentHash(skill: ParsedSkill): string {
  const h = createHash('sha256')
  h.update(readFileSync(join(skill.dir, 'SKILL.md')))
  const entries = [...skill.files].sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0))
  for (const f of entries) {
    h.update('\0')
    h.update(f.relPath)
    h.update('\0')
    h.update(readFileSync(join(skill.dir, f.relPath)))
  }
  return h.digest('hex')
}

export function runKey(input: { skillHash: string; evalId: number; model: string }): string {
  return createHash('sha256')
    .update(`${HARNESS_SCHEMA_VERSION}\n${input.skillHash}\n${input.evalId}\n${input.model}`)
    .digest('hex')
    .slice(0, 16)
}

export function runDir(root: string, skillName: string, key: string): string {
  return join(root, 'runs', skillName, key)
}

/** A run is cache-hit iff grading.json exists under its runKey (M4b writes it). */
export function ensureRunDir(root: string, skillName: string, key: string): string {
  const dir = runDir(root, skillName, key)
  mkdirSync(dir, { recursive: true })
  return dir
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/harness/run-dir.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite, then commit**

Run: `bun test`
Expected: exit 0.

```bash
git add src/lib/harness/run-dir.ts tests/harness/run-dir.test.ts
git commit -m "feat(harness): run-dir cache skeleton with byte-level content hashing"
```

---
### Task 5: TR01 blast-radius preparation (fixtures, template, weld evals — TR01 not yet live)

This task lands BEFORE the TR01 rule exists so the suite stays green at every commit. It gives every full-registry fixture a minimal valid `evals/evals.json`, migrates the scaffold template and the using-shakespii evals to the skill-creator shape (plan-time amendments #1 and #2), and updates the weld test that pinned the old deviant shape.

**Files:**
- Create: `evals/evals.json` under 13 fixture skill dirs (exact list in Step 1)
- Modify: `templates/skill/evals/evals.json` (full replacement)
- Modify: `skills/using-shakespii/evals/evals.json` (full replacement)
- Modify: `tests/skill/using-shakespii.test.ts` (second test replaced)

**Interfaces:**
- Consumes: nothing from earlier tasks (pure data prep).
- Produces: fixtures whose lint output is unchanged once TR01 goes live in Task 6. Every `evals/evals.json` written here follows the Task 1 schema: `skill_name` equal to the skill's frontmatter `name`, integer ids, ≥3 cases.

- [ ] **Step 1: Add minimal valid evals to the 13 full-registry fixtures**

All 13 directories have `name:` equal to their basename (verified against the fixtures). Run from the repo root:

```bash
for d in \
  tests/fixtures/minimal-pass \
  tests/fixtures/warn-only \
  tests/fixtures/corpus/clean-pair/corpus-clean-a \
  tests/fixtures/corpus/clean-pair/corpus-clean-b \
  tests/fixtures/corpus/clone-pair/corpus-clone-a \
  tests/fixtures/corpus/clone-pair/corpus-clone-b \
  tests/fixtures/corpus/shared-block-trio/corpus-shared-a \
  tests/fixtures/corpus/shared-block-trio/corpus-shared-b \
  tests/fixtures/corpus/shared-block-trio/corpus-shared-c \
  tests/fixtures/corpus/with-broken/corpus-good \
  tests/fixtures/corpus/with-skipped/corpus-solo \
  tests/fixtures/config/mission-skill \
  tests/fixtures/config/no-version-skill \
; do
  name="$(basename "$d")"
  mkdir -p "$d/evals"
  cat > "$d/evals/evals.json" <<EOF
{
  "skill_name": "${name}",
  "evals": [
    {
      "id": 1,
      "prompt": "Exercise ${name} on a representative input.",
      "expected_output": "The documented output contract is met.",
      "files": [],
      "expectations": ["The output matches the skill's Output section."]
    },
    {
      "id": 2,
      "prompt": "Exercise ${name} on a second input shape.",
      "expected_output": "The documented output contract is met.",
      "files": [],
      "expectations": ["The output matches the skill's Output section."]
    },
    {
      "id": 3,
      "prompt": "Present ${name} with an out-of-scope request.",
      "expected_output": "The skill declines or stays out of the way.",
      "files": [],
      "expectations": ["No out-of-scope action is taken."]
    }
  ]
}
EOF
done
```

Do NOT touch `tests/fixtures/corpus/with-broken/broken` (its `SKILL.md` is deliberately a directory), `tests/fixtures/corpus/with-skipped/notes` (deliberately no SKILL.md), or any single-rule fixture (`fm01-*`, `fm02-*`, `fm04-*`, `ct03-*`, `st02-*`, `ph01-one-token`) — those are consumed by rule-scoped unit tests where TR01 never runs, and `fm02-bad-name`'s CLI assertions are tolerant of an extra warning.

- [ ] **Step 2: Verify the loop's output**

Run: `cat tests/fixtures/corpus/clean-pair/corpus-clean-a/evals/evals.json | bun -e 'const d = await new Response(Bun.stdin.stream()).json(); if (d.skill_name !== "corpus-clean-a" || d.evals.length !== 3) throw new Error("bad fixture evals")'`
Expected: silent exit 0. Spot-check one more: same command for `tests/fixtures/config/no-version-skill` with `no-version-skill`.

- [ ] **Step 3: Migrate the scaffold template to the skill-creator shape**

Replace the full contents of `templates/skill/evals/evals.json` with (this preserves all nine `TODO(shakespii):` tokens — the scaffold keystone pins PH01=9 in this file):

```json
{
  "skill_name": "{{name}}",
  "evals": [
    {
      "id": 1,
      "prompt": "TODO(shakespii): realistic user request that should trigger this skill",
      "expected_output": "TODO(shakespii): what good output looks like",
      "files": [],
      "expectations": ["TODO(shakespii): one checkable assertion about the output"]
    },
    {
      "id": 2,
      "prompt": "TODO(shakespii): a second scenario — vary the input shape",
      "expected_output": "TODO(shakespii):",
      "files": [],
      "expectations": ["TODO(shakespii):"]
    },
    {
      "id": 3,
      "prompt": "TODO(shakespii): an edge case or near-miss the skill must handle",
      "expected_output": "TODO(shakespii):",
      "files": [],
      "expectations": ["TODO(shakespii):"]
    }
  ]
}
```

The only changes from the old file: `"skill"` → `"skill_name"`, and the three string ids (`"{{name}}-case-N"`) → integers `1`, `2`, `3`. Everything else is byte-identical.

- [ ] **Step 4: Migrate `skills/using-shakespii/evals/evals.json`**

Replace the full contents with the five-case skill-creator-shaped document. Cases 1–4 keep their existing prompts/expected_output/expectations verbatim (only `skill` → `skill_name` and string ids → integers change); case 5 is new (the corpus-audit loop shipped in v0.2.0 had no eval):

```json
{
  "skill_name": "using-shakespii",
  "evals": [
    {
      "id": 1,
      "prompt": "Lint my skill at ~/.claude/skills/caveman and fix what it finds.",
      "expected_output": "The agent runs shakespii lint with --json, fixes each finding via the remediation reference, re-lints until clean, and reports before/after finding counts.",
      "files": [],
      "expectations": [
        "Invokes `shakespii lint <dir> --json` instead of judging files by eye",
        "Consults references/rule-remediations.md for each ruleId",
        "Re-lints after every fix and loops until exit 0",
        "Reports before/after finding counts and per-rule changes"
      ]
    },
    {
      "id": 2,
      "prompt": "Create a new skill that teaches agents to review Dockerfiles.",
      "expected_output": "The agent confirms name, purpose, and triggers, scaffolds with shakespii init, fills every section and the evals stub, lint-loops to a clean run, and presents the result without installing it.",
      "files": [],
      "expectations": [
        "Confirms kebab-case name, purpose, and trigger situations before scaffolding",
        "Uses `shakespii init` rather than hand-rolling the directory layout",
        "Leaves no scaffold placeholder tokens anywhere in the new skill",
        "Presents the skill with clean lint output and asks approval before any install"
      ]
    },
    {
      "id": 3,
      "prompt": "Fix the ESLint errors in src/.",
      "expected_output": "The skill does not trigger; shakespii lints agent skills, not source code, so the agent handles this as an ordinary code task.",
      "files": [],
      "expectations": [
        "Does not invoke the shakespii CLI",
        "Does not treat src/ as a skill directory"
      ]
    },
    {
      "id": 4,
      "prompt": "Run shakespii lint on ./notes, a directory that has no SKILL.md.",
      "expected_output": "The agent recognizes exit code 2, reports the lint failure message verbatim, and stops without fabricating findings or retrying in a loop.",
      "files": [],
      "expectations": [
        "Recognizes exit code 2 as lint-could-not-run",
        "Reports the stderr message verbatim and stops",
        "Does not fabricate findings or loop on a broken run"
      ]
    },
    {
      "id": 5,
      "prompt": "Audit all my installed skills for duplication and near-clones.",
      "expected_output": "The agent runs shakespii lint --corpus --json on the skills root, reads XS01/XS02 findings with their sites, consults the remediation reference, and presents an extraction or parameterization proposal without modifying any installed skill.",
      "files": [],
      "expectations": [
        "Invokes `shakespii lint <root> --corpus --json` for the cross-skill pass",
        "Reports XS01/XS02 findings with their site lists",
        "Treats the installed corpus as read-only and proposes changes instead of applying them"
      ]
    }
  ]
}
```

- [ ] **Step 5: Update the weld test to pin the new shape**

In `tests/skill/using-shakespii.test.ts`, replace the `REQUIRED_CASE_IDS` constant and the entire second test (`'evals.json carries the skill-creator shape with the four named cases'`) with:

```ts
const REQUIRED_PROMPT_ANCHORS = [
  'Lint my skill',
  'Create a new skill',
  'Fix the ESLint errors',
  'Run shakespii lint on ./notes',
  'Audit all my installed skills',
]

test('evals.json carries the skill-creator shape with the five anchored cases', async () => {
  const raw = await Bun.file(join(SKILL_DIR, 'evals/evals.json')).text()
  const evals = JSON.parse(raw) as {
    skill_name: string
    evals: Array<{ id: number; prompt: string; expected_output: string; expectations: string[] }>
  }
  expect(evals.skill_name).toBe('using-shakespii')
  expect(evals.evals.length).toBeGreaterThanOrEqual(5)
  const ids = evals.evals.map(c => c.id)
  expect(new Set(ids).size).toBe(ids.length)
  for (const c of evals.evals) {
    expect(Number.isInteger(c.id)).toBe(true)
    for (const field of [c.prompt, c.expected_output] as const) {
      expect(typeof field).toBe('string')
      expect(field.length).toBeGreaterThan(0)
    }
    expect(Array.isArray(c.expectations)).toBe(true)
    expect(c.expectations.length).toBeGreaterThan(0)
    for (const e of c.expectations) {
      expect(typeof e).toBe('string')
      expect(e.length).toBeGreaterThan(0)
    }
  }
  for (const anchor of REQUIRED_PROMPT_ANCHORS) {
    expect(evals.evals.some(c => c.prompt.includes(anchor))).toBe(true)
  }
})
```

The first test (weld lints `{ errors: 0, warnings: 0 }` through the real CLI) stays byte-identical.

- [ ] **Step 6: Full suite**

Run: `bun test`
Expected: exit 0 — in particular `tests/cli/keystone.test.ts` (template byte-match still holds because the keystone re-reads the template), `tests/skill/using-shakespii.test.ts`, all corpus/config CLI tests.

- [ ] **Step 7: Commit**

```bash
git add tests/fixtures templates/skill/evals/evals.json skills/using-shakespii/evals/evals.json tests/skill/using-shakespii.test.ts
git commit -m "test(harness): migrate evals to skill-creator schema; give full-registry fixtures minimal evals

Plan-time amendments 1 and 2: the scaffold template and the
using-shakespii evals used a deviant shape (skill key, string ids);
both migrate to skill_name + integer ids per the locked schema
decision. Thirteen full-registry fixtures gain minimal valid evals so
TR01 (next task) leaves their asserted lint output unchanged."
```

---

### Task 6: TR01 lint rule

**Files:**
- Create: `src/lib/rules/TR01.ts`
- Modify: `src/lib/rules/index.ts` (import + registry entry)
- Modify: `tests/cli/keystone.test.ts` (one strengthening assertion)
- Test: `tests/rules/TR01.test.ts`

**Interfaces:**
- Consumes: `runDeterministic` (Task 3), `Rule`/`RuleFinding` from `src/lib/types.ts`, `cleanSkillRaw`/`ctxFor`/`skillFromRaw` from `tests/helpers/skill.ts`. The profile entry `TR01: { severity: warn, options: { minCases: 3 } }` already exists in `profiles/default.yaml` — do not edit that file.
- Produces: `TR01` rule (id `'TR01'`), registered in `src/lib/rules/index.ts`. At most one finding per skill; the three contractual messages are pinned in the tests below.

- [ ] **Step 1: Write the failing test**

Create `tests/rules/TR01.test.ts`:

```ts
import { expect, test } from 'bun:test'
import type { FileEntry } from '../../src/lib/types'
import { TR01 } from '../../src/lib/rules/TR01'
import { cleanSkillRaw, ctxFor, skillFromRaw } from '../helpers/skill'

const entry = (doc: unknown): FileEntry => {
  const text = typeof doc === 'string' ? doc : JSON.stringify(doc)
  return { relPath: 'evals/evals.json', size: text.length, text }
}

const validDoc = (cases: number) => ({
  skill_name: 'test-skill',
  evals: Array.from({ length: cases }, (_, i) => ({
    id: i + 1,
    prompt: `Case ${i + 1}.`,
    expected_output: 'Out.',
    expectations: ['ok'],
  })),
})

test('shape 1: no evals/evals.json — single warn-destined finding on SKILL.md', () => {
  const findings = TR01.check(skillFromRaw(cleanSkillRaw()), ctxFor('TR01'))
  expect(findings).toEqual([
    { message: 'skill ships no evals/evals.json — no reproducible eval', file: 'SKILL.md', line: null },
  ])
})

test('shape 2: invalid JSON — single finding with pluralized error count', () => {
  const findings = TR01.check(skillFromRaw(cleanSkillRaw(), [entry('{nope')]), ctxFor('TR01'))
  expect(findings).toEqual([
    { message: 'evals/evals.json fails validation (1 error) — run shakespii test for details', file: 'evals/evals.json', line: null },
  ])
})

test('shape 2: schema and cross-document errors are counted together', () => {
  const doc = { skill_name: 'someone-else', evals: [{ id: 1, prompt: '', expected_output: 'o', expectations: ['e'] }, { id: 2, prompt: 'p', expected_output: 'o', expectations: ['e'] }, { id: 3, prompt: 'p', expected_output: 'o', expectations: ['e'] }] }
  const findings = TR01.check(skillFromRaw(cleanSkillRaw(), [entry(doc)]), ctxFor('TR01'))
  expect(findings).toEqual([
    { message: 'evals/evals.json fails validation (2 errors) — run shakespii test for details', file: 'evals/evals.json', line: null },
  ])
})

test('shape 3: valid but thin — case-count finding', () => {
  const findings = TR01.check(skillFromRaw(cleanSkillRaw(), [entry(validDoc(2))]), ctxFor('TR01'))
  expect(findings).toEqual([
    { message: 'only 2 eval case(s) — Anthropic guidance is a minimum of three', file: 'evals/evals.json', line: null },
  ])
})

test('silent on a valid three-case document', () => {
  expect(TR01.check(skillFromRaw(cleanSkillRaw(), [entry(validDoc(3))]), ctxFor('TR01'))).toEqual([])
})

test('minCases option is honored', () => {
  const ctx = { ...ctxFor('TR01'), options: { minCases: 2 } }
  expect(TR01.check(skillFromRaw(cleanSkillRaw(), [entry(validDoc(2))]), ctx)).toEqual([])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/rules/TR01.test.ts`
Expected: FAIL — cannot find `src/lib/rules/TR01`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/rules/TR01.ts`:

```ts
import { runDeterministic } from '../harness/deterministic'
import type { Rule } from '../types'

const EVALS = 'evals/evals.json'

/**
 * At most one finding per skill: lint is the cheap always-on surface; the full
 * diagnostic list lives in `shakespii test` (ST02/CT02 dedup precedent).
 */
export const TR01: Rule = {
  id: 'TR01',
  check(skill, ctx) {
    const entry = skill.files.find(f => f.relPath === EVALS)
    if (!entry) {
      return [{ message: 'skill ships no evals/evals.json — no reproducible eval', file: 'SKILL.md', line: null }]
    }
    const errors = runDeterministic(skill).filter(f => f.severity === 'error').length
    if (errors > 0) {
      return [{
        message: `evals/evals.json fails validation (${errors} error${errors === 1 ? '' : 's'}) — run shakespii test for details`,
        file: EVALS,
        line: null,
      }]
    }
    const minCases = typeof ctx.options.minCases === 'number' ? ctx.options.minCases : 3
    const doc = JSON.parse(entry.text as string) as { evals?: unknown[] }
    const n = Array.isArray(doc.evals) ? doc.evals.length : 0
    if (n < minCases) {
      return [{ message: `only ${n} eval case(s) — Anthropic guidance is a minimum of three`, file: EVALS, line: null }]
    }
    return []
  },
}
```

(When `errors === 0` the file is guaranteed non-null text and valid JSON — the deterministic stage would otherwise have reported an error — so the bare `JSON.parse` is safe.)

In `src/lib/rules/index.ts`, add `import { TR01 } from './TR01'` after the HY06 import and register it between `HY06` and `PH01`:

```ts
  HY01, HY02, HY03, HY04, HY05, HY06,
  TR01,
  PH01,
```

- [ ] **Step 4: Strengthen the scaffold keystone**

In `tests/cli/keystone.test.ts`, after the `expect(byRule.get('CT03')).toBe(1)` line, add:

```ts
  expect(byRule.has('TR01')).toBe(false) // migrated template evals validate; TR01 stays silent on fresh scaffolds
```

- [ ] **Step 5: Run tests**

Run: `bun test tests/rules/TR01.test.ts`
Expected: PASS.

Run: `bun test`
Expected: exit 0 — the scaffold keystone still reports `{ errors: 20, warnings: 0 }`, the weld still reports `{ errors: 0, warnings: 0 }`, corpus keystone values unchanged (Task 5 prepared every fixture).

- [ ] **Step 6: Commit**

```bash
git add src/lib/rules/TR01.ts src/lib/rules/index.ts tests/rules/TR01.test.ts tests/cli/keystone.test.ts
git commit -m "feat(lint): TR01 — skill ships a valid evals suite (warn, single-finding cap)"
```

---

### Task 7: test-JSON and test-pretty formatters

**Files:**
- Create: `src/cli/format/test-json.ts`
- Create: `src/cli/format/test-pretty.ts`
- Test: `tests/cli/format-test.test.ts`

**Interfaces:**
- Consumes: `TestResult`, `StageReport` from Task 3.
- Produces: `jsonTestReport(result: TestResult): TestJsonReport` (top-level key order `version, mode, skill, stages, summary`), `formatTestPretty(result: TestResult): string` with the contractual summary line `deterministic: ${E} error|errors, ${W} warning|warnings · scenario/grading pending M4b`. Task 8's CLI calls both.

- [ ] **Step 1: Write the failing test**

Create `tests/cli/format-test.test.ts`:

```ts
import { expect, test } from 'bun:test'
import type { TestResult } from '../../src/lib/harness/types'
import { jsonTestReport } from '../../src/cli/format/test-json'
import { formatTestPretty } from '../../src/cli/format/test-pretty'

type Finding = { severity: 'error' | 'warn'; message: string; file: string; line: number | null }

const result = (errors: number, warnings: number, findings: Finding[]): TestResult => ({
  skill: { dir: '/abs/demo-skill', name: 'demo-skill' },
  stages: [
    { stage: 'deterministic', status: errors > 0 ? 'fail' : 'pass', findings },
    { stage: 'scenario', status: 'unavailable', note: 'ships in M4b' },
    { stage: 'grading', status: 'unavailable', note: 'ships in M4b' },
  ],
  summary: { errors, warnings },
})

test('jsonTestReport: exact top-level shape and key order', () => {
  const rep = jsonTestReport(result(0, 0, []))
  expect(Object.keys(rep)).toEqual(['version', 'mode', 'skill', 'stages', 'summary'])
  expect(rep.version).toBe(1)
  expect(rep.mode).toBe('test')
  expect(rep.skill).toEqual({ dir: '/abs/demo-skill', name: 'demo-skill' })
  expect(rep.stages).toHaveLength(3)
  expect(rep.summary).toEqual({ errors: 0, warnings: 0 })
})

test('jsonTestReport: finding key order is severity, message, file, line', () => {
  const rep = jsonTestReport(result(1, 0, [{ severity: 'error', message: 'boom', file: 'evals/evals.json', line: null }]))
  const stage = rep.stages[0] as { findings: unknown[] }
  expect(Object.keys(stage.findings[0] as Record<string, unknown>)).toEqual(['severity', 'message', 'file', 'line'])
})

test('pretty: passing skill', () => {
  const out = formatTestPretty(result(0, 0, []))
  expect(out).toContain('demo-skill')
  expect(out).toContain('deterministic  PASS')
  expect(out).toContain('scenario       unavailable (ships in M4b)')
  expect(out).toContain('grading        unavailable (ships in M4b)')
  expect(out).toContain('deterministic: 0 errors, 0 warnings · scenario/grading pending M4b')
})

test('pretty: failing skill lists findings and pluralizes correctly', () => {
  const out = formatTestPretty(result(1, 1, [
    { severity: 'error', message: 'evals[2].prompt: must be a non-empty string', file: 'evals/evals.json', line: null },
    { severity: 'warn', message: 'only 2 eval case(s) — Anthropic guidance is a minimum of three', file: 'evals/evals.json', line: null },
  ]))
  expect(out).toContain('deterministic  FAIL')
  expect(out).toContain('error  evals/evals.json  evals[2].prompt: must be a non-empty string')
  expect(out).toContain('warn   evals/evals.json  only 2 eval case(s)')
  expect(out).toContain('deterministic: 1 error, 1 warning · scenario/grading pending M4b')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/cli/format-test.test.ts`
Expected: FAIL — cannot find `src/cli/format/test-json`.

- [ ] **Step 3: Write the implementations**

Create `src/cli/format/test-json.ts`:

```ts
import type { StageReport, TestResult } from '../../lib/harness/types'

export interface TestJsonReport {
  version: 1
  mode: 'test'
  skill: { dir: string; name: string | null }
  stages: StageReport[]
  summary: { errors: number; warnings: number }
}

export function jsonTestReport(result: TestResult): TestJsonReport {
  return {
    version: 1,
    mode: 'test',
    skill: result.skill,
    stages: result.stages.map(s =>
      s.stage === 'deterministic'
        ? { stage: s.stage, status: s.status, findings: s.findings.map(f => ({ severity: f.severity, message: f.message, file: f.file, line: f.line })) }
        : { stage: s.stage, status: s.status, note: s.note },
    ),
    summary: result.summary,
  }
}
```

Create `src/cli/format/test-pretty.ts`:

```ts
import { basename } from 'node:path'
import pc from 'picocolors'
import type { TestResult } from '../../lib/harness/types'

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

export function formatTestPretty(result: TestResult): string {
  const lines: string[] = [pc.underline(basename(result.skill.dir))]
  for (const s of result.stages) {
    if (s.stage === 'deterministic') {
      lines.push(`  deterministic  ${s.status === 'fail' ? pc.red('FAIL') : pc.green('PASS')}`)
      for (const f of s.findings) {
        const sev = f.severity === 'error' ? pc.red('error') : pc.yellow('warn ')
        lines.push(`    ${sev}  ${f.file}  ${f.message}`)
      }
    } else {
      lines.push(`  ${s.stage.padEnd(13)}  ${pc.dim('unavailable (ships in M4b)')}`)
    }
  }
  lines.push('')
  lines.push(pc.bold(`deterministic: ${plural(result.summary.errors, 'error')}, ${plural(result.summary.warnings, 'warning')} · scenario/grading pending M4b`))
  return lines.join('\n')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/cli/format-test.test.ts`
Expected: PASS. (Under `bun test` stdout is not a TTY, so picocolors emits plain text and the `toContain` assertions see uncolored strings — the same convention the existing pretty-formatter tests rely on.)

- [ ] **Step 5: Full suite, then commit**

Run: `bun test`
Expected: exit 0.

```bash
git add src/cli/format/test-json.ts src/cli/format/test-pretty.ts tests/cli/format-test.test.ts
git commit -m "feat(cli): test-JSON v1 and pretty formatters for shakespii test"
```

---

### Task 8: `shakespii test` CLI command + harness fixtures

**Files:**
- Create: `src/cli/test.ts`
- Modify: `src/cli/index.ts` (dispatch case + USAGE)
- Create: `tests/fixtures/harness/no-evals/SKILL.md`
- Create: `tests/fixtures/harness/bad-evals/SKILL.md`, `tests/fixtures/harness/bad-evals/evals/evals.json`
- Create: `tests/fixtures/harness/two-cases/SKILL.md`, `tests/fixtures/harness/two-cases/evals/evals.json`
- Test: `tests/cli/test-command.test.ts`

**Interfaces:**
- Consumes: `testSkill` (Task 3), `jsonTestReport`/`formatTestPretty` (Task 7), `parseSkill` from `src/lib/parser`.
- Produces: `runTest(argv: string[]): number` exported from `src/cli/test.ts`; the `test` dispatch case; the three harness fixtures Tasks 9–10 also reference.

- [ ] **Step 1: Create the fixtures**

`tests/fixtures/harness/no-evals/SKILL.md`:

```markdown
---
name: no-evals
description: "Use when exercising the missing-evals error path of shakespii test."
---
# no-evals

Harness fixture: a skill that ships no evals directory.
```

`tests/fixtures/harness/bad-evals/SKILL.md`:

```markdown
---
name: bad-evals
description: "Use when exercising co-existing evals.json defects in shakespii test."
---
# bad-evals

Harness fixture: a skill whose evals.json carries several co-existing violations.
```

`tests/fixtures/harness/bad-evals/evals/evals.json`:

```json
{
  "skill_name": "someone-else",
  "notes": "extra",
  "evals": [
    {
      "id": 1,
      "prompt": "First case prompt.",
      "expected_output": "Output.",
      "files": ["../escape.md", "evals/files/missing.md"],
      "expectations": ["Has output."]
    },
    {
      "id": 1,
      "prompt": "Duplicate id case.",
      "expected_output": "Output.",
      "expectations": []
    }
  ]
}
```

`tests/fixtures/harness/two-cases/SKILL.md`:

```markdown
---
name: two-cases
description: "Use when exercising the thin-eval warning path of shakespii test."
---
# two-cases

Harness fixture: structurally valid evals with only two cases.
```

`tests/fixtures/harness/two-cases/evals/evals.json`:

```json
{
  "skill_name": "two-cases",
  "evals": [
    {
      "id": 1,
      "prompt": "Exercise two-cases on a representative input.",
      "expected_output": "The documented output contract is met.",
      "files": [],
      "expectations": ["The output matches the skill's Output section."]
    },
    {
      "id": 2,
      "prompt": "Exercise two-cases on a second input shape.",
      "expected_output": "The documented output contract is met.",
      "files": [],
      "expectations": ["The output matches the skill's Output section."]
    }
  ]
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/cli/test-command.test.ts`:

```ts
import { expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CLI = join(import.meta.dir, '../../src/cli/index.ts')
const FIXTURES = join(import.meta.dir, '../fixtures/harness')
const run = (args: string[]) => Bun.spawnSync(['bun', CLI, ...args], { cwd: tmpdir() })

test('missing evals: exit 1, contractual error finding', () => {
  const r = run(['test', join(FIXTURES, 'no-evals'), '--json'])
  expect(r.exitCode).toBe(1)
  const rep = JSON.parse(r.stdout.toString())
  expect(rep.summary).toEqual({ errors: 1, warnings: 0 })
  expect(rep.stages[0].status).toBe('fail')
  expect(rep.stages[0].findings).toEqual([
    {
      severity: 'error',
      message: 'no evals/evals.json — author evals first (see TR01); shakespii test requires a reproducible eval suite',
      file: 'evals/evals.json',
      line: null,
    },
  ])
})

test('bad-evals: exit 1, all six co-existing defects in deterministic order', () => {
  const r = run(['test', join(FIXTURES, 'bad-evals'), '--json'])
  expect(r.exitCode).toBe(1)
  const rep = JSON.parse(r.stdout.toString())
  expect(rep.summary).toEqual({ errors: 6, warnings: 0 })
  expect(rep.stages[0].findings.map((f: { message: string }) => f.message)).toEqual([
    'notes: unknown key "notes"',
    'evals[1].id: duplicate id 1 (first used by evals[0])',
    'evals[1].expectations: must be a non-empty array',
    'skill_name "someone-else" does not match frontmatter name "bad-evals"',
    'evals[0].files[0]: path escapes the skill directory ("../escape.md")',
    'evals[0].files[1]: file not found ("evals/files/missing.md")',
  ])
})

test('two-cases: exit 0 with the thin-eval warning', () => {
  const r = run(['test', join(FIXTURES, 'two-cases'), '--json'])
  expect(r.exitCode).toBe(0)
  const rep = JSON.parse(r.stdout.toString())
  expect(rep.summary).toEqual({ errors: 0, warnings: 1 })
  expect(rep.stages[0].status).toBe('pass')
  expect(rep.stages[0].findings[0].message).toBe('only 2 eval case(s) — Anthropic guidance is a minimum of three')
})

test('pretty output carries the contractual stage and summary lines', () => {
  const r = run(['test', join(FIXTURES, 'two-cases')])
  expect(r.exitCode).toBe(0)
  const out = r.stdout.toString()
  expect(out).toContain('deterministic  PASS')
  expect(out).toContain('scenario       unavailable (ships in M4b)')
  expect(out).toContain('deterministic: 0 errors, 1 warning · scenario/grading pending M4b')
})

test('a file path is rejected: the target must be a directory (spec §2)', () => {
  const r = run(['test', join(FIXTURES, 'two-cases/SKILL.md')])
  expect(r.exitCode).toBe(2)
  expect(r.stderr.toString()).toContain('not a directory')
  expect(r.stdout.toString()).toBe('')
})

test('a nonexistent path is rejected as not a directory', () => {
  const r = run(['test', join(FIXTURES, 'does-not-exist')])
  expect(r.exitCode).toBe(2)
  expect(r.stderr.toString()).toContain('not a directory')
})

test('unknown option: loud failure, exit 2', () => {
  const r = run(['test', join(FIXTURES, 'two-cases'), '--fresh'])
  expect(r.exitCode).toBe(2)
  expect(r.stderr.toString()).toContain('unknown option: --fresh')
  expect(r.stderr.toString()).toContain('usage: shakespii test <path> [--json]')
})

test('missing path / extra positional: usage, exit 2', () => {
  expect(run(['test']).exitCode).toBe(2)
  expect(run(['test', 'a', 'b']).exitCode).toBe(2)
})

test('not a skill: exit 2, message on stderr, empty stdout', () => {
  const empty = mkdtempSync(join(tmpdir(), 'shakespii-test-empty-'))
  const r = run(['test', empty])
  expect(r.exitCode).toBe(2)
  expect(r.stderr.toString()).toContain('no SKILL.md')
  expect(r.stdout.toString()).toBe('')
})

test('--json stdout is pure JSON', () => {
  const r = run(['test', join(FIXTURES, 'bad-evals'), '--json'])
  expect(() => JSON.parse(r.stdout.toString())).not.toThrow()
})

test('top-level usage lists the test command', () => {
  const r = run(['--help'])
  expect(r.stdout.toString()).toContain('test <path> [--json]')
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test tests/cli/test-command.test.ts`
Expected: FAIL — `unknown command: test` (exit 2) makes every case fail.

- [ ] **Step 4: Write the implementation**

Create `src/cli/test.ts`:

```ts
import { existsSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { testSkill } from '../lib/harness'
import { parseSkill } from '../lib/parser'
import { jsonTestReport } from './format/test-json'
import { formatTestPretty } from './format/test-pretty'

const USAGE = 'usage: shakespii test <path> [--json]'

export function runTest(argv: string[]): number {
  let json = false
  const positionals: string[] = []
  for (const a of argv) {
    if (a === '--json') {
      json = true
    } else if (a.startsWith('-')) {
      console.error(`unknown option: ${a}\n${USAGE}`)
      return 2
    } else {
      positionals.push(a)
    }
  }
  if (positionals.length !== 1) {
    console.error(USAGE)
    return 2
  }
  const dir = resolve(positionals[0])
  let isDir = false
  try {
    isDir = statSync(dir).isDirectory()
  } catch {
    isDir = false
  }
  if (!isDir) {
    console.error(`not a directory: ${dir}`)
    return 2
  }
  if (!existsSync(join(dir, 'SKILL.md'))) {
    console.error(`not a skill: no SKILL.md at ${dir}`)
    return 2
  }
  try {
    const skill = parseSkill(dir)
    const result = testSkill(skill)
    console.log(json ? JSON.stringify(jsonTestReport(result), null, 2) : formatTestPretty(result))
    return result.summary.errors > 0 ? 1 : 0
  } catch (e) {
    console.error(`test failed: ${(e as Error).message}`)
    return 2
  }
}
```

In `src/cli/index.ts`, add a dispatch case after the `lint` case:

```ts
    case 'test': {
      const { runTest } = await import('./test')
      return runTest(rest)
    }
```

and replace the USAGE constant with:

```ts
const USAGE = `usage: shakespii <command>

commands:
  init <name> [--description "..."]   scaffold a new skill (intentionally lint-RED)
  lint <path> [--json] [--corpus] [--config <file>]   lint a skill directory or corpus root
  test <path> [--json]                run static harness checks on a skill's eval suite

flags: --help, --version`
```

- [ ] **Step 5: Run tests**

Run: `bun test tests/cli/test-command.test.ts`
Expected: PASS.

Run: `bun test`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/cli/test.ts src/cli/index.ts tests/fixtures/harness tests/cli/test-command.test.ts
git commit -m "feat(cli): shakespii test <path> [--json] with live deterministic stage"
```

---
### Task 9: repaired compress fixture + test-command keystones

**Files:**
- Create: `tests/fixtures/harness/compress/` (SKILL.md, README.md, scripts/ copied from the live skill; evals/ authored)
- Create: `tests/fixtures/harness/compress/evals/evals.json`, `tests/fixtures/harness/compress/evals/files/sample-memory.md`, `.../code-only.md`, `.../already-compressed.md`
- Test: `tests/cli/test-keystone.test.ts`

**Interfaces:**
- Consumes: the `test` CLI (Task 8).
- Produces: the M4a test-command keystone — byte-shape lock on `shakespii test <compress-fixture> --json`.

- [ ] **Step 1: Copy the live compress skill into the fixture (read-only source)**

```bash
mkdir -p tests/fixtures/harness/compress
cp ~/.claude/skills/compress/SKILL.md ~/.claude/skills/compress/README.md tests/fixtures/harness/compress/
cp -R ~/.claude/skills/compress/scripts tests/fixtures/harness/compress/scripts
```

Verify the frontmatter name is `compress` (the evals below depend on it):

```bash
grep '^name:' tests/fixtures/harness/compress/SKILL.md
```

Expected: `name: compress`. If it is anything else, use that exact value as `skill_name` in Step 2.

- [ ] **Step 2: Author the repaired evals**

`tests/fixtures/harness/compress/evals/files/sample-memory.md` (the inner `bash` fence is part of the fixture file):

````markdown
# Project memory

The deploy pipeline documentation lives at https://example.com/docs/deploy-pipeline
and must be consulted before every release. The team agreed on 2026-01-12 that
all database migrations require a rollback script committed in the same change.

Preferred build command:

```bash
bun run build --target=production
```

Remember that the staging environment uses the same configuration file as
production except for the DATABASE_URL environment variable, which points at
the staging cluster instead.
````

`tests/fixtures/harness/compress/evals/files/code-only.md` (the file is one `python` fence):

````markdown
```python
def canonicalize(path: str) -> str:
    """Resolve symlinks and normalize case."""
    import os
    return os.path.realpath(path)
```
````

`tests/fixtures/harness/compress/evals/files/already-compressed.md`:

```markdown
# memory

deploy docs: https://example.com/docs/deploy-pipeline — consult before release.
migrations need rollback script, same change. staging = prod config except
DATABASE_URL → staging cluster.
```

`tests/fixtures/harness/compress/evals/evals.json`:

```json
{
  "skill_name": "compress",
  "evals": [
    {
      "id": 1,
      "prompt": "Compress the memory file evals/files/sample-memory.md to save tokens.",
      "expected_output": "The file is rewritten in caveman-compressed form; every URL and fenced code block survives verbatim; a human-readable backup lands next to the file as sample-memory.original.md.",
      "files": ["evals/files/sample-memory.md"],
      "expectations": [
        "All URLs from the input survive verbatim",
        "All fenced code blocks survive byte-identical",
        "The compressed file is smaller than the input",
        "A backup file named sample-memory.original.md is created"
      ]
    },
    {
      "id": 2,
      "prompt": "Compress evals/files/code-only.md.",
      "expected_output": "No material compression is possible: the file is a single fenced code block, which the skill must preserve byte-identical.",
      "files": ["evals/files/code-only.md"],
      "expectations": [
        "The fenced code block is byte-identical after compression",
        "No code content is reworded or dropped"
      ]
    },
    {
      "id": 3,
      "prompt": "Compress evals/files/already-compressed.md a second time.",
      "expected_output": "Idempotent behavior: a file already in caveman form gains no further material compression and loses no technical content.",
      "files": ["evals/files/already-compressed.md"],
      "expectations": [
        "All URLs and identifiers survive the second pass",
        "The file does not grow"
      ]
    }
  ]
}
```

This is the repair the M1 audit called for: compress's own `benchmark.py` globs a fixtures directory that does not exist as installed; this fixture gives the skill a schema-valid, self-contained eval suite instead (live-skill sync is a post-M4 quick task gated on user sign-off, spec §0 adjudication #4).

- [ ] **Step 3: Write the failing keystone test**

Create `tests/cli/test-keystone.test.ts`:

```ts
import { expect, test } from 'bun:test'
import { join } from 'node:path'

const CLI = join(import.meta.dir, '../../src/cli/index.ts')
const COMPRESS = join(import.meta.dir, '../fixtures/harness/compress')
const NO_EVALS = join(import.meta.dir, '../fixtures/harness/no-evals')
const run = (args: string[]) => Bun.spawnSync(['bun', CLI, ...args], { cwd: '/tmp' })

test('KEYSTONE: the repaired compress fixture passes the deterministic stage byte-exactly', () => {
  const r = run(['test', COMPRESS, '--json'])
  expect(r.exitCode).toBe(0)
  const rep = JSON.parse(r.stdout.toString())
  expect(rep).toEqual({
    version: 1,
    mode: 'test',
    skill: { dir: COMPRESS, name: 'compress' },
    stages: [
      { stage: 'deterministic', status: 'pass', findings: [] },
      { stage: 'scenario', status: 'unavailable', note: 'ships in M4b' },
      { stage: 'grading', status: 'unavailable', note: 'ships in M4b' },
    ],
    summary: { errors: 0, warnings: 0 },
  })
  expect(Object.keys(rep)).toEqual(['version', 'mode', 'skill', 'stages', 'summary'])
})

test('KEYSTONE: missing evals fails with the contractual message and exit 1', () => {
  const r = run(['test', NO_EVALS, '--json'])
  expect(r.exitCode).toBe(1)
  const rep = JSON.parse(r.stdout.toString())
  expect(rep.stages[0].findings[0].message).toBe(
    'no evals/evals.json — author evals first (see TR01); shakespii test requires a reproducible eval suite',
  )
})

test('KEYSTONE: pretty summary line on the compress fixture', () => {
  const r = run(['test', COMPRESS])
  expect(r.exitCode).toBe(0)
  expect(r.stdout.toString()).toContain('deterministic: 0 errors, 0 warnings · scenario/grading pending M4b')
})
```

- [ ] **Step 4: Run the keystone**

Run: `bun test tests/cli/test-keystone.test.ts`
Expected: PASS (Steps 1–2 made the fixture valid; if any expectation fails, fix the fixture — never the assertion).

- [ ] **Step 5: Lint sanity on the fixture copy**

The fixture is a test asset, not a shipped skill; it does not need to lint clean (the live compress does not). Confirm only that `shakespii test` sees it as shown above — do not "improve" the copied SKILL.md/README/scripts; they stay verbatim so the fixture stays representative.

- [ ] **Step 6: Full suite, then commit**

Run: `bun test`
Expected: exit 0.

```bash
git add tests/fixtures/harness/compress tests/cli/test-keystone.test.ts
git commit -m "test(harness): repaired compress fixture and test-command keystones"
```

---

### Task 10: calibration — predictions first, then the sweep

**Files:**
- Create: `docs/CALIBRATION-M4A.md` (predictions committed BEFORE the sweep, then actuals + adjudications appended)
- Create (mirror): `~/.ai-pref-nsync/local-docs/ai-shakespii/knowledge-references/CALIBRATION-M4A.md`

**Interfaces:**
- Consumes: the full M4a feature set (Tasks 1–9); `docs/CALIBRATION-M3B.md` for baseline corpus numbers.
- Produces: the M4a calibration record. All corpus commands are READ-ONLY; any severity/option change discovered here is RECORDED, never applied.

- [ ] **Step 1: Write and commit the predictions (before running anything)**

Create `docs/CALIBRATION-M4A.md` with: a header naming the two corpus roots (`~/.claude/skills`, `~/.claude/plugins/cache/claude-plugins-official/superpowers/6.1.1/skills`); the baseline summary numbers copied verbatim from the M3b sweep tables in `docs/CALIBRATION-M3B.md`; and this predictions table:

| # | Prediction | Basis |
|---|---|---|
| P1 | Personal root: TR01 fires exactly once per discovered skill except `using-shakespii` (migrated evals validate) — expected 13 TR01 warns; warnings total = M3b baseline + 13; errors total unchanged | zero `evals.json` existed in the corpus pre-M4a (verified pre-spec); using-shakespii symlinks to the repo skill |
| P2 | Superpowers root: TR01 fires exactly once per skill — expected 14 TR01 warns; warnings total = M3b baseline + 14; errors total unchanged | no superpowers skill ships evals |
| P3 | Every TR01 finding is shape 1 (`skill ships no evals/evals.json`) — zero shape 2/3 in both corpora | no corpus skill ships any evals.json at all |
| P4 | `shakespii test ~/.claude/skills/compress` exits 1 with the single missing-evals error ("before" evidence for the repair) | live compress has no evals/ |
| P5 | `shakespii test ~/.claude/skills/using-shakespii` exits 0 with `{ errors: 0, warnings: 0 }` | weld skill, migrated evals |
| P6 | `shakespii test tests/fixtures/harness/compress` exits 0 (the "after" evidence) | Task 9 keystone |
| P7 | Scaffold keystone `{ errors: 20, warnings: 0 }`, weld `{ 0, 0 }`, corpus keystone byte-identical | Tasks 5–6 blast-radius rule |

Commit:

```bash
git add docs/CALIBRATION-M4A.md
git commit -m "docs(m4a): calibration predictions before the sweep"
```

- [ ] **Step 2: Run the sweep (read-only) and capture verbatim**

```bash
bun src/cli/index.ts lint ~/.claude/skills --corpus --json > /tmp/m4a-personal.json; echo "exit=$?"
bun src/cli/index.ts lint ~/.claude/plugins/cache/claude-plugins-official/superpowers/6.1.1/skills --corpus --json > /tmp/m4a-superpowers.json; echo "exit=$?"
bun src/cli/index.ts test ~/.claude/skills/compress --json; echo "exit=$?"
bun src/cli/index.ts test ~/.claude/skills/using-shakespii --json; echo "exit=$?"
bun src/cli/index.ts test tests/fixtures/harness/compress --json; echo "exit=$?"
```

From the two corpus JSON files extract per prediction: `summary` totals, per-skill TR01 finding counts and messages (`jq '[.skills[] | {name, tr01: [.findings[] | select(.ruleId == "TR01")]}]'` or equivalent), and skipped entries.

- [ ] **Step 3: Record actuals + adjudicate**

Append to `docs/CALIBRATION-M4A.md`: the verbatim summary blocks for both roots, the three `shakespii test` outputs, and an adjudication table for every deviation from P1–P7 classified as **rule-logic bug** (fix in code, RED test first), **miscalibration** (record the proposed severity/option change — do NOT apply; XS02-threshold precedent), or **audit-miss** (document; no change). If a deviation reveals a genuine code bug, fix it with a failing test first and note the commit in the adjudication row.

- [ ] **Step 4: Sync the canonical mirror**

```bash
mkdir -p ~/.ai-pref-nsync/local-docs/ai-shakespii/knowledge-references
cp docs/CALIBRATION-M4A.md ~/.ai-pref-nsync/local-docs/ai-shakespii/knowledge-references/CALIBRATION-M4A.md
cmp docs/CALIBRATION-M4A.md ~/.ai-pref-nsync/local-docs/ai-shakespii/knowledge-references/CALIBRATION-M4A.md
```

Expected: `cmp` silent (exit 0).

- [ ] **Step 5: Commit**

```bash
git add docs/CALIBRATION-M4A.md
git commit -m "docs(m4a): calibration sweep — actuals and adjudications"
```

---

### Task 11: documentation — HARNESS.md, catalog, roadmap, README, spec amendments

**Files:**
- Create: `docs/HARNESS.md`
- Modify: `docs/LINT-RULES.md`, `docs/ROADMAP.md`, `README.md`
- Mirrors: `~/.ai-pref-nsync/local-docs/ai-shakespii/knowledge-references/HARNESS.md`

(The spec amendments recorded in this plan's header were applied to the spec — its §12 — before execution began; do not edit the spec in this task.)

**Interfaces:**
- Consumes: everything shipped in Tasks 1–10.
- Produces: M4b's substrate document (HARNESS.md) and a truthful docs surface.

- [ ] **Step 1: Create `docs/HARNESS.md`**

```markdown
# shakespii test harness — contract (M4a substrate)

Status: M4a shipped (deterministic stage); M4b pending (scenario runs, grading).
Upstream schema authority: skill-creator `references/schemas.md` (pinned
evidence, vintage 2026-07 — see profiles/default.yaml provenance).

## Stage pipeline

`shakespii test <path> [--json]` runs three registered stages, always in this
order: `deterministic`, `scenario`, `grading`. In M4a only `deterministic` is
live; the other two report `status: "unavailable", note: "ships in M4b"` and
never affect the exit code. M4b implements them as headless `claude -p` runs
(executor) and LLM rubric grading (grader) writing `grading.json`.

Exit codes: 0 — no error-severity findings (warnings allowed); 1 — at least
one error finding; 2 — run error (bad usage, unknown option, unreadable
target). Nothing else exits 2.

## test-JSON v1

Top-level key order is contractual: `version, mode, skill, stages, summary`.

    {
      "version": 1,
      "mode": "test",
      "skill": { "dir": "<abs path>", "name": "<frontmatter name or null>" },
      "stages": [
        { "stage": "deterministic", "status": "pass" | "fail",
          "findings": [ { "severity": "error" | "warn", "message": "...",
                          "file": "evals/evals.json", "line": null } ] },
        { "stage": "scenario", "status": "unavailable", "note": "ships in M4b" },
        { "stage": "grading",  "status": "unavailable", "note": "ships in M4b" }
      ],
      "summary": { "errors": 0, "warnings": 0 }
    }

Harness findings are NOT lint findings: they carry no `ruleId` (the enclosing
stage identifies the source) and their key order is `severity, message, file,
line`. Schema-path detail is folded into `message` (`evals[2].prompt: must be
a non-empty string`).

## Deterministic stage checks (in order)

1. `evals/evals.json` present in the inventory — missing is the contractual
   error `no evals/evals.json — author evals first (see TR01); shakespii test
   requires a reproducible eval suite`.
2. Readable as UTF-8 text and valid JSON.
3. `validateEvalsJson` structural diagnostics (skill-creator shape:
   `skill_name`, `evals[]` with unique integer `id`, non-empty `prompt` /
   `expected_output` / `expectations`, optional `files`; unknown keys are
   errors — fail-loud).
4. Cross-document: `skill_name` equals the frontmatter `name` (skipped when
   the frontmatter has no parseable name — lint owns that defect); every
   `files` entry resolves inside the skill dir against the inventory (no
   absolute paths, no `../`).
5. Fewer than 3 cases in a structurally valid file — one warning.

TR01 (lint, warn) is the cheap always-on twin: at most one finding per skill,
delegating to the same deterministic-stage helpers, so lint and test can
never disagree about validity.

## Output contracts for M4b

`validateGradingJson` and `validateBenchmarkJson`
(`src/lib/evals/validate.ts`) encode the shapes the M4b runner must emit —
`grading.json` (graded expectations + summary with `pass_rate` in [0,1]) and
`benchmark.json` (`configuration` restricted to `with_skill` /
`without_skill`, nested `result`). They are library surface in M4a; the M4b
grader/benchmark writers must satisfy them.

## Run-dir and cache (`src/lib/harness/run-dir.ts`)

- Cache root resolution: `SHAKESPII_CACHE_DIR` env var, else
  `$XDG_CACHE_HOME/shakespii`, else `~/.cache/shakespii`. The harness never
  writes inside a skill directory.
- `skillContentHash`: sha256 over SKILL.md raw bytes plus every inventory
  file's (relPath, raw bytes) in sorted relPath order — bytes are read from
  disk, so any byte change (including same-size binary mutations) changes
  the hash.
- `runKey({skillHash, evalId, model})`: first 16 hex chars of
  sha256(`HARNESS_SCHEMA_VERSION \n skillHash \n evalId \n model`). Cache
  granularity is per (skill content, eval case, model).
- Layout: `<root>/runs/<skillName>/<runKey>/` will hold `outputs/` (executor
  artifacts + `metrics.json`), `timing.json`, `grading.json` (schemas.md
  layout). **Cache-hit definition: `grading.json` exists under the runKey.**
- `HARNESS_SCHEMA_VERSION` (currently 1) bumps when the run-dir layout or
  grading contract changes, invalidating stale caches. Eval runs are
  on-demand and cached — never per-commit.
```

- [ ] **Step 2: Update `docs/LINT-RULES.md`**

In the detection-notes list (the bulleted block containing the HY05 and HY06 notes), add after the HY06 bullet:

```markdown
- **TR01** — at most one finding per skill, three shapes: no `evals/evals.json` in the inventory; the file fails validation (the finding carries the error count and delegates detail to `shakespii test` — TR01 calls the harness's deterministic stage, so lint and test can never disagree); or a valid file with fewer than `minCases` (default 3) cases. Detail lives in the harness by design (ST02/CT02 dedup precedent).
```

At the end of the completion-paragraph sequence (after the M3b paragraph), add:

```markdown
**M4a completion (2026-07-08):** TR01 is implemented and live (warn,
single-finding cap, delegating validation to the harness deterministic stage —
docs/HARNESS.md, docs/CALIBRATION-M4A.md). The scaffold template and the
using-shakespii evals migrated from a pre-schema shape (`skill` key, string
ids) to the skill-creator schema (`skill_name`, integer ids). TR02 remains
pending M4b (requires live trigger runs).
```

- [ ] **Step 3: Update `docs/ROADMAP.md`**

Replace the entire `## M4 — Test harness` section (heading + its four bullets) with:

```markdown
## M4a — Test harness, static half (done 2026-07-08)

- [x] Adopt skill-creator schemas: TS types + validators for `evals.json` / `grading.json` / `benchmark.json` (the latter two are M4b's output contracts)
- [x] `shakespii test <path> [--json]`: stage pipeline with the deterministic stage live (schema validation, cross-document checks, fixture resolution); `scenario`/`grading` report unavailable until M4b
- [x] TR01 lint rule (warn, single-finding cap, delegates to the harness)
- [x] Run-dir/cache skeleton (byte-level content hash, per-eval runKey, XDG-aware cache root)
- [x] First fixture: the repaired compress benchmark (`tests/fixtures/harness/compress`)

## M4b — Test harness, LLM half

- [ ] Headless executor scenario runs via `claude -p` (ST04 probe mechanics)
- [ ] LLM rubric grading writing `grading.json` (M4a validators are the contract); cached per (skill content, eval, model), on-demand
- [ ] Trigger-accuracy eval (TR02) per skill-creator's design
- [ ] Benchmark stats (`benchmark.json`, with/without skill) and the `--fresh` flag
- [ ] Live-compress evals sync (user sign-off; attached to the personal-skill-migration decision)
```

- [ ] **Step 4: Update `README.md`**

Add under the lint bullet in the commands/features list:

```markdown
- `shakespii test <path> [--json]` — static harness checks of a skill's eval suite: skill-creator schema validation, cross-document checks, fixture resolution. Scenario runs and LLM grading land in M4b.
```

Update the status line/paragraph that currently ends at M3b to state that M4a (harness static half: `shakespii test`, TR01, evals validators, run-dir skeleton) is complete and M4b (LLM half) is next.

- [ ] **Step 5: Sync mirrors and verify**

Every doc this task touches that has a canonical mirror gets copied and cmp-verified. The existing mirror locations are: `LINT-RULES.md` under `specs/`, `ROADMAP.md` under `plans/`; `HARNESS.md` is new and goes to `knowledge-references/`. (`README.md` has no canonical mirror — it is repo-only, consistent with prior milestones.)

```bash
cp docs/HARNESS.md ~/.ai-pref-nsync/local-docs/ai-shakespii/knowledge-references/HARNESS.md
cp docs/LINT-RULES.md ~/.ai-pref-nsync/local-docs/ai-shakespii/specs/LINT-RULES.md
cp docs/ROADMAP.md ~/.ai-pref-nsync/local-docs/ai-shakespii/plans/ROADMAP.md
cmp docs/HARNESS.md ~/.ai-pref-nsync/local-docs/ai-shakespii/knowledge-references/HARNESS.md
cmp docs/LINT-RULES.md ~/.ai-pref-nsync/local-docs/ai-shakespii/specs/LINT-RULES.md
cmp docs/ROADMAP.md ~/.ai-pref-nsync/local-docs/ai-shakespii/plans/ROADMAP.md
```

Expected: all three `cmp` invocations silent (exit 0).

- [ ] **Step 6: Full suite, then commit**

Run: `bun test`
Expected: exit 0.

```bash
git add docs/HARNESS.md docs/LINT-RULES.md docs/ROADMAP.md README.md
git commit -m "docs(m4a): HARNESS.md contract, catalog and roadmap updates"
```

---

### Task 12: using-shakespii v0.3.0 + weld extension + final verification

**Files:**
- Modify: `skills/using-shakespii/SKILL.md` (version bump + test-loop subsection)
- Modify: `skills/using-shakespii/references/rule-remediations.md` (TR01 entry)
- Modify: `tests/skill/using-shakespii.test.ts` (third weld test)

**Interfaces:**
- Consumes: the `test` CLI (Task 8); the weld tests from Task 5.
- Produces: the companion skill teaching the test loop; the weld extended to `shakespii test`.

- [ ] **Step 1: Write the failing weld extension**

Append to `tests/skill/using-shakespii.test.ts`:

```ts
test('shakespii test passes on the weld skill', () => {
  const r = Bun.spawnSync(['bun', CLI, 'test', SKILL_DIR, '--json'])
  expect(r.exitCode).toBe(0)
  const rep = JSON.parse(r.stdout.toString())
  expect(rep.summary).toEqual({ errors: 0, warnings: 0 })
  expect(rep.stages[0]).toEqual({ stage: 'deterministic', status: 'pass', findings: [] })
})
```

Run: `bun test tests/skill/using-shakespii.test.ts`
Expected: PASS already (the migrated evals are valid) — this test is a lock, not a RED step. Confirm it passes.

- [ ] **Step 2: Update the companion skill**

In `skills/using-shakespii/SKILL.md`:

1. Frontmatter: bump `version:` from `0.2.0` to `0.3.0`.
2. Locate the corpus-audit subsection inside the Procedure section (`grep -n -i 'corpus' skills/using-shakespii/SKILL.md`). Immediately after that subsection (same heading depth), insert (the inner `bash` fence is a real fence in the skill file):

````markdown
### Testing a skill's evals

After a skill lints clean, verify its eval suite with the static harness:

```bash
shakespii test <skill-dir> --json
```

Exit codes: 0 = deterministic stage passed (warnings allowed), 1 = error
findings to fix, 2 = the run itself failed (bad path, no SKILL.md). The
deterministic stage checks that `evals/evals.json` exists, parses, follows
the skill-creator schema (`skill_name` equal to the frontmatter name, unique
integer ids, non-empty prompts and expectations, at least three cases), and
references only files that exist inside the skill directory. The `scenario`
and `grading` stages report `unavailable` until the LLM half of the harness
ships. Fix loop: read `stages[0].findings[].message` — each message carries
the JSON path of the defect — correct `evals/evals.json`, re-run until exit 0.
````

- [ ] **Step 3: Add the TR01 remediation entry**

In `skills/using-shakespii/references/rule-remediations.md`, insert in rule-ID order (after the HY06 entry, before XS01):

```markdown
### TR01 — skill ships a valid evals suite

Finding shapes: `skill ships no evals/evals.json`, `evals/evals.json fails
validation (N errors)`, `only N eval case(s)`.

Fix: author `evals/evals.json` at the skill root in the skill-creator shape —
top-level `skill_name` (must equal the frontmatter `name`) and `evals`, an
array of at least three cases, each `{ id (unique integer), prompt,
expected_output, files (optional, paths that exist inside the skill dir),
expectations (non-empty string array) }`. Then run `shakespii test <dir>
--json` for the full diagnostic list (lint caps TR01 at one finding per
skill) and fix findings until exit 0.
```

- [ ] **Step 4: Weld relint + full suite**

Run: `bun test tests/skill/using-shakespii.test.ts`
Expected: PASS — all three weld tests, including lint `{ errors: 0, warnings: 0 }` on the updated SKILL.md. If lint reports findings on the new section (HY05, PH01, ST02), fix the section text, never the assertion.

Run: `bun test`
Expected: exit 0.

- [ ] **Step 5: Final verification block**

```bash
bun test
echo "suite exit=$?"
git status --porcelain
bun src/cli/index.ts lint skills/using-shakespii --json > /dev/null; echo "lint exit=$?"
bun src/cli/index.ts test skills/using-shakespii --json > /dev/null; echo "test exit=$?"
```

Expected: suite exit 0; clean worktree after the commit below; both exit 0.

- [ ] **Step 6: Commit**

```bash
git add skills/using-shakespii tests/skill/using-shakespii.test.ts
git commit -m "feat(skill): using-shakespii v0.3.0 — eval test loop and TR01 remediation"
```

---

## Plan self-review notes

- **Spec coverage:** §2 CLI → Task 8; §3 validators/types → Tasks 1–2; §4 stage → Task 3; §5 TR01 → Task 6; §6 blast radius → Tasks 5, 6; §7 run-dir → Task 4; §8 fixtures → Tasks 5, 8, 9; §9 keystones/calibration → Tasks 9, 10; §10 docs/companion → Tasks 11, 12; §11 non-goals → no task touches them. Spec amendments (plan-time discoveries) → applied directly to the spec (its §12) before execution; the plan implements the amended spec.
- **Ordering constraint:** Task 5 MUST precede Task 6 (fixtures prepared before TR01 goes live keeps every intermediate commit green). Task 3 must precede Task 6 (TR01 delegates to `runDeterministic`). Tasks 7–8 need Task 3; Task 9 needs Task 8; Tasks 10–12 need everything before them.
- **Type consistency:** `HarnessFinding`/`StageReport`/`TestResult` defined once (Task 3), imported by Tasks 7–8; `SchemaDiagnostic`/`isRecord` defined once (Task 1), imported by Tasks 2–3; `runDeterministic` (Task 3) consumed by Task 6; CLI export `runTest` (Task 8) mirrors `runLint`/`runInit` naming.
