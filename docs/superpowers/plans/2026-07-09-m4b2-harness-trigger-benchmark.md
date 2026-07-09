# M4b-2 Test Harness LLM Half Part 2 (TR02 Trigger Eval + Benchmark) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `shakespii test <path> --run --triggers` measures trigger accuracy (does the skill's name+description make Claude invoke it for the right queries and leave near-misses alone), and the new `shakespii bench <path>` produces a validated `benchmark.json` with with-skill vs without-skill capability deltas and variance over repeated runs — all tokenless-testable through the injected `ClaudeRunner`.

**Architecture:** Extend the M4b-1 runner boundary with a detect mode (streaming `--include-partial-messages` scan + early process-group kill); add a trigger stage (per-query reps, cache, majority scoring) behind `test --triggers`; add a bench pipeline (eval × config × run matrix, independent cache keys, M4b-1 grader unchanged, stats, atomic validated `benchmark.json`) behind a new `bench` subcommand; ship TR02 as a static lint rule over `evals/triggers.json`.

**Tech Stack:** Bun + TypeScript (strict), `bun test`, node:fs/node:path/node:crypto. No new dependencies.

**Spec:** `docs/specs/2026-07-09-m4b2-harness-trigger-benchmark-design.md` (approved; includes the SDD-review amendments: bench run-failure contract in §8.1, hardening test coverage in §11).

## Global Constraints

- Contractual strings — copy verbatim, never paraphrase:
  - test usage: `usage: shakespii test <path> [--json] [--run] [--fresh] [--model <name>] [--triggers]`
  - bench usage: `usage: shakespii bench <path> [--json] [--runs <n>] [--model <name>] [--fresh]`
  - guards (each printed to stderr as `<message>\n<usage>`, exit 2): `--triggers requires --run`, `--runs requires a value`, `--runs must be a positive integer`, `--model requires a value`, `unknown option: <flag>`
  - bench deterministic gate (stderr, exit 2): finding lines first, then `bench requires a valid eval suite — fix the findings above first`
  - bench run failure (stdout, exit 1): `bench run failed (eval <id>, <config>, run <n>): <detail>` where `<detail>` = `executor <status> — <errorMessage or 'no result event'>` (`<status>` ∈ `timeout | nonzero-exit | no-result`) or the grader failure string verbatim; with `--json` the only stdout is the single-line `{"error":"<message>"}`
  - bench internal validation failure (stdout, exit 1, nothing written): `internal: benchmark document failed validation (<path>: <message>)`
  - bench thrown-error surface (stderr, exit 2): `bench failed: <msg>` (mirrors `test failed: <msg>`)
  - trigger stage findings (all `file: 'evals/triggers.json'`, `line: null`, severity error): `evals/triggers.json missing — required by --triggers`; `evals/triggers.json is not valid JSON`; `evals/triggers.json: <path> — <message>` (one per validator diagnostic); `evals/triggers.json: skill_name — must match evals.json skill_name`; `trigger run failed (query <i>, rep <r>): <status> — <errorMessage or 'no detail'>` (i = 0-based query index); `trigger accuracy <acc> below threshold 0.8 (<P>/<Q> queries)` (acc = `toFixed(2)`)
  - deterministic hardening finding: `skill_name must be a safe path segment`
  - TR02 messages (exactly four shapes, first match wins): `no evals/triggers.json — add a trigger-accuracy query set (16+ labeled queries incl. negatives)` (file `SKILL.md`); `evals/triggers.json fails validation (<n> error(s) with TR01 pluralization)`; `evals/triggers.json has <n> queries, fewer than <minQueries>`; `evals/triggers.json has no negative queries (should_trigger: false)`
  - pretty summary trigger tail: ` · trigger: <P>/<Q> query|queries accurate (<C> cached)` (house pluralization: `query` iff Q === 1); skip variant with `--triggers`: `scenario/grading/trigger skipped (deterministic stage failed)`
  - bench pretty block: exactly as pinned in Task 10 (labels padEnd(16), `run(s)/config` and `run(s) cached` literal)
  - index usage lines: `  test <path> [--json] [--run]        run harness checks; --run executes LLM stages (--triggers adds trigger accuracy)` and `  bench <path> [--json] [--runs <n>]  benchmark with vs without skill (executes LLM runs)`
- Constants: `TRIGGER_REPS = 3`, `TRIGGER_PASS_THRESHOLD = 0.5`, `TRIGGER_ACCURACY_THRESHOLD = 0.8`, `BENCH_DEFAULT_RUNS = 3`, TR02 default `minQueries: 16`. `DEFAULT_MODEL = 'sonnet'`, `RUN_TIMEOUT_MS = 300_000`, `HARNESS_SCHEMA_VERSION` stays 1.
- Key formulas (sha256 hex, sliced to 16):
  - `triggerKey = sha256("1\n<skillHash>\ntrigger\n<sha256hex(query)>\n<rep>\n<model>")[:16]`
  - `benchKey = sha256("1\n<skillHash>\n<evalId>\n<config>\n<runNumber>\n<model>")[:16]` (6 segments — structurally distinct from M4b-1's 4-segment `runKey`; bench never reuses `test --run` scenario cache entries)
  - `suiteKey = sha256("1\n<skillHash>\nbench-suite\n<model>\n<runs>")[:16]`; document at `<cacheRoot>/runs/<skillName>/bench-<suiteKey>/benchmark.json`
- Contractual key orders: `trigger.json` = `query, shouldTrigger, rep, triggered, status, durationSeconds`; trigger stage JSON = `stage, status, findings, queries (passed, total), runs`; trigger runs entries = `queryIndex, shouldTrigger, triggered, reps, cached, status`; `benchmark.json` = `metadata (skill_name, model, runs_per_configuration, harness_schema_version — NO timestamp), runs (eval_id, configuration, run_number, result), run_summary (with_skill, without_skill, delta)`; result = `pass_rate, passed, failed, total, time_seconds, tokens, tool_calls, errors`; stat objects = `mean, stddev, min, max`; delta = `pass_rate, time_seconds, tokens`.
- Stats: sample standard deviation (n−1 denominator), 0 when n < 2. pass_rate stats 4-decimal; time/tokens stats 2-decimal. Deltas computed from the rounded stored means, always signed: pass_rate `(+|-)D.DD`, time `(+|-)D.D`, tokens `(+|-)D` integer; zero delta renders `+0.00` / `+0.0` / `+0`.
- Failure semantics: trigger reps and bench executor runs get exactly ONE retry re-issuing the identical request (restage first); trigger stage continues to the next query after a failed query (excluded from `{passed, total}`); bench aborts on the first failed run (fail-fast, no partial `benchmark.json`, failed run uncached). Timeout/nonzero-exit are run failures, never "did not trigger".
- Frozen surfaces: lint CLI + lint JSON v1 byte-identical for skills where TR02 is silent; `test` output without `--triggers` byte-identical to M4b-1 (JSON and pretty); scenario/grading stage contracts unchanged; `evals.json`/`grading.json`/`benchmark.json` M4a types and validators untouched; `profiles/default.yaml` untouched except the one TR02 line.
- Sanctioned re-pins ONLY (exact-string swaps, each listed in its task): the TR02 activation wave (Task 3), the test usage string gaining `[--triggers]` (Task 7), the grade-case retry timing pin gaining observability fields (Task 5). Never weaken any other assertion to absorb a finding.
- The dogfood corpus `~/.claude/skills/` and the superpowers plugin cache are strictly READ-ONLY. Neither `bench` nor `--triggers` ever writes into any skill directory. `skills/using-shakespii/` (in-repo) is writable per the sequencing rule below.
- **Sequencing rule (spec §12, binding):** author `skills/using-shakespii/evals/triggers.json` (Task 3) → commit calibration predictions (Task 11 step 1, separate commit) → live sweeps (Task 11) → cache proofs (Task 11) → only then v0.5.0 SKILL.md body edits (Task 12 — body edits change `skillHash` and would invalidate the proofs).
- Every test that touches the cache passes an explicit temp `cacheRoot` (or sets `SHAKESPII_CACHE_DIR` for subprocess tests). No test reads or writes `~/.cache/shakespii`. No test spawns the real `claude` — only `FakeRunner` scripts and stub shell scripts.
- TDD: write the failing test, run it (unpiped `bun test <file>`), implement, re-run, commit. Full-suite `bun test` and `bun run typecheck` green at every commit — single documented exception: Task 3 is the atomic TR02-activation commit (rule registration + re-pin wave land together; the suite is red mid-task, green at commit).
- Docs are dual-location: canonical `~/.ai-pref-nsync/local-docs/ai-shakespii/<subdir>/`, repo `docs/` mirror; sync with `cp` + `cmp` in the same task that edits them (HARNESS.md, CALIBRATION-M4B2.md → `knowledge-references/`; LINT-RULES.md → `specs/`; ROADMAP.md and this plan → `plans/`).
- Task 11 (calibration) is the ONLY task that spends tokens and is **controller-executed** — long sweeps run in the controller's own background shell, never a subagent's (subagent background shells die at turn end; M4b-1 lifecycle gotcha).

**Model allocation guidance (for subagent-driven execution):** Tasks 1, 2, 8 are transcription-complete pure modules → cheapest tier. Tasks 4, 5, 6, 9 touch process behavior, shared types, or multi-file wiring → mid tier. Tasks 3, 7, 10 carry re-pin waves and CLI surface changes → mid tier. Task 11 is controller-executed (no dispatch). Tasks 12, 13 are docs/content → cheapest tier with mid-tier review. Reviewers ≥ implementer tier; final whole-branch review on the strongest available model.

---

### Task 1: `triggers.json` schema — types and `validateTriggersJson`

**Files:**
- Modify: `src/lib/evals/types.ts` (append)
- Modify: `src/lib/evals/validate.ts` (append)
- Create: `tests/evals/validate-triggers.test.ts`

**Interfaces:**
- Consumes: `SchemaDiagnostic`, `isRecord` (existing, `src/lib/evals/validate.ts`).
- Produces: `TriggerQuery { query: string; should_trigger: boolean }`, `TriggersJson { skill_name: string; queries: TriggerQuery[] }`, `validateTriggersJson(doc: unknown): SchemaDiagnostic[]` — consumed by Tasks 2 and 6.

- [ ] **Step 1: Write the failing tests**

`tests/evals/validate-triggers.test.ts`:

```ts
import { expect, test } from 'bun:test'
import { validateTriggersJson } from '../../src/lib/evals/validate'

const valid = {
  skill_name: 'using-shakespii',
  queries: [
    { query: 'Lint the skill I just wrote and fix the findings', should_trigger: true },
    { query: 'Run eslint on my TypeScript project', should_trigger: false },
  ],
}

test('valid document produces no diagnostics', () => {
  expect(validateTriggersJson(valid)).toEqual([])
})

test('non-object root', () => {
  expect(validateTriggersJson([])).toEqual([{ path: '$', message: 'root must be an object' }])
  expect(validateTriggersJson('nope')).toEqual([{ path: '$', message: 'root must be an object' }])
})

test('missing and empty skill_name', () => {
  expect(validateTriggersJson({ queries: valid.queries })).toEqual([
    { path: 'skill_name', message: 'must be a non-empty string' },
  ])
  expect(validateTriggersJson({ skill_name: '', queries: valid.queries })).toEqual([
    { path: 'skill_name', message: 'must be a non-empty string' },
  ])
})

test('unknown root key', () => {
  expect(validateTriggersJson({ ...valid, extra: 1 })).toEqual([{ path: 'extra', message: 'unknown key "extra"' }])
})

test('queries must be a non-empty array', () => {
  expect(validateTriggersJson({ skill_name: 'x', queries: [] })).toEqual([
    { path: 'queries', message: 'must be a non-empty array' },
  ])
  expect(validateTriggersJson({ skill_name: 'x' })).toEqual([
    { path: 'queries', message: 'must be a non-empty array' },
  ])
})

test('per-entry diagnostics in pinned order: query, should_trigger, unknown keys', () => {
  const doc = {
    skill_name: 'x',
    queries: [{ query: '', should_trigger: 'yes', note: 'hm' }, 'not-an-object'],
  }
  expect(validateTriggersJson(doc)).toEqual([
    { path: 'queries[0].query', message: 'must be a non-empty string' },
    { path: 'queries[0].should_trigger', message: 'must be a boolean' },
    { path: 'queries[0].note', message: 'unknown key "note"' },
    { path: 'queries[1]', message: 'must be an object' },
  ])
})

test('root diagnostics precede entry diagnostics (document order)', () => {
  const doc = { queries: [{ query: 'q', should_trigger: 1 }] }
  expect(validateTriggersJson(doc)).toEqual([
    { path: 'skill_name', message: 'must be a non-empty string' },
    { path: 'queries[0].should_trigger', message: 'must be a boolean' },
  ])
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/evals/validate-triggers.test.ts`
Expected: FAIL — `validateTriggersJson` is not exported.

- [ ] **Step 3: Implement**

Append to `src/lib/evals/types.ts`:

```ts
export interface TriggerQuery {
  query: string
  should_trigger: boolean
}

export interface TriggersJson {
  skill_name: string
  queries: TriggerQuery[]
}
```

Append to `src/lib/evals/validate.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/evals/validate-triggers.test.ts` then `bun test && bun run typecheck`
Expected: PASS; full suite green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/evals/types.ts src/lib/evals/validate.ts tests/evals/validate-triggers.test.ts
git commit -m "feat(evals): triggers.json types and validator"
```

---

### Task 2: TR02 rule module + LINT-RULES evidence amendment (rule NOT yet registered)

**Files:**
- Create: `src/lib/rules/TR02.ts`
- Create: `tests/rules/TR02.test.ts`
- Modify: `docs/LINT-RULES.md` (TR02 row evidence amendment) + sync `~/.ai-pref-nsync/local-docs/ai-shakespii/specs/LINT-RULES.md`

**Interfaces:**
- Consumes: `Rule` (`src/lib/types.ts`), `validateTriggersJson`, `TriggersJson` (Task 1), test helpers `cleanSkillRaw, ctxFor, skillFromRaw` (`tests/helpers/skill`).
- Produces: `TR02: Rule` — registered by Task 3. NOT imported by `src/lib/rules/index.ts` in this task (registration is the activation event; the profile already carries a TR02 entry, so registering here would fire the rule corpus-wide before the re-pin wave).

- [ ] **Step 1: Write the failing tests**

`tests/rules/TR02.test.ts` (mirrors the TR01 test pattern):

```ts
import { expect, test } from 'bun:test'
import type { FileEntry } from '../../src/lib/types'
import { TR02 } from '../../src/lib/rules/TR02'
import { cleanSkillRaw, ctxFor, skillFromRaw } from '../helpers/skill'

const entry = (doc: unknown): FileEntry => {
  const text = typeof doc === 'string' ? doc : JSON.stringify(doc)
  return { relPath: 'evals/triggers.json', size: text.length, text }
}

const validDoc = (n: number, negatives = 1) => ({
  skill_name: 'test-skill',
  queries: Array.from({ length: n }, (_, i) => ({
    query: `Query ${i + 1}.`,
    should_trigger: i >= negatives,
  })),
})

const CTX = ctxFor('TR02')

test('shape 1: no evals/triggers.json — single finding on SKILL.md', () => {
  expect(TR02.check(skillFromRaw(cleanSkillRaw()), CTX)).toEqual([
    {
      message: 'no evals/triggers.json — add a trigger-accuracy query set (16+ labeled queries incl. negatives)',
      file: 'SKILL.md',
      line: null,
    },
  ])
})

test('shape 2: unparsable JSON counts as 1 error', () => {
  expect(TR02.check(skillFromRaw(cleanSkillRaw(), [entry('{nope')]), CTX)).toEqual([
    { message: 'evals/triggers.json fails validation (1 error)', file: 'evals/triggers.json', line: null },
  ])
})

test('shape 2: validator diagnostics counted with pluralization', () => {
  const doc = { skill_name: '', queries: [{ query: '', should_trigger: true }] }
  expect(TR02.check(skillFromRaw(cleanSkillRaw(), [entry(doc)]), CTX)).toEqual([
    { message: 'evals/triggers.json fails validation (2 errors)', file: 'evals/triggers.json', line: null },
  ])
})

test('shape 3: valid but fewer than minQueries', () => {
  expect(TR02.check(skillFromRaw(cleanSkillRaw(), [entry(validDoc(15))]), CTX)).toEqual([
    { message: 'evals/triggers.json has 15 queries, fewer than 16', file: 'evals/triggers.json', line: null },
  ])
})

test('shape 4: no negative queries', () => {
  expect(TR02.check(skillFromRaw(cleanSkillRaw(), [entry(validDoc(16, 0))]), CTX)).toEqual([
    { message: 'evals/triggers.json has no negative queries (should_trigger: false)', file: 'evals/triggers.json', line: null },
  ])
})

test('silent on a valid 16-query set with negatives', () => {
  expect(TR02.check(skillFromRaw(cleanSkillRaw(), [entry(validDoc(16))]), CTX)).toEqual([])
})

test('single-finding cap: shape order is first match wins', () => {
  // 3 queries, zero negatives: shape 3 fires, shape 4 does not.
  expect(TR02.check(skillFromRaw(cleanSkillRaw(), [entry(validDoc(3, 0))]), CTX)).toHaveLength(1)
})

test('minQueries option is honored', () => {
  const ctx = { ...CTX, options: { minQueries: 10 } }
  expect(TR02.check(skillFromRaw(cleanSkillRaw(), [entry(validDoc(10))]), ctx)).toEqual([])
})
```

Note: `ctxFor('TR02')` resolves options from `profiles/default.yaml`, which already carries a TR02 entry. If `ctxFor` throws for an unregistered rule id, construct the context inline as `{ options: { minQueries: 16 }, anatomy: ctxFor('TR01').anatomy }` — the assertions above are the contract, not the helper.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/rules/TR02.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/rules/TR02.ts`**

```ts
import { validateTriggersJson } from '../evals/validate'
import type { TriggersJson } from '../evals/types'
import type { Rule } from '../types'

const TRIGGERS = 'evals/triggers.json'

/**
 * At most one finding per skill (TR01 cap precedent): lint is the cheap
 * always-on surface; measured trigger accuracy lives in `test --triggers`.
 * Static and tokenless — never spawns anything.
 */
export const TR02: Rule = {
  id: 'TR02',
  check(skill, ctx) {
    const entry = skill.files.find(f => f.relPath === TRIGGERS)
    if (!entry) {
      return [{
        message: 'no evals/triggers.json — add a trigger-accuracy query set (16+ labeled queries incl. negatives)',
        file: 'SKILL.md',
        line: null,
      }]
    }
    let doc: unknown
    let parseFailed = entry.text === null
    if (!parseFailed) {
      try {
        doc = JSON.parse(entry.text as string)
      } catch {
        parseFailed = true
      }
    }
    const n = parseFailed ? 1 : validateTriggersJson(doc).length
    if (n > 0) {
      return [{
        message: `evals/triggers.json fails validation (${n} error${n === 1 ? '' : 's'})`,
        file: TRIGGERS,
        line: null,
      }]
    }
    const triggers = doc as TriggersJson
    const minQueries = typeof ctx.options.minQueries === 'number' ? ctx.options.minQueries : 16
    if (triggers.queries.length < minQueries) {
      return [{
        message: `evals/triggers.json has ${triggers.queries.length} queries, fewer than ${minQueries}`,
        file: TRIGGERS,
        line: null,
      }]
    }
    if (!triggers.queries.some(q => q.should_trigger === false)) {
      return [{ message: 'evals/triggers.json has no negative queries (should_trigger: false)', file: TRIGGERS, line: null }]
    }
    return []
  },
}
```

- [ ] **Step 4: Run tests, full suite, typecheck**

Run: `bun test tests/rules/TR02.test.ts && bun test && bun run typecheck`
Expected: all green — the rule is not registered, so no lint pin changes.

- [ ] **Step 5: Amend the LINT-RULES TR02 row**

In `docs/LINT-RULES.md`, locate the TR02 row/entry (it currently describes a "pass threshold on held-out split"). Replace its description and evidence wording with:

> TR02 — trigger-accuracy query set present and well-formed: `evals/triggers.json` with ≥16 labeled queries including near-miss negatives (warn; options `{ minQueries: 16 }`). Measured accuracy runs under `shakespii test --run --triggers` (skill-creator run_eval.py defaults: 3 reps/query, trigger threshold 0.5 = majority rule, accuracy threshold 0.8). Evidence: skill-creator `run_eval.py` + adjudication 2026-07-09 (measure-only — the earlier "pass threshold on held-out split" wording described the retired optimizer design; description optimization moves to the M5 writer).

Keep the row's severity (warn) and evidence citation format consistent with neighboring rows. Sync the mirror:

```bash
cp docs/LINT-RULES.md ~/.ai-pref-nsync/local-docs/ai-shakespii/specs/LINT-RULES.md
cmp docs/LINT-RULES.md ~/.ai-pref-nsync/local-docs/ai-shakespii/specs/LINT-RULES.md && echo MIRROR-OK
```

Expected: `MIRROR-OK`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/rules/TR02.ts tests/rules/TR02.test.ts docs/LINT-RULES.md
git commit -m "feat(rules): TR02 trigger-query-set rule (unregistered) + LINT-RULES evidence amendment"
```

---

### Task 3: TR02 activation — registration, profile pin, using-shakespii triggers.json, lint re-pin wave

This is the atomic activation commit: registering TR02 makes it fire for every profiled skill lacking a valid `evals/triggers.json` (the profile already carries a TR02 entry). The suite is red mid-task and green at commit.

**Files:**
- Modify: `src/lib/rules/index.ts` (register TR02)
- Modify: `profiles/default.yaml` line 76 (pin the spec'd options)
- Create: `skills/using-shakespii/evals/triggers.json` (20 queries — the calibration target)
- Modify: `tests/skill/using-shakespii.test.ts` (triggers.json shape assertions)
- Modify (re-pin wave): `tests/cli/keystone.test.ts`, `tests/cli/lint.test.ts`, `tests/cli/config.test.ts`, `tests/cli/corpus.test.ts`, `tests/cli/corpus-keystone.test.ts` (plus `tests/cli/init.test.ts` only if it fails)

**Interfaces:**
- Consumes: `TR02` (Task 2).
- Produces: TR02 live in the default profile — `bench`/`--triggers` docs (Task 13) and calibration (Task 11) rely on using-shakespii being TR02-silent.

- [ ] **Step 1: Author `skills/using-shakespii/evals/triggers.json`**

Exactly this content (12 positives, 8 near-miss negatives; `skill_name` matches `evals.json`):

```json
{
  "skill_name": "using-shakespii",
  "queries": [
    { "query": "Lint the skill I just wrote and fix the findings", "should_trigger": true },
    { "query": "Run shakespii lint on ./skills/pdf-tools and explain the findings", "should_trigger": true },
    { "query": "Create a new skill called changelog-writer", "should_trigger": true },
    { "query": "Scaffold a skill for summarizing meeting notes and make it pass lint", "should_trigger": true },
    { "query": "Audit all my installed skills for duplication", "should_trigger": true },
    { "query": "Run the evals for my compress skill and tell me what failed", "should_trigger": true },
    { "query": "Check whether my skill's description will actually make Claude trigger it", "should_trigger": true },
    { "query": "Benchmark my skill with and without the skill mounted", "should_trigger": true },
    { "query": "Validate the frontmatter of SKILL.md in ./skills/note-taker", "should_trigger": true },
    { "query": "My skill directory fails shakespii test — help me fix the eval suite", "should_trigger": true },
    { "query": "Add eval cases to my skill so it meets the minimum of three", "should_trigger": true },
    { "query": "Which lint rules is my SKILL.md violating and how do I fix CT03?", "should_trigger": true },
    { "query": "Run eslint on my TypeScript project", "should_trigger": false },
    { "query": "Fix the ESLint errors in src/cli", "should_trigger": false },
    { "query": "Write unit tests for my parser module", "should_trigger": false },
    { "query": "Review this pull request for code quality issues", "should_trigger": false },
    { "query": "Benchmark my API server's request latency", "should_trigger": false },
    { "query": "Lint this Markdown README for broken links", "should_trigger": false },
    { "query": "Improve my prompt for the customer-support chatbot", "should_trigger": false },
    { "query": "Audit my npm dependencies for vulnerabilities", "should_trigger": false }
  ]
}
```

- [ ] **Step 2: Extend the weld test (failing until Step 3-4 land)**

Append to `tests/skill/using-shakespii.test.ts`:

```ts
test('triggers.json carries 20 labeled queries: 12 positive, 8 near-miss negatives', async () => {
  const raw = await Bun.file(join(SKILL_DIR, 'evals/triggers.json')).text()
  const doc = JSON.parse(raw) as { skill_name: string; queries: Array<{ query: string; should_trigger: boolean }> }
  expect(doc.skill_name).toBe('using-shakespii')
  expect(doc.queries).toHaveLength(20)
  expect(doc.queries.filter(q => q.should_trigger).length).toBe(12)
  expect(doc.queries.filter(q => !q.should_trigger).length).toBe(8)
  for (const q of doc.queries) expect(q.query.length).toBeGreaterThan(0)
})
```

(The existing zero-findings lint weld test is the TR02-silence gate — do not touch it.)

- [ ] **Step 3: Register the rule**

In `src/lib/rules/index.ts` add `import { TR02 } from './TR02'` after the TR01 import and `TR02,` after `TR01,` in the `rules` array.

- [ ] **Step 4: Pin the profile line**

In `profiles/default.yaml`, replace the existing line

```yaml
  TR02: { severity: warn, options: { minQueries: 16, requireNearMissNegatives: true } }
```

with the spec-pinned form (the negatives check is unconditional in the rule; the option is retired):

```yaml
  TR02: { severity: warn, options: { minQueries: 16 } }
```

- [ ] **Step 5: Run the suite and apply the re-pin wave**

Run: `bun test`
Expected failures are confined to the files below. Every delta must be exactly "+1 warning per linted skill lacking `evals/triggers.json`", with the TR02 finding text from the Global Constraints (missing-file shape, `file: 'SKILL.md'`, `line: null` — sorts before `evals/evals.json` findings). Known re-pins:

- `tests/cli/keystone.test.ts:17` — scaffold summary `{ errors: 20, warnings: 0 }` → `{ errors: 20, warnings: 1 }`
- `tests/cli/lint.test.ts` warn-only test — `{ errors: 0, warnings: 1 }` → `{ errors: 0, warnings: 2 }`; `'(0 errors, 1 warnings)'` → `'(0 errors, 2 warnings)'`; `findings[0].ruleId` stays `'FM01'` only if FM01's finding sorts first — if the TR02 SKILL.md/line-null finding sorts ahead of it, pin `findings[0].ruleId` to `'TR02'` and assert FM01 at its actual index
- `tests/cli/corpus-keystone.test.ts` — clean-pair: top `{ skills: 2, skipped: 0, errors: 0, warnings: 2 }`, per-skill `{ errors: 0, warnings: 1 }`; clone-pair: top warnings `2` → `4`, per-skill `{ errors: 0, warnings: 1 }`; shared-block-trio: top warnings `1` → `4`, per-skill `{ errors: 0, warnings: 1 }`; the summary-identity test recomputes and must pass unchanged
- `tests/cli/corpus.test.ts` — each pinned summary gains +1 warning per linted (non-skipped) skill; the pretty line `'2 skills linted, 0 skipped · 0 errors, 2 warnings (of which 2 corpus-level)'` → `'... 4 warnings (of which 2 corpus-level)'`
- `tests/cli/config.test.ts` — for each failing pin, verify the profile in play resolves a TR02 setting (overlay of default → fires; a from-scratch profile without a TR02 key → must NOT fire); re-pin only the values whose delta is the TR02 warning
- `tests/skill/using-shakespii.test.ts` — must stay green with ZERO re-pins (triggers.json from Step 1 keeps TR02 silent)

Any failure outside this list is a defect in Task 2's rule — fix the rule, do not re-pin.

- [ ] **Step 6: Full gates**

Run: `bun test && bun run typecheck`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add src/lib/rules/index.ts profiles/default.yaml skills/using-shakespii/evals/triggers.json tests/
git commit -m "feat(rules): activate TR02 — profile pin, using-shakespii trigger set, lint re-pins"
```

---

### Task 4: Runner detect mode — detector, streaming early-kill, FakeRunner helper

**Files:**
- Create: `src/lib/harness/detect.ts`
- Create: `tests/harness/detect.test.ts`
- Modify: `src/lib/harness/claude-runner.ts` (request/result extensions, streaming stdout, detect wiring)
- Modify: `tests/harness/claude-runner.test.ts` (detect-mode stub tests)
- Modify: `tests/harness/helpers.ts` (`detected` helper)

**Interfaces:**
- Consumes: existing `spawnClaudeRunner` internals.
- Produces: `RunnerRequest.detect?: { skillName: string }`; `RunnerResult.triggered?: boolean` (present iff `detect` was requested AND status is `completed`); `createDetector(skillName): Detector { feed(event: unknown): boolean }`; helper `detected(triggered: boolean, overrides?): RunnerResult` — consumed by Task 6.

- [ ] **Step 1: Write the failing detector unit tests**

`tests/harness/detect.test.ts`:

```ts
import { expect, test } from 'bun:test'
import { createDetector } from '../../src/lib/harness/detect'

const start = (name: string) => ({
  type: 'stream_event',
  event: { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tu1', name } },
})
const delta = (partial: string) => ({
  type: 'stream_event',
  event: { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: partial } },
})
const stop = { type: 'stream_event', event: { type: 'content_block_stop', index: 0 } }
const messageStop = { type: 'stream_event', event: { type: 'message_stop' } }

test('Skill tool_use naming the skill fires at content_block_stop, split across deltas', () => {
  const d = createDetector('demo-skill')
  expect(d.feed(start('Skill'))).toBe(false)
  expect(d.feed(delta('{"command": "demo-sk'))).toBe(false)
  expect(d.feed(delta('ill"}'))).toBe(false)
  expect(d.feed(stop)).toBe(true)
})

test('Read of the mounted SKILL.md path fires', () => {
  const d = createDetector('demo-skill')
  d.feed(start('Read'))
  d.feed(delta('{"file_path": "/w/outputs/.claude/skills/demo-skill/SKILL.md"}'))
  expect(d.feed(stop)).toBe(true)
})

test('Read of an unrelated path does not fire', () => {
  const d = createDetector('demo-skill')
  d.feed(start('Read'))
  d.feed(delta('{"file_path": "README.md"}'))
  expect(d.feed(stop)).toBe(false)
})

test('unrelated tool_use yields no verdict and scanning continues (deviation from run_eval.py first-tool-decides)', () => {
  const d = createDetector('demo-skill')
  expect(d.feed(start('Bash'))).toBe(false)
  expect(d.feed(stop)).toBe(false)
  d.feed(start('Skill'))
  d.feed(delta('{"command": "demo-skill"}'))
  expect(d.feed(stop)).toBe(true)
})

test('message_stop settles a pending block', () => {
  const d = createDetector('demo-skill')
  d.feed(start('Skill'))
  d.feed(delta('{"command": "demo-skill"}'))
  expect(d.feed(messageStop)).toBe(true)
})

test('fallback: complete assistant message with a matching tool_use fires', () => {
  const d = createDetector('demo-skill')
  const ev = {
    type: 'assistant',
    message: { content: [{ type: 'tool_use', name: 'Skill', input: { command: 'demo-skill' } }] },
  }
  expect(d.feed(ev)).toBe(true)
})

test('once fired, feed stays true', () => {
  const d = createDetector('demo-skill')
  d.feed(start('Skill'))
  d.feed(delta('"demo-skill"'))
  expect(d.feed(stop)).toBe(true)
  expect(d.feed({ type: 'result', result: 'x' })).toBe(true)
})
```

- [ ] **Step 2: Run to verify failure, then implement `src/lib/harness/detect.ts`**

Run: `bun test tests/harness/detect.test.ts` → FAIL (module not found). Implement:

```ts
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

export interface Detector {
  /** Feed one parsed stream-json event; returns true once the trigger verdict has fired. */
  feed(event: unknown): boolean
}

/**
 * Ported from skill-creator run_eval.py with two adjudicated deviations (spec §6):
 * verdicts fire at content_block_stop/message_stop (not mid-delta), and an
 * unrelated first tool_use does not end the scan.
 */
export function createDetector(skillName: string): Detector {
  const readNeedle = `.claude/skills/${skillName}/SKILL.md`
  let pending: 'Skill' | 'Read' | null = null
  let accumulated = ''
  let fired = false

  const matches = (tool: 'Skill' | 'Read', inputText: string): boolean =>
    tool === 'Skill' ? inputText.includes(skillName) : inputText.includes(readNeedle)

  const settle = (): boolean => {
    if (pending !== null && matches(pending, accumulated)) fired = true
    pending = null
    accumulated = ''
    return fired
  }

  return {
    feed(event: unknown): boolean {
      if (fired || !isRecord(event)) return fired
      if (event.type === 'stream_event' && isRecord(event.event)) {
        const se = event.event
        if (se.type === 'content_block_start' && isRecord(se.content_block) && se.content_block.type === 'tool_use') {
          const name = se.content_block.name
          pending = name === 'Skill' || name === 'Read' ? name : null
          accumulated = ''
        } else if (se.type === 'content_block_delta' && pending !== null && isRecord(se.delta) && se.delta.type === 'input_json_delta') {
          if (typeof se.delta.partial_json === 'string') accumulated += se.delta.partial_json
        } else if (se.type === 'content_block_stop' || se.type === 'message_stop') {
          return settle()
        }
        return fired
      }
      if (event.type === 'assistant' && isRecord(event.message) && Array.isArray(event.message.content)) {
        for (const b of event.message.content) {
          if (!isRecord(b) || b.type !== 'tool_use') continue
          const name = b.name
          if (name !== 'Skill' && name !== 'Read') continue
          if (matches(name, JSON.stringify(b.input ?? null))) {
            fired = true
            return true
          }
        }
      }
      return fired
    },
  }
}
```

Run: `bun test tests/harness/detect.test.ts` → PASS.

- [ ] **Step 3: Write the failing runner detect tests**

Append to `tests/harness/claude-runner.test.ts`:

```ts
const DETECT_LINES = [
  '{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"tu1","name":"Skill"}}}',
  '{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"command\\": \\"demo-skill\\"}"}}}',
  '{"type":"stream_event","event":{"type":"content_block_stop","index":0}}',
].join('\n')

test('detect mode adds --include-partial-messages to argv', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-detect-argv-'))
  const argsFile = join(dir, 'args.txt')
  const bin = stub(`printf '%s\\n' "$@" > "${argsFile}"\necho '{"type":"result","result":"done"}'`)
  await spawnClaudeRunner(bin).run({ prompt: 'x', cwd: dir, model: 'sonnet', timeoutMs: 10_000, detect: { skillName: 'demo-skill' } })
  const args = (await Bun.file(argsFile).text()).trim().split('\n')
  expect(args).toEqual(['-p', 'x', '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions', '--model', 'sonnet', '--include-partial-messages'])
})

test('detection fires: early process-group kill, status completed, triggered true', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-detect-kill-'))
  const marker = join(dir, 'orphan-survived.txt')
  const dataFile = join(dir, 'data.jsonl')
  writeFileSync(dataFile, `${DETECT_LINES}\n`)
  // Background child would write the marker after 2s; the group kill must reap it.
  const bin = stub(`(sleep 2; echo late > "${marker}") &\ncat "${dataFile}"\nsleep 30`)
  const started = performance.now()
  const res = await spawnClaudeRunner(bin).run({ prompt: 'x', cwd: dir, model: 'sonnet', timeoutMs: 20_000, detect: { skillName: 'demo-skill' } })
  expect(performance.now() - started).toBeLessThan(15_000)
  expect(res.status).toBe('completed')
  expect(res.triggered).toBe(true)
  await Bun.sleep(2_500)
  expect(existsSync(marker)).toBe(false)
}, 30_000)

test('clean completion without detection: triggered false', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-detect-clean-'))
  const bin = stub(`echo '{"type":"result","result":"done"}'`)
  const res = await spawnClaudeRunner(bin).run({ prompt: 'x', cwd: dir, model: 'sonnet', timeoutMs: 10_000, detect: { skillName: 'demo-skill' } })
  expect(res.status).toBe('completed')
  expect(res.triggered).toBe(false)
})

test('timeout in detect mode: status timeout, triggered absent', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-detect-timeout-'))
  const bin = stub('sleep 30')
  const res = await spawnClaudeRunner(bin).run({ prompt: 'x', cwd: dir, model: 'sonnet', timeoutMs: 300, detect: { skillName: 'demo-skill' } })
  expect(res.status).toBe('timeout')
  expect('triggered' in res).toBe(false)
}, 10_000)

test('non-detect requests carry no triggered field (frozen surface)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-detect-absent-'))
  const bin = stub(`echo '{"type":"result","result":"done"}'`)
  const res = await spawnClaudeRunner(bin).run({ prompt: 'x', cwd: dir, model: 'sonnet', timeoutMs: 10_000 })
  expect('triggered' in res).toBe(false)
})
```

Add `existsSync` to the `node:fs` import at the top of the file.

- [ ] **Step 4: Run to verify failure, then implement the runner changes**

Run: `bun test tests/harness/claude-runner.test.ts` → new tests FAIL.

In `src/lib/harness/claude-runner.ts`:

1. Extend the interfaces:

```ts
export interface RunnerRequest {
  prompt: string
  cwd: string
  model: string
  timeoutMs: number
  detect?: { skillName: string }
}

export interface RunnerResult {
  status: RunnerStatus
  finalText: string | null
  events: unknown[]
  usage: { inputTokens: number; outputTokens: number } | null
  durationSeconds: number
  errorMessage: string | null
  /** Present iff detect was requested AND status is 'completed'. */
  triggered?: boolean
}
```

2. Add `import { createDetector } from './detect'`.

3. Build argv as an array and append the flag in detect mode:

```ts
const argv = [claudeBin, '-p', req.prompt, '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions', '--model', req.model]
if (req.detect) argv.push('--include-partial-messages')
```

4. Replace the whole-stdout read with an incremental line reader (tolerant parsing preserved byte-for-byte; the detector feeds as lines arrive and kills the process group on verdict):

```ts
const detector = req.detect ? createDetector(req.detect.skillName) : null
let earlyKilled = false
const events: unknown[] = []
const killGroup = (): void => {
  try {
    process.kill(-proc.pid, 'SIGKILL')
  } catch {
    proc.kill()
  }
}
const handleLine = (line: string): void => {
  const t = line.trim()
  if (!t) return
  let event: unknown
  try {
    event = JSON.parse(t)
  } catch {
    // tolerant reader: non-JSON lines are skipped
    return
  }
  events.push(event)
  if (detector !== null && !earlyKilled && detector.feed(event)) {
    earlyKilled = true
    killGroup()
  }
}
const readStdout = async (): Promise<void> => {
  const reader = (proc.stdout as ReadableStream<Uint8Array>).getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let nl = buffer.indexOf('\n')
    while (nl !== -1) {
      handleLine(buffer.slice(0, nl))
      buffer = buffer.slice(nl + 1)
      nl = buffer.indexOf('\n')
    }
  }
  buffer += decoder.decode()
  if (buffer.trim()) handleLine(buffer)
}
```

The timeout timer now calls `killGroup()` (same body as before). Await `Promise.all([readStdout(), stderr text, proc.exited])` (stderr and exit handling unchanged). Result construction — `earlyKilled` is checked FIRST (the verdict already landed; our own SIGKILL must not read as a failure), then timeout, then exit code:

```ts
const durationSeconds = round2((performance.now() - started) / 1000)
const finalText = extractFinalText(events)
const usage = extractUsage(events)
if (earlyKilled) {
  return { status: 'completed', finalText, events, usage, durationSeconds, errorMessage: null, triggered: true }
}
if (timedOut) {
  return { status: 'timeout', finalText, events, usage, durationSeconds, errorMessage: `timed out after ${req.timeoutMs}ms` }
}
if (exitCode !== 0) {
  return { status: 'nonzero-exit', finalText, events, usage, durationSeconds, errorMessage: stderr.slice(-2000) || `exit code ${exitCode}` }
}
if (detector !== null) {
  return { status: 'completed', finalText, events, usage, durationSeconds, errorMessage: null, triggered: false }
}
return { status: 'completed', finalText, events, usage, durationSeconds, errorMessage: null }
```

5. Append to `tests/harness/helpers.ts`:

```ts
export const detected = (triggered: boolean, overrides: Partial<RunnerResult> = {}): RunnerResult => ({
  ...completed('(trigger probe complete)'),
  triggered,
  ...overrides,
})
```

- [ ] **Step 5: Run the full gates**

Run: `bun test tests/harness/claude-runner.test.ts && bun test && bun run typecheck`
Expected: green — existing runner tests prove the incremental reader preserved non-detect behavior.

- [ ] **Step 6: Commit**

```bash
git add src/lib/harness/detect.ts src/lib/harness/claude-runner.ts tests/harness/detect.test.ts tests/harness/claude-runner.test.ts tests/harness/helpers.ts
git commit -m "feat(harness): runner detect mode — streaming trigger detection with early kill"
```

---

### Task 5: Spec §9 hardening — safe skill_name, run-dir guard, grader-retry observability

**Files:**
- Modify: `src/lib/harness/deterministic.ts`
- Modify: `src/lib/harness/run-dir.ts`
- Modify: `src/lib/harness/grader.ts`
- Modify: `tests/harness/deterministic.test.ts`, `tests/harness/run-dir.test.ts`, `tests/harness/grade-case.test.ts`

**Interfaces:**
- Consumes: existing modules.
- Produces: deterministic error `skill_name must be a safe path segment` (gates both `test --run` and `bench`); `runDir` throws on unsafe names; `grading.json`/`timing.json` `timing` gains `grader_retries`/`grader_retry_causes` when the shared retry budget was consumed — consumed by Tasks 6, 9 (semantics), 11 (calibration reads).

- [ ] **Step 1: Write the failing tests**

Append to `tests/harness/deterministic.test.ts` (follow the file's existing fixture/helper pattern for building a skill with an `evals/evals.json` entry — reuse its existing valid-document helper):

```ts
test('unsafe skill_name path segments are rejected', () => {
  for (const bad of ['../evil', 'a/b', 'a\\b', '.', '..', '-dash-start']) {
    const findings = runDeterministic(skillWithEvals({ ...validEvalsDoc(), skill_name: bad }))
    expect(findings.some(f => f.message === 'skill_name must be a safe path segment' && f.severity === 'error')).toBe(true)
  }
})

test('dots, dashes, underscores inside a safe segment pass', () => {
  const findings = runDeterministic(skillWithEvals({ ...validEvalsDoc(), skill_name: 'my.skill_v2-beta' }))
  expect(findings.some(f => f.message === 'skill_name must be a safe path segment')).toBe(false)
})
```

(`skillWithEvals`/`validEvalsDoc` stand for the file's existing helpers — reuse whatever it already uses to build a deterministic-testable skill; the frontmatter `name` must equal the doc's `skill_name` in the safe-segment case to avoid the mismatch finding, and the unsafe cases may additionally produce the mismatch finding, which is why the assertion uses `some`.)

Append to `tests/harness/run-dir.test.ts`:

```ts
test('runDir throws on separator-bearing or dot-only skill names (defense in depth)', () => {
  for (const bad of ['a/b', 'a\\b', '.', '..', '../x']) {
    expect(() => runDir('/tmp/root', bad, 'k'.repeat(16))).toThrow('internal: unsafe skill name for run dir')
  }
  expect(() => runDir('/tmp/root', 'my.skill_v2-beta', 'k'.repeat(16))).not.toThrow()
})
```

Append to `tests/harness/grade-case.test.ts`:

```ts
test('grader retry observability: gate retry stamps grader_retries and grader_retry_causes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-grade-obs-'))
  const good = gradingReply([
    { text: 'first expectation', passed: true },
    { text: 'second expectation', passed: true },
  ])
  const runner = fakeRunner([completed('garbage'), completed(good)])
  const res = await gradeCase(args(runner, dir))
  if (!('grading' in res)) throw new Error('expected success')
  expect(res.grading.timing?.grader_retries).toBe(1)
  expect(res.grading.timing?.grader_retry_causes).toEqual(['gate: invalid grading (reply is not valid JSON)'])
  expect(JSON.parse(readFileSync(join(dir, 'timing.json'), 'utf8')).grader_retries).toBe(1)
})

test('grader retry observability: runner-failure retry records a runner cause', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-grade-obs-runner-'))
  const good = gradingReply([
    { text: 'first expectation', passed: true },
    { text: 'second expectation', passed: true },
  ])
  const runner = fakeRunner([failed('timeout', 'slow'), completed(good)])
  const res = await gradeCase(args(runner, dir))
  if (!('grading' in res)) throw new Error('expected success')
  expect(res.grading.timing?.grader_retry_causes).toEqual(['runner: grader timeout — slow'])
})

test('grader retry observability: absent on first-try success', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-grade-obs-clean-'))
  const good = gradingReply([
    { text: 'first expectation', passed: true },
    { text: 'second expectation', passed: true },
  ])
  const res = await gradeCase(args(fakeRunner([completed(good)]), dir))
  if (!('grading' in res)) throw new Error('expected success')
  expect(res.grading.timing !== undefined && 'grader_retries' in res.grading.timing).toBe(false)
  expect(res.grading.timing !== undefined && 'grader_retry_causes' in res.grading.timing).toBe(false)
})
```

(Adapt the `args(...)` call and expectation texts to the file's existing local helper — the two expectation strings above match its current fixtures.)

- [ ] **Step 2: Run to verify failures**

Run: `bun test tests/harness/deterministic.test.ts tests/harness/run-dir.test.ts tests/harness/grade-case.test.ts`
Expected: the new tests FAIL; existing ones pass.

- [ ] **Step 3: Implement**

`src/lib/harness/deterministic.ts` — inside the `isRecord(doc)` block, immediately after the frontmatter-mismatch check:

```ts
if (typeof doc.skill_name === 'string' && doc.skill_name.length > 0 && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(doc.skill_name)) {
  out.push(err('skill_name must be a safe path segment'))
}
```

`src/lib/harness/run-dir.ts`:

```ts
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

export function runDir(root: string, skillName: string, key: string): string {
  // Defense in depth: the deterministic stage already rejects unsafe names
  // before any run dir is composed; this guard is never expected to fire.
  if (!SAFE_SEGMENT.test(skillName)) throw new Error(`internal: unsafe skill name for run dir ("${skillName}")`)
  return join(root, 'runs', skillName, key)
}
```

`src/lib/harness/grader.ts` — in `gradeCase`, capture the retry cause and stamp timing:

```ts
let attempt = await call(original)
let retryCause: string | null = null
if (attempt.kind !== 'ok') {
  retryCause =
    attempt.kind === 'gate' ? `gate: invalid grading (${attempt.problems[0]})` : `runner: ${attempt.failure}`
  const retryPrompt =
    attempt.kind === 'gate' ? buildGraderRetryPrompt(original, attempt.problems, attempt.reply) : original
  attempt = await call(retryPrompt)
}
```

and build `timing` as an extensible record:

```ts
const timing: Record<string, unknown> = {
  executor_duration_seconds: args.executorDurationSeconds,
  grader_duration_seconds: graderDuration,
  total_duration_seconds: round2(args.executorDurationSeconds + graderDuration),
}
if (retryCause !== null) {
  timing.grader_retries = 1
  timing.grader_retry_causes = [retryCause]
}
```

(`timing.json` and the merged grading document share this object; existing cached documents without the fields stay valid — `validateGradingJson` only requires `timing` to be an object.)

- [ ] **Step 4: Sanctioned re-pin**

`tests/harness/grade-case.test.ts` "grader duration sums across retry calls" pins `res.grading.timing` exactly; that scenario retries (bad reply, then good), so the pin gains:

```ts
    grader_retries: 1,
    grader_retry_causes: ['gate: invalid grading (reply is not valid JSON)'],
```

Also verify no cached-replay test pins a timing object from a retry run (`grep -rn "grader_retries" tests/` after the change should list only the tests written in this task plus this re-pin).

- [ ] **Step 5: Full gates and commit**

Run: `bun test && bun run typecheck`
Expected: green.

```bash
git add src/lib/harness/deterministic.ts src/lib/harness/run-dir.ts src/lib/harness/grader.ts tests/harness/
git commit -m "feat(harness): spec §9 hardening — safe skill_name gate, run-dir guard, grader-retry observability"
```

---

### Task 6: Trigger stage — triggerKey, stage report types, pipeline, scoring

**Files:**
- Modify: `src/lib/harness/run-dir.ts` (add `triggerKey`)
- Modify: `src/lib/harness/types.ts` (`TriggerRunMeta`, trigger StageReport variants)
- Create: `src/lib/harness/trigger-stage.ts`
- Create: `tests/harness/trigger-stage.test.ts`

**Interfaces:**
- Consumes: `runDir`, `skillContentHash`, `HARNESS_SCHEMA_VERSION` (run-dir), `validateTriggersJson`/`TriggersJson`/`EvalsJson` (Task 1), `ClaudeRunner` + detect mode (Task 4), `renderTranscript` (stream-json), `fakeRunner`/`detected`/`failed` helpers.
- Produces: `TRIGGER_REPS = 3`, `TRIGGER_PASS_THRESHOLD = 0.5`, `TRIGGER_ACCURACY_THRESHOLD = 0.8`, `triggerKey({skillHash, query, rep, model})`, `TriggerRunMeta`, `runTriggerStage(skill, {runner, cacheRoot, model, fresh}): Promise<TriggerStageReport>` — consumed by Task 7.

- [ ] **Step 1: Extend the types**

`src/lib/harness/types.ts`:

```ts
export interface TriggerRunMeta {
  queryIndex: number
  shouldTrigger: boolean
  triggered: number
  reps: number
  cached: number
  status: 'ok' | 'timeout' | 'nonzero-exit'
}
```

Extend the `StageReport` union — add the executed trigger variant and widen the skipped variant:

```ts
export type StageReport =
  | { stage: 'deterministic'; status: 'pass' | 'fail'; findings: HarnessFinding[] }
  | { stage: 'scenario'; status: 'pass' | 'fail'; findings: HarnessFinding[]; runs: ScenarioRunMeta[] }
  | { stage: 'grading'; status: 'pass' | 'fail'; findings: HarnessFinding[]; expectations: { passed: number; total: number } }
  | { stage: 'trigger'; status: 'pass' | 'fail'; findings: HarnessFinding[]; queries: { passed: number; total: number }; runs: TriggerRunMeta[] }
  | { stage: 'scenario' | 'grading' | 'trigger'; status: 'skipped'; note: string }
```

`src/lib/harness/run-dir.ts` — add:

```ts
const sha256hex = (s: string): string => createHash('sha256').update(s).digest('hex')

export function triggerKey(input: { skillHash: string; query: string; rep: number; model: string }): string {
  return createHash('sha256')
    .update(`${HARNESS_SCHEMA_VERSION}\n${input.skillHash}\ntrigger\n${sha256hex(input.query)}\n${input.rep}\n${input.model}`)
    .digest('hex')
    .slice(0, 16)
}
```

Run: `bun run typecheck` — expected green (additive union member; the test-json/test-pretty formatters compile because their existing branches narrow by stage name; if the pretty formatter's `else` branch now needs the trigger findings shape it already handles `findings` generically).

- [ ] **Step 2: Write the failing stage tests**

`tests/harness/trigger-stage.test.ts`. Build skills on disk (the stage reads `SKILL.md` bytes for `skillContentHash` and copies files into the mount), using a local helper:

```ts
import { expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runTriggerStage, TRIGGER_ACCURACY_THRESHOLD, TRIGGER_PASS_THRESHOLD, TRIGGER_REPS } from '../../src/lib/harness/trigger-stage'
import { parseSkill } from '../../src/lib/parser'
import { detected, failed, fakeRunner } from './helpers'

const EVALS_DOC = {
  skill_name: 'demo-skill',
  evals: [
    { id: 1, prompt: 'Case one.', expected_output: 'Out.', expectations: ['ok'] },
    { id: 2, prompt: 'Case two.', expected_output: 'Out.', expectations: ['ok'] },
    { id: 3, prompt: 'Case three.', expected_output: 'Out.', expectations: ['ok'] },
  ],
}

function makeSkill(triggersDoc: unknown | null): { skill: ReturnType<typeof parseSkill>; cacheRoot: string } {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-trigger-skill-'))
  writeFileSync(join(dir, 'SKILL.md'), '---\nname: demo-skill\ndescription: Use when testing trigger stage plumbing.\nversion: 1.0.0\n---\n\n# Demo\n')
  mkdirSync(join(dir, 'evals'), { recursive: true })
  writeFileSync(join(dir, 'evals/evals.json'), JSON.stringify(EVALS_DOC))
  if (triggersDoc !== null) {
    writeFileSync(join(dir, 'evals/triggers.json'), typeof triggersDoc === 'string' ? triggersDoc : JSON.stringify(triggersDoc))
  }
  return { skill: parseSkill(dir), cacheRoot: mkdtempSync(join(tmpdir(), 'shakespii-trigger-cache-')) }
}

const queries = (specs: Array<{ t: boolean }>) => ({
  skill_name: 'demo-skill',
  queries: specs.map((s, i) => ({ query: `Query ${i}.`, should_trigger: s.t })),
})

const opts = (runner: ReturnType<typeof fakeRunner>, cacheRoot: string, fresh = false) =>
  ({ runner, cacheRoot, model: 'sonnet', fresh })

test('constants are pinned', () => {
  expect(TRIGGER_REPS).toBe(3)
  expect(TRIGGER_PASS_THRESHOLD).toBe(0.5)
  expect(TRIGGER_ACCURACY_THRESHOLD).toBe(0.8)
})

test('input gate: missing triggers.json', async () => {
  const { skill, cacheRoot } = makeSkill(null)
  const runner = fakeRunner([])
  const rep = await runTriggerStage(skill, opts(runner, cacheRoot))
  expect(rep).toEqual({
    stage: 'trigger',
    status: 'fail',
    findings: [{ severity: 'error', message: 'evals/triggers.json missing — required by --triggers', file: 'evals/triggers.json', line: null }],
    queries: { passed: 0, total: 0 },
    runs: [],
  })
  expect(runner.requests).toHaveLength(0)
})

test('input gate: unparsable JSON and validator diagnostics', async () => {
  const bad = makeSkill('{nope')
  const badRep = await runTriggerStage(bad.skill, opts(fakeRunner([]), bad.cacheRoot))
  expect(badRep.findings[0].message).toBe('evals/triggers.json is not valid JSON')

  const invalid = makeSkill({ skill_name: 'demo-skill', queries: [{ query: '', should_trigger: 1 }] })
  const invRep = await runTriggerStage(invalid.skill, opts(fakeRunner([]), invalid.cacheRoot))
  expect(invRep.findings.map(f => f.message)).toEqual([
    'evals/triggers.json: queries[0].query — must be a non-empty string',
    'evals/triggers.json: queries[0].should_trigger — must be a boolean',
  ])
})

test('input gate: skill_name mismatch vs evals.json', async () => {
  const { skill, cacheRoot } = makeSkill({ ...queries([{ t: true }]), skill_name: 'someone-else' })
  const rep = await runTriggerStage(skill, opts(fakeRunner([]), cacheRoot))
  expect(rep.findings).toEqual([
    { severity: 'error', message: 'evals/triggers.json: skill_name — must match evals.json skill_name', file: 'evals/triggers.json', line: null },
  ])
})

test('majority scoring: 2/3 passes a positive, 1/3 fails it; inverse for negatives', async () => {
  const { skill, cacheRoot } = makeSkill(queries([{ t: true }, { t: false }]))
  // positive query: 2 fired of 3; negative query: 1 fired of 3 (rate 1/3 < 0.5 → negative passes)
  const runner = fakeRunner([detected(true), detected(true), detected(false), detected(true), detected(false), detected(false)])
  const rep = await runTriggerStage(skill, opts(runner, cacheRoot))
  // Both queries pass (2/3 ≥ 0.5 for the positive; 1/3 < 0.5 for the negative) → no findings → stage passes:
  expect(rep.findings).toEqual([])
  expect(rep.status).toBe('pass')
  expect(rep.queries).toEqual({ passed: 2, total: 2 })
  expect(rep.runs).toEqual([
    { queryIndex: 0, shouldTrigger: true, triggered: 2, reps: 3, cached: 0, status: 'ok' },
    { queryIndex: 1, shouldTrigger: false, triggered: 1, reps: 3, cached: 0, status: 'ok' },
  ])
  // prompts are the queries verbatim, detect carries the skill name
  expect(runner.requests[0].prompt).toBe('Query 0.')
  expect(runner.requests[0].detect).toEqual({ skillName: 'demo-skill' })
})

test('accuracy threshold: exactly 15/20 fails, 16/20 passes', async () => {
  // 20 positive queries; 15 fire 3/3, 5 fire 0/3.
  const make = async (passing: number) => {
    const { skill, cacheRoot } = makeSkill(queries(Array.from({ length: 20 }, () => ({ t: true }))))
    const script = Array.from({ length: 20 }, (_, qi) => Array.from({ length: 3 }, () => detected(qi < passing))).flat()
    return runTriggerStage(skill, opts(fakeRunner(script), cacheRoot))
  }
  const fifteen = await make(15)
  expect(fifteen.status).toBe('fail')
  expect(fifteen.findings).toEqual([
    { severity: 'error', message: 'trigger accuracy 0.75 below threshold 0.8 (15/20 queries)', file: 'evals/triggers.json', line: null },
  ])
  const sixteen = await make(16)
  expect(sixteen.status).toBe('pass')
  expect(sixteen.findings).toEqual([])
})

test('cache: second run replays with zero runner calls and an identical report', async () => {
  const { skill, cacheRoot } = makeSkill(queries([{ t: true }]))
  const first = await runTriggerStage(skill, opts(fakeRunner([detected(true), detected(true), detected(true)]), cacheRoot))
  expect(first.runs[0].cached).toBe(0)
  const replayRunner = fakeRunner([])
  const second = await runTriggerStage(skill, opts(replayRunner, cacheRoot))
  expect(replayRunner.requests).toHaveLength(0)
  expect(second.runs[0]).toEqual({ queryIndex: 0, shouldTrigger: true, triggered: 3, reps: 3, cached: 3, status: 'ok' })
  expect(second.queries).toEqual(first.queries)
})

test('fidelity mismatch self-heals: edited query text re-runs', async () => {
  const a = makeSkill(queries([{ t: true }]))
  await runTriggerStage(a.skill, opts(fakeRunner([detected(true), detected(true), detected(true)]), a.cacheRoot))
  // Same skill bytes, same cacheRoot, but a triggers.json whose query text changed
  // would change skillHash too (the file is in the inventory) — so simulate fidelity
  // corruption instead: tamper the cached trigger.json's stored query text.
  // Locate the rep-1 trigger.json under the cache and corrupt it:
  const skillName = 'demo-skill'
  const runsRoot = join(a.cacheRoot, 'runs', skillName)
  const repDirs = (await Array.fromAsync(new Bun.Glob('*/trigger.json').scan({ cwd: runsRoot, absolute: true })))
  expect(repDirs.length).toBe(3)
  const target = repDirs[0]
  const doc = JSON.parse(readFileSync(target, 'utf8'))
  writeFileSync(target, JSON.stringify({ ...doc, query: 'Tampered.' }))
  const healRunner = fakeRunner([detected(true)])
  const rep = await runTriggerStage(a.skill, opts(healRunner, a.cacheRoot))
  expect(healRunner.requests).toHaveLength(1) // exactly the corrupted rep re-ran
  expect(rep.runs[0]).toEqual({ queryIndex: 0, shouldTrigger: true, triggered: 3, reps: 3, cached: 2, status: 'ok' })
})

test('--fresh bypasses the cache', async () => {
  const { skill, cacheRoot } = makeSkill(queries([{ t: true }]))
  await runTriggerStage(skill, opts(fakeRunner([detected(true), detected(true), detected(true)]), cacheRoot))
  const freshRunner = fakeRunner([detected(true), detected(true), detected(true)])
  const rep = await runTriggerStage(skill, opts(freshRunner, cacheRoot, true))
  expect(freshRunner.requests).toHaveLength(3)
  expect(rep.runs[0].cached).toBe(0)
})

test('failed rep: one retry, then error finding, remaining reps skipped, next query continues, failed query excluded from totals', async () => {
  const { skill, cacheRoot } = makeSkill(queries([{ t: true }, { t: true }]))
  const runner = fakeRunner([
    detected(true), // q0 rep1 ok
    failed('timeout', 'hung'), // q0 rep2 attempt 1
    failed('timeout', 'hung again'), // q0 rep2 retry — rep fails, q0 abandoned
    detected(true), detected(true), detected(true), // q1 fully measured
  ])
  const rep = await runTriggerStage(skill, opts(runner, cacheRoot))
  expect(runner.requests).toHaveLength(6)
  expect(rep.status).toBe('fail')
  expect(rep.findings).toEqual([
    { severity: 'error', message: 'trigger run failed (query 0, rep 2): timeout — hung again', file: 'evals/triggers.json', line: null },
  ])
  expect(rep.queries).toEqual({ passed: 1, total: 1 }) // q0 excluded
  expect(rep.runs).toEqual([
    { queryIndex: 0, shouldTrigger: true, triggered: 1, reps: 2, cached: 0, status: 'timeout' },
    { queryIndex: 1, shouldTrigger: true, triggered: 3, reps: 3, cached: 0, status: 'ok' },
  ])
})

test('artifacts: trigger.json key order pinned; failed reps cache nothing', async () => {
  const { skill, cacheRoot } = makeSkill(queries([{ t: true }]))
  await runTriggerStage(skill, opts(fakeRunner([detected(true), detected(false), detected(true)]), cacheRoot))
  const runsRoot = join(cacheRoot, 'runs', 'demo-skill')
  const files = await Array.fromAsync(new Bun.Glob('*/trigger.json').scan({ cwd: runsRoot, absolute: true }))
  expect(files.length).toBe(3)
  const doc = JSON.parse(readFileSync(files[0], 'utf8'))
  expect(Object.keys(doc)).toEqual(['query', 'shouldTrigger', 'rep', 'triggered', 'status', 'durationSeconds'])
  expect(doc.status).toBe('ok')
})
```

- [ ] **Step 3: Run to verify failure, then implement `src/lib/harness/trigger-stage.ts`**

```ts
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { EvalsJson, TriggersJson } from '../evals/types'
import { isRecord, validateTriggersJson } from '../evals/validate'
import type { ParsedSkill } from '../types'
import type { ClaudeRunner } from './claude-runner'
import { RUN_TIMEOUT_MS } from './claude-runner'
import { runDir, skillContentHash, triggerKey } from './run-dir'
import { renderTranscript } from './stream-json'
import type { HarnessFinding, StageReport, TriggerRunMeta } from './types'

export const TRIGGER_REPS = 3
export const TRIGGER_PASS_THRESHOLD = 0.5
export const TRIGGER_ACCURACY_THRESHOLD = 0.8

const TRIGGERS = 'evals/triggers.json'

const err = (message: string): HarnessFinding => ({ severity: 'error', message, file: TRIGGERS, line: null })

export type TriggerStageReport = Extract<StageReport, { stage: 'trigger'; status: 'pass' | 'fail' }>

export interface TriggerStageOptions {
  runner: ClaudeRunner
  cacheRoot: string
  model: string
  fresh: boolean
}

/** Wipes and recreates the rep dir, mounts the skill (no eval files, no preamble), returns outputs/. */
export function stageTriggerRunDir(skill: ParsedSkill, skillName: string, dir: string): string {
  rmSync(dir, { recursive: true, force: true })
  const outputs = join(dir, 'outputs')
  const mount = join(outputs, '.claude', 'skills', skillName)
  mkdirSync(mount, { recursive: true })
  cpSync(join(skill.dir, 'SKILL.md'), join(mount, 'SKILL.md'))
  for (const f of skill.files) {
    const dest = join(mount, f.relPath)
    mkdirSync(dirname(dest), { recursive: true })
    cpSync(join(skill.dir, f.relPath), dest)
  }
  return outputs
}

/** Cache gate: trigger.json exists, parses, and query/shouldTrigger match verbatim. Anything else is a self-healing miss. */
export function readValidCachedTrigger(dir: string, query: string, shouldTrigger: boolean): { triggered: boolean } | null {
  const p = join(dir, 'trigger.json')
  if (!existsSync(p)) return null
  let doc: unknown
  try {
    doc = JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return null
  }
  if (!isRecord(doc)) return null
  if (doc.query !== query || doc.shouldTrigger !== shouldTrigger) return null
  if (typeof doc.triggered !== 'boolean') return null
  return { triggered: doc.triggered }
}

/** Precondition: the deterministic stage ran on this skill with zero errors. */
export async function runTriggerStage(skill: ParsedSkill, options: TriggerStageOptions): Promise<TriggerStageReport> {
  const fail = (findings: HarnessFinding[]): TriggerStageReport =>
    ({ stage: 'trigger', status: 'fail', findings, queries: { passed: 0, total: 0 }, runs: [] })

  const entry = skill.files.find(f => f.relPath === TRIGGERS)
  if (!entry) return fail([err('evals/triggers.json missing — required by --triggers')])
  if (entry.text === null) return fail([err('evals/triggers.json is not valid JSON')])
  let doc: unknown
  try {
    doc = JSON.parse(entry.text)
  } catch {
    return fail([err('evals/triggers.json is not valid JSON')])
  }
  const diagnostics = validateTriggersJson(doc)
  if (diagnostics.length > 0) return fail(diagnostics.map(d => err(`evals/triggers.json: ${d.path} — ${d.message}`)))
  const triggers = doc as TriggersJson

  const evalsEntry = skill.files.find(f => f.relPath === 'evals/evals.json')
  if (!evalsEntry || evalsEntry.text === null) throw new Error('internal: runTriggerStage requires a deterministic-clean eval suite')
  const evalsDoc = JSON.parse(evalsEntry.text) as EvalsJson
  if (triggers.skill_name !== evalsDoc.skill_name) {
    return fail([err('evals/triggers.json: skill_name — must match evals.json skill_name')])
  }

  const skillName = evalsDoc.skill_name
  const skillHash = skillContentHash(skill)
  const findings: HarnessFinding[] = []
  const runs: TriggerRunMeta[] = []
  let passed = 0
  let measured = 0

  for (let qi = 0; qi < triggers.queries.length; qi++) {
    const { query, should_trigger } = triggers.queries[qi]
    let fired = 0
    let cached = 0
    let reps = 0
    let failStatus: 'timeout' | 'nonzero-exit' | null = null

    for (let rep = 1; rep <= TRIGGER_REPS; rep++) {
      const key = triggerKey({ skillHash, query, rep, model: options.model })
      const dir = runDir(options.cacheRoot, skillName, key)

      if (!options.fresh) {
        const hit = readValidCachedTrigger(dir, query, should_trigger)
        if (hit !== null) {
          reps += 1
          cached += 1
          if (hit.triggered) fired += 1
          continue
        }
      }

      const attemptOnce = async () => {
        const outputs = stageTriggerRunDir(skill, skillName, dir)
        const result = await options.runner.run({
          prompt: query,
          cwd: outputs,
          model: options.model,
          timeoutMs: RUN_TIMEOUT_MS,
          detect: { skillName },
        })
        writeFileSync(join(dir, 'events.jsonl'), result.events.map(e => JSON.stringify(e)).join('\n') + (result.events.length > 0 ? '\n' : ''))
        writeFileSync(join(dir, 'transcript.md'), renderTranscript({ skillName, evalId: qi, prompt: query, events: result.events }))
        return result
      }

      let result = await attemptOnce()
      if (result.status !== 'completed') result = await attemptOnce() // single retry, identical request
      reps += 1
      if (result.status !== 'completed') {
        failStatus = result.status
        findings.push(err(`trigger run failed (query ${qi}, rep ${rep}): ${result.status} — ${result.errorMessage ?? 'no detail'}`))
        break
      }
      const triggered = result.triggered === true
      if (triggered) fired += 1
      writeFileSync(
        join(dir, 'trigger.json'),
        `${JSON.stringify({ query, shouldTrigger: should_trigger, rep, triggered, status: 'ok', durationSeconds: result.durationSeconds }, null, 2)}\n`,
      )
    }

    if (failStatus !== null) {
      runs.push({ queryIndex: qi, shouldTrigger: should_trigger, triggered: fired, reps, cached, status: failStatus })
      continue
    }
    measured += 1
    const rate = fired / TRIGGER_REPS
    const pass = should_trigger ? rate >= TRIGGER_PASS_THRESHOLD : rate < TRIGGER_PASS_THRESHOLD
    if (pass) passed += 1
    runs.push({ queryIndex: qi, shouldTrigger: should_trigger, triggered: fired, reps, cached, status: 'ok' })
  }

  if (measured > 0) {
    const accuracy = passed / measured
    if (accuracy < TRIGGER_ACCURACY_THRESHOLD) {
      findings.push(err(`trigger accuracy ${accuracy.toFixed(2)} below threshold 0.8 (${passed}/${measured} queries)`))
    }
  }
  return { stage: 'trigger', status: findings.length > 0 ? 'fail' : 'pass', findings, queries: { passed, total: measured }, runs }
}
```

- [ ] **Step 4: Run the gates and commit**

Run: `bun test tests/harness/trigger-stage.test.ts && bun test && bun run typecheck`
Expected: green.

```bash
git add src/lib/harness/run-dir.ts src/lib/harness/types.ts src/lib/harness/trigger-stage.ts tests/harness/trigger-stage.test.ts tests/harness/run-dir.test.ts
git commit -m "feat(harness): trigger stage — reps, cache, majority scoring, accuracy threshold"
```

---

### Task 7: `test --triggers` CLI wiring — flag, guard, formatters, re-pins

**Files:**
- Modify: `src/cli/test.ts` (flag + guard + usage)
- Modify: `src/lib/harness/index.ts` (`TestOptions.triggers`, stage wiring)
- Modify: `src/cli/format/test-json.ts` (trigger branch)
- Modify: `src/cli/format/test-pretty.ts` (trigger stage line, summary tail, skip variant)
- Modify: `src/cli/index.ts` (test usage line)
- Modify: `tests/cli/test-command.test.ts` (guard + usage re-pin), `tests/cli/format-test.test.ts` (formatter cases), `tests/harness/test-skill.test.ts` (integration)

**Interfaces:**
- Consumes: `runTriggerStage` and constants (Task 6).
- Produces: `testSkill(skill, { run, fresh, model, triggers, runner, cacheRoot })`; test-JSON trigger stage object (additive, only when the flag is passed); pretty trigger line + tail — consumed by Task 11 sweeps and Task 13 docs.

- [ ] **Step 1: Write the failing tests**

Append to `tests/cli/test-command.test.ts`:

```ts
test('--triggers requires --run: exit 2, guard message with usage', () => {
  const r = run(['test', join(FIXTURES, 'two-cases'), '--triggers'])
  expect(r.exitCode).toBe(2)
  expect(r.stderr.toString()).toContain('--triggers requires --run')
  expect(r.stderr.toString()).toContain('usage: shakespii test <path> [--json] [--run] [--fresh] [--model <name>] [--triggers]')
})
```

Sanctioned re-pin in the same file: the existing usage-string assertion (`test-command.test.ts:76` area) swaps to the new usage string ending in `[--triggers]`. Run `grep -rn "usage: shakespii test" tests/ src/` and swap every occurrence of the old string — nothing else.

Append to `tests/harness/test-skill.test.ts` (reuse its existing FakeRunner + fixture pattern; the scripted results below assume a 1-query triggers.json beside a deterministic-clean 3-eval suite — build with the same on-disk helper style as `tests/harness/trigger-stage.test.ts`):

```ts
test('testSkill with triggers: four stages, trigger findings roll into summary and exit-driving errors', async () => {
  // skill fixture: deterministic-clean evals + 1-query triggers.json (should_trigger: true)
  // runner script: scenario+grading for 3 evals (reuse the file's existing script helper), then 3 detect reps that never fire
  const result = await testSkill(skill, { run: true, triggers: true, runner, cacheRoot })
  expect(result.stages.map(s => s.stage)).toEqual(['deterministic', 'scenario', 'grading', 'trigger'])
  const trigger = result.stages[3]
  if (trigger.stage !== 'trigger' || trigger.status === 'skipped') throw new Error('expected executed trigger stage')
  expect(trigger.findings[0].message).toBe('trigger accuracy 0.00 below threshold 0.8 (0/1 queries)')
  expect(result.summary.errors).toBeGreaterThan(0)
})

test('testSkill without triggers: three stages exactly (frozen surface)', async () => {
  const result = await testSkill(skill, { run: true, runner, cacheRoot })
  expect(result.stages).toHaveLength(3)
})

test('testSkill with triggers but failing deterministic: trigger skipped', async () => {
  const result = await testSkill(badSkill, { run: true, triggers: true, runner: fakeRunner([]), cacheRoot })
  expect(result.stages[3]).toEqual({ stage: 'trigger', status: 'skipped', note: 'deterministic stage failed' })
})
```

Append to `tests/cli/format-test.test.ts` (construct `TestResult` values directly, following the file's existing style):

```ts
test('trigger stage JSON key order and runs entry key order', () => {
  const rep = jsonTestReport(resultWithTrigger) // executed trigger stage fixture
  const stage = rep.stages[3] as Record<string, unknown>
  expect(Object.keys(stage)).toEqual(['stage', 'status', 'findings', 'queries', 'runs'])
  expect(Object.keys((stage.runs as unknown[])[0] as Record<string, unknown>)).toEqual([
    'queryIndex', 'shouldTrigger', 'triggered', 'reps', 'cached', 'status',
  ])
  expect(Object.keys(stage.queries as Record<string, unknown>)).toEqual(['passed', 'total'])
})

test('pretty trigger tail: pluralization and cached count', () => {
  const out = formatTestPretty(resultWithTrigger) // 18/20 queries, 12 cached reps
  expect(out).toContain(' · trigger: 18/20 queries accurate (12 cached)')
  const single = formatTestPretty(resultWithOneQueryTrigger) // 1/1 query
  expect(single).toContain(' · trigger: 1/1 query accurate (0 cached)')
})

test('pretty skip variant extends to trigger when the stage is present', () => {
  const out = formatTestPretty(resultDeterministicFailedWithTrigger)
  expect(out).toContain('scenario/grading/trigger skipped (deterministic stage failed)')
})

test('pretty output without a trigger stage is byte-identical to the M4b-1 formatter (frozen surface)', () => {
  // reuse an existing three-stage fixture from this file and assert its full pinned output string is unchanged
})
```

(Fixture values: build `resultWithTrigger` etc. as literal `TestResult` objects — `queries: { passed: 18, total: 20 }`, `runs` with `cached` values summing to 12.)

- [ ] **Step 2: Run to verify failures, then implement**

`src/cli/test.ts`:
- `const USAGE = 'usage: shakespii test <path> [--json] [--run] [--fresh] [--model <name>] [--triggers]'`
- parse `--triggers` → `triggers = true` (flag, no value)
- guard, placed after the `--model requires --run` guard:

```ts
if (triggers && !run) {
  console.error(`--triggers requires --run\n${USAGE}`)
  return 2
}
```

- pass through: `testSkill(skill, { run, fresh, model, triggers, runner: deps.runner, cacheRoot: deps.cacheRoot })`

`src/lib/harness/index.ts`:

```ts
export interface TestOptions {
  run?: boolean
  fresh?: boolean
  model?: string
  triggers?: boolean
  runner?: ClaudeRunner
  cacheRoot?: string
}
```

and in `testSkill`, hoist the stage options and wire the fourth stage:

```ts
let trigger: StageReport | null = null
if (!options.run) {
  scenario = { stage: 'scenario', status: 'skipped', note: SKIP_NO_RUN }
  grading = { stage: 'grading', status: 'skipped', note: SKIP_NO_RUN }
} else if (det.errors > 0) {
  scenario = { stage: 'scenario', status: 'skipped', note: SKIP_DET_FAILED }
  grading = { stage: 'grading', status: 'skipped', note: SKIP_DET_FAILED }
  if (options.triggers) trigger = { stage: 'trigger', status: 'skipped', note: SKIP_DET_FAILED }
} else {
  const stageOptions = {
    runner: options.runner ?? spawnClaudeRunner(),
    cacheRoot: options.cacheRoot ?? cacheRoot(),
    model: options.model ?? DEFAULT_MODEL,
    fresh: options.fresh ?? false,
  }
  const res = await runLlmStages(skill, stageOptions)
  scenario = res.scenario
  grading = res.grading
  if (options.triggers) trigger = await runTriggerStage(skill, stageOptions)
}

const stages: StageReport[] = trigger === null ? [deterministic, scenario, grading] : [deterministic, scenario, grading, trigger]
const allFindings = stages.flatMap(s => ('findings' in s ? s.findings : []))
```

(add `import { runTriggerStage } from './trigger-stage'`; return `stages` in the result).

`src/cli/format/test-json.ts` — add the trigger branch between the grading branch and the final return:

```ts
if (s.stage === 'trigger') {
  return {
    stage: s.stage,
    status: s.status,
    findings,
    queries: { passed: s.queries.passed, total: s.queries.total },
    runs: s.runs.map(r => ({
      queryIndex: r.queryIndex,
      shouldTrigger: r.shouldTrigger,
      triggered: r.triggered,
      reps: r.reps,
      cached: r.cached,
      status: r.status,
    })),
  }
}
```

`src/cli/format/test-pretty.ts`:
- the stage-rendering loop needs no change (the generic executed/skipped branches already render a `trigger` line via `padEnd(13)`)
- `summaryTail` gains an optional trigger parameter:

```ts
function summaryTail(scenario: StageReport, grading: StageReport, trigger?: StageReport): string {
  if (scenario.status === 'skipped') {
    const stagesWord = trigger === undefined ? 'scenario/grading' : 'scenario/grading/trigger'
    return scenario.note === 'deterministic stage failed'
      ? `${stagesWord} skipped (deterministic stage failed)`
      : `${stagesWord} skipped (pass --run)`
  }
  // ... existing executed-tail construction unchanged, then:
  let tail = `scenario: ${ok}/${runs.length} ${runWord} ok (${cached} cached) · grading: ${exp.passed}/${exp.total} ${expWord} passed`
  if (trigger !== undefined && trigger.stage === 'trigger' && trigger.status !== 'skipped') {
    const cachedReps = trigger.runs.reduce((acc, r) => acc + r.cached, 0)
    const queryWord = trigger.queries.total === 1 ? 'query' : 'queries'
    tail += ` · trigger: ${trigger.queries.passed}/${trigger.queries.total} ${queryWord} accurate (${cachedReps} cached)`
  }
  return tail
}
```

- and the call site: `const [, scenario, grading, trigger] = result.stages` → `summaryTail(scenario, grading, trigger)`.

`src/cli/index.ts` — the test usage line becomes:

```
  test <path> [--json] [--run]        run harness checks; --run executes LLM stages (--triggers adds trigger accuracy)
```

- [ ] **Step 3: Full gates — flagless byte-identity is the review gate**

Run: `bun test && bun run typecheck`
Expected: green. `tests/cli/test-keystone.test.ts` (full flagless JSON byte pins) must pass with ZERO re-pins — that is the frozen-surface proof. The only sanctioned re-pins in this task are occurrences of the old usage string.

- [ ] **Step 4: Commit**

```bash
git add src/cli/test.ts src/cli/index.ts src/lib/harness/index.ts src/cli/format/ tests/
git commit -m "feat(cli): test --triggers — flag, guard, trigger stage report surfaces"
```

---

### Task 8: Stats module

**Files:**
- Create: `src/lib/harness/stats.ts`
- Create: `tests/harness/stats.test.ts`

**Interfaces:**
- Produces: `mean(xs: number[]): number`, `stddev(xs: number[]): number` (sample, n−1; 0 when n < 2), `min(xs: number[]): number`, `max(xs: number[]): number` — all return 0 on an empty array; unrounded (callers round). Consumed by Task 9.

- [ ] **Step 1: Write the failing tests**

`tests/harness/stats.test.ts`:

```ts
import { expect, test } from 'bun:test'
import { max, mean, min, stddev } from '../../src/lib/harness/stats'

test('mean of hand-computed fixtures', () => {
  expect(mean([0.5, 1, 0.75])).toBeCloseTo(0.75, 10)
  expect(mean([2, 4])).toBe(3)
  expect(mean([])).toBe(0)
})

test('sample stddev (n−1): hand-computed', () => {
  // [2, 4, 4, 4, 5, 5, 7, 9]: mean 5, sum sq dev 32, 32/7 ≈ 4.5714, sqrt ≈ 2.13809
  expect(stddev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(Math.sqrt(32 / 7), 10)
  expect(stddev([0.5, 1, 0.75])).toBeCloseTo(0.25, 10)
})

test('stddev is 0 when n < 2 (spec §2 pin — skill-creator defines no formula)', () => {
  expect(stddev([42])).toBe(0)
  expect(stddev([])).toBe(0)
})

test('min and max', () => {
  expect(min([3, 1, 2])).toBe(1)
  expect(max([3, 1, 2])).toBe(3)
  expect(min([])).toBe(0)
  expect(max([])).toBe(0)
})
```

- [ ] **Step 2: Run to verify failure, implement, re-run**

`src/lib/harness/stats.ts`:

```ts
/** Pure statistics over number arrays. Callers round; these do not. */

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

/** Sample standard deviation (n−1 denominator); 0 when n < 2 (spec pin — skill-creator defines no formula). */
export function stddev(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(xs.reduce((acc, x) => acc + (x - m) ** 2, 0) / (xs.length - 1))
}

export function min(xs: number[]): number {
  return xs.length === 0 ? 0 : Math.min(...xs)
}

export function max(xs: number[]): number {
  return xs.length === 0 ? 0 : Math.max(...xs)
}
```

Run: `bun test tests/harness/stats.test.ts && bun test && bun run typecheck` → green.

- [ ] **Step 3: Commit**

```bash
git add src/lib/harness/stats.ts tests/harness/stats.test.ts
git commit -m "feat(harness): stats module — mean, sample stddev, min, max"
```

---

### Task 9: Bench pipeline — keys, staging, failure contract, benchmark.json

**Files:**
- Modify: `src/lib/harness/run-dir.ts` (add `benchKey`, `suiteKey`)
- Create: `src/lib/harness/bench.ts`
- Create: `tests/harness/bench.test.ts`
- Modify: `tests/harness/run-dir.test.ts` (key tests)

**Interfaces:**
- Consumes: `stageRunDir`, `buildExecutorPrompt`, `readValidCachedGrading` (executor), `gradeCase` (grader), `deriveMetrics`/`extractFinalText`/`renderTranscript` (stream-json), stats (Task 8), `validateBenchmarkJson`/`BenchmarkJson`/`BenchmarkRun` (M4a), `runDir`/`skillContentHash`/`HARNESS_SCHEMA_VERSION`.
- Produces: `BENCH_DEFAULT_RUNS = 3`, `benchKey({skillHash, evalId, config, runNumber, model})`, `suiteKey({skillHash, model, runs})`, `stageBareRunDir`, `deriveBenchResult(grading): BenchmarkRun['result'] | null`, `runBenchSuite(skill, {runner, cacheRoot, model, runs, fresh}): Promise<BenchOutcome>` where `BenchOutcome = { ok: true; doc; docPath; cachedRuns; totalRuns } | { ok: false; message }` — consumed by Task 10.

- [ ] **Step 1: Key tests (failing), then key implementation**

Append to `tests/harness/run-dir.test.ts`:

```ts
test('benchKey: 6 segments, structurally distinct from runKey, config/run/model sensitive', () => {
  const base = { skillHash: 'h'.repeat(64), evalId: 1, config: 'with_skill' as const, runNumber: 1, model: 'sonnet' }
  const k = benchKey(base)
  expect(k).toMatch(/^[0-9a-f]{16}$/)
  expect(benchKey({ ...base, config: 'without_skill' })).not.toBe(k)
  expect(benchKey({ ...base, runNumber: 2 })).not.toBe(k)
  expect(benchKey({ ...base, model: 'opus' })).not.toBe(k)
  expect(runKey({ skillHash: base.skillHash, evalId: 1, model: 'sonnet' })).not.toBe(k)
})

test('suiteKey varies by model and runs', () => {
  const base = { skillHash: 'h'.repeat(64), model: 'sonnet', runs: 3 }
  expect(suiteKey(base)).toMatch(/^[0-9a-f]{16}$/)
  expect(suiteKey({ ...base, runs: 5 })).not.toBe(suiteKey(base))
  expect(suiteKey({ ...base, model: 'opus' })).not.toBe(suiteKey(base))
})
```

Implement in `src/lib/harness/run-dir.ts`:

```ts
export function benchKey(input: {
  skillHash: string
  evalId: number
  config: 'with_skill' | 'without_skill'
  runNumber: number
  model: string
}): string {
  return createHash('sha256')
    .update(`${HARNESS_SCHEMA_VERSION}\n${input.skillHash}\n${input.evalId}\n${input.config}\n${input.runNumber}\n${input.model}`)
    .digest('hex')
    .slice(0, 16)
}

export function suiteKey(input: { skillHash: string; model: string; runs: number }): string {
  return createHash('sha256')
    .update(`${HARNESS_SCHEMA_VERSION}\n${input.skillHash}\nbench-suite\n${input.model}\n${input.runs}`)
    .digest('hex')
    .slice(0, 16)
}
```

- [ ] **Step 2: Write the failing bench pipeline tests**

`tests/harness/bench.test.ts`. Skill fixture built on disk exactly as in `tests/harness/trigger-stage.test.ts` (3-eval suite, deterministic-clean). The FakeRunner script interleaves executor and grader replies: each live sample consumes one executor call (`completed('did the task')`) and one grader call (`completed(gradingReply([...]))` matching that eval's expectations verbatim). Helper for the file:

```ts
const executorOk = () => completed('did the task')
const graderOk = (expectations: string[], passes: boolean[]) =>
  completed(gradingReply(expectations.map((text, i) => ({ text, passed: passes[i] }))))
```

Cases (each a `test(...)` with exact assertions):

1. **Matrix order and prompt shapes** — `runs: 2`, all samples pass. Assert `runner.requests` length 24 (3 evals × 2 configs × 2 runs × 2 calls each) and that request prompts arrive in matrix order: for each eval ascending, `with_skill` run 1..2 then `without_skill` run 1..2. `with_skill` executor prompts start with `A skill named "demo-skill" is installed at .claude/skills/demo-skill/.` and `without_skill` executor prompts equal the eval `prompt` verbatim (no preamble, and the staged cwd contains no `.claude` directory — assert via the request's `cwd`: `existsSync(join(req.cwd, '.claude'))` is false, captured with a function-script FakeRunner entry).
2. **Golden document** — `runs: 1`, scripted pass/fail pattern producing hand-computable stats (e.g. with_skill pass_rates [1, 0.5, 1], without_skill [0.5, 0.5, 0]). Assert `outcome.ok`; byte-compare `readFileSync(outcome.docPath, 'utf8')` to `JSON.stringify(expectedDoc, null, 2) + '\n'` where `expectedDoc` is written out literally in the test (metadata `{skill_name: 'demo-skill', model: 'sonnet', runs_per_configuration: 1, harness_schema_version: 1}`, all runs rows, run_summary with hand-computed mean/stddev/min/max — n=1 per eval but 3 samples per config so stddev is over 3 values — and delta strings). Then assert `validateBenchmarkJson(JSON.parse(...))` returns `[]` and `Object.keys` orders: root `['metadata','runs','run_summary']`, metadata as pinned, result rows `['pass_rate','passed','failed','total','time_seconds','tokens','tool_calls','errors']`, stat objects `['mean','stddev','min','max']`, delta `['pass_rate','time_seconds','tokens']`.
3. **Delta signs** — unit-test `deltaPassRate/deltaTime/deltaTokens` directly: positive (`+0.50`), negative (`-0.25`), zero (`+0.00`); time `+13.0`; tokens `+1700`, zero `+0`.
4. **Replay** — run twice with the same cacheRoot; second run: `runner.requests` length 0, `cachedRuns === totalRuns`, document bytes identical to the first run's.
5. **Executor failure contract** — `runs: 1`; script: eval 1 with_skill executor ok + grader ok; eval 1 without_skill executor `failed('timeout', 'hung')` then retry `failed('timeout', 'hung again')`. Assert: `runner.requests` length 4 (2 for the good sample, 2 executor attempts for the failed one — grader never called); outcome `{ ok: false, message: 'bench run failed (eval 1, without_skill, run 1): executor timeout — hung again' }`; no `benchmark.json` anywhere under the cacheRoot (`new Bun.Glob('**/benchmark.json').scan(...)` finds nothing); the failed run dir contains `events.jsonl` and `transcript.md` but no `grading.json`; a subsequent successful full re-run (fresh runner script) re-executes the failed sample but replays the good one from cache (assert first request of the re-run is the failed sample's executor prompt).
6. **No-result classification** — executor returns `completed(null)` twice for one sample → message `bench run failed (eval 1, with_skill, run 1): executor no-result — no result event`.
7. **Grader-exhaustion failure** — executor ok, then both grader calls `completed('garbage')` → message `bench run failed (eval 1, with_skill, run 1): grader returned invalid grading (reply is not valid JSON)`; abort, nothing written.
8. **deriveBenchResult unit** — a literal grading document with `execution_metrics {input_tokens: 100, output_tokens: 50, total_tool_calls: 4, errors_encountered: 1, ...}` and `timing {executor_duration_seconds: 12.34, ...}` derives `{pass_rate, passed, failed, total, time_seconds: 12.34, tokens: 150, tool_calls: 4, errors: 1}` with summary recomputed from expectations; missing `execution_metrics` → `null` (self-healing cache miss).

- [ ] **Step 3: Run to verify failure, then implement `src/lib/harness/bench.ts`**

```ts
import { cpSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { BenchmarkJson, BenchmarkRun, EvalCase, EvalsJson, GradingJson } from '../evals/types'
import { isRecord, validateBenchmarkJson } from '../evals/validate'
import type { ParsedSkill } from '../types'
import type { ClaudeRunner } from './claude-runner'
import { RUN_TIMEOUT_MS } from './claude-runner'
import { buildExecutorPrompt, readValidCachedGrading, stageRunDir } from './executor'
import { gradeCase } from './grader'
import { benchKey, HARNESS_SCHEMA_VERSION, runDir, skillContentHash, suiteKey } from './run-dir'
import { max, mean, min, stddev } from './stats'
import { deriveMetrics, extractFinalText, renderTranscript } from './stream-json'

export const BENCH_DEFAULT_RUNS = 3

const CONFIGS = ['with_skill', 'without_skill'] as const
export type BenchConfig = (typeof CONFIGS)[number]

export interface BenchOptions {
  runner: ClaudeRunner
  cacheRoot: string
  model: string
  runs: number
  fresh: boolean
}

export type BenchOutcome =
  | { ok: true; doc: BenchmarkJson; docPath: string; cachedRuns: number; totalRuns: number }
  | { ok: false; message: string }

const round2 = (n: number): number => Math.round(n * 100) / 100
const round4 = (n: number): number => Math.round(n * 10_000) / 10_000
const sign = (n: number): string => (n < 0 ? '-' : '+')

export function deltaPassRate(withMean: number, withoutMean: number): string {
  const d = withMean - withoutMean
  return `${sign(d)}${Math.abs(d).toFixed(2)}`
}

export function deltaTime(withMean: number, withoutMean: number): string {
  const d = withMean - withoutMean
  return `${sign(d)}${Math.abs(d).toFixed(1)}`
}

export function deltaTokens(withMean: number, withoutMean: number): string {
  const d = withMean - withoutMean
  return `${sign(d)}${Math.round(Math.abs(d))}`
}

/** without_skill staging: eval files are task inputs, not skill hints — no mount, no preamble. */
export function stageBareRunDir(skill: ParsedSkill, evalCase: EvalCase, dir: string): string {
  rmSync(dir, { recursive: true, force: true })
  const outputs = join(dir, 'outputs')
  mkdirSync(outputs, { recursive: true })
  for (const rel of evalCase.files ?? []) {
    const dest = join(outputs, rel)
    mkdirSync(dirname(dest), { recursive: true })
    cpSync(join(skill.dir, rel), dest)
  }
  return outputs
}

/**
 * Derive a benchmark result row from a persisted grading document (live and
 * cached runs go through the same derivation — replay identity by construction).
 * null = underivable, treated as a self-healing cache miss.
 */
export function deriveBenchResult(grading: GradingJson): BenchmarkRun['result'] | null {
  const em = grading.execution_metrics
  const timing = grading.timing
  if (!isRecord(em) || !isRecord(timing)) return null
  const time = timing.executor_duration_seconds
  const input = em.input_tokens
  const output = em.output_tokens
  const toolCalls = em.total_tool_calls
  const errors = em.errors_encountered
  if ([time, input, output, toolCalls, errors].some(v => typeof v !== 'number' || Number.isNaN(v as number))) return null
  const passed = grading.expectations.filter(e => e.passed).length
  const total = grading.expectations.length
  return {
    pass_rate: total === 0 ? 0 : round4(passed / total),
    passed,
    failed: total - passed,
    total,
    time_seconds: round2(time as number),
    tokens: (input as number) + (output as number),
    tool_calls: toolCalls as number,
    errors: errors as number,
  }
}

type LiveOutcome = { ok: true; result: BenchmarkRun['result'] } | { ok: false; message: string }

async function runLiveSample(
  skill: ParsedSkill,
  evalCase: EvalCase,
  config: BenchConfig,
  runNumber: number,
  skillName: string,
  dir: string,
  options: BenchOptions,
): Promise<LiveOutcome> {
  const failMessage = (detail: string): string => `bench run failed (eval ${evalCase.id}, ${config}, run ${runNumber}): ${detail}`

  const attemptOnce = async () => {
    const outputs = config === 'with_skill' ? stageRunDir(skill, evalCase, skillName, dir) : stageBareRunDir(skill, evalCase, dir)
    const prompt = config === 'with_skill' ? buildExecutorPrompt(skillName, evalCase.prompt) : evalCase.prompt
    const result = await options.runner.run({ prompt, cwd: outputs, model: options.model, timeoutMs: RUN_TIMEOUT_MS })
    const transcript = renderTranscript({ skillName, evalId: evalCase.id, prompt, events: result.events })
    const metrics = deriveMetrics(result.events, transcript)
    writeFileSync(join(dir, 'events.jsonl'), result.events.map(e => JSON.stringify(e)).join('\n') + (result.events.length > 0 ? '\n' : ''))
    writeFileSync(join(dir, 'transcript.md'), transcript)
    writeFileSync(join(outputs, 'metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`)
    return { result, metrics }
  }

  const isBad = (r: { result: { status: string }; metrics: unknown }): boolean =>
    r.result.status !== 'completed' || extractFinalText((r.result as { events: unknown[] }).events) === null

  let attempt = await attemptOnce()
  if (isBad(attempt)) attempt = await attemptOnce() // single retry, identical request (spec §8.1)
  if (isBad(attempt)) {
    const status = attempt.result.status === 'completed' ? 'no-result' : attempt.result.status
    return { ok: false, message: failMessage(`executor ${status} — ${attempt.result.errorMessage ?? 'no result event'}`) }
  }

  const graded = await gradeCase({
    evalCase,
    dir,
    runner: options.runner,
    model: options.model,
    executorDurationSeconds: attempt.result.durationSeconds,
    metrics: attempt.metrics,
  })
  if ('failure' in graded) return { ok: false, message: failMessage(graded.failure) }
  const result = deriveBenchResult(graded.grading)
  if (result === null) return { ok: false, message: failMessage('internal: grading document missing derivable metrics') }
  return { ok: true, result }
}

/** Precondition: the deterministic stage ran on this skill with zero findings (the bench CLI gate). */
export async function runBenchSuite(skill: ParsedSkill, options: BenchOptions): Promise<BenchOutcome> {
  const entry = skill.files.find(f => f.relPath === 'evals/evals.json')
  if (!entry || entry.text === null) throw new Error('internal: runBenchSuite requires a deterministic-clean eval suite')
  const doc = JSON.parse(entry.text) as EvalsJson
  const cases = [...doc.evals].sort((a, b) => a.id - b.id)
  const skillName = doc.skill_name
  const skillHash = skillContentHash(skill)

  const rows: BenchmarkRun[] = []
  let cachedRuns = 0
  const samples: Record<BenchConfig, { pass: number[]; time: number[]; tokens: number[] }> = {
    with_skill: { pass: [], time: [], tokens: [] },
    without_skill: { pass: [], time: [], tokens: [] },
  }

  for (const evalCase of cases) {
    for (const config of CONFIGS) {
      for (let runNumber = 1; runNumber <= options.runs; runNumber++) {
        const key = benchKey({ skillHash, evalId: evalCase.id, config, runNumber, model: options.model })
        const dir = runDir(options.cacheRoot, skillName, key)
        let result: BenchmarkRun['result'] | null = null
        if (!options.fresh) {
          const cached = readValidCachedGrading(dir, evalCase.expectations)
          if (cached !== null) {
            result = deriveBenchResult(cached)
            if (result !== null) cachedRuns += 1
          }
        }
        if (result === null) {
          const live = await runLiveSample(skill, evalCase, config, runNumber, skillName, dir, options)
          if (!live.ok) return live // fail-fast: the matrix is unwritable, spend nothing further (spec §8.1)
          result = live.result
        }
        rows.push({ eval_id: evalCase.id, configuration: config, run_number: runNumber, result })
        samples[config].pass.push(result.pass_rate)
        samples[config].time.push(result.time_seconds)
        samples[config].tokens.push(result.tokens)
      }
    }
  }

  const stat4 = (xs: number[]) => ({ mean: round4(mean(xs)), stddev: round4(stddev(xs)), min: round4(min(xs)), max: round4(max(xs)) })
  const stat2 = (xs: number[]) => ({ mean: round2(mean(xs)), stddev: round2(stddev(xs)), min: round2(min(xs)), max: round2(max(xs)) })
  const summaryFor = (c: BenchConfig) => ({
    pass_rate: stat4(samples[c].pass),
    time_seconds: stat2(samples[c].time),
    tokens: stat2(samples[c].tokens),
  })
  const withSummary = summaryFor('with_skill')
  const withoutSummary = summaryFor('without_skill')

  const benchDoc: BenchmarkJson = {
    metadata: {
      skill_name: skillName,
      model: options.model,
      runs_per_configuration: options.runs,
      harness_schema_version: HARNESS_SCHEMA_VERSION,
    },
    runs: rows,
    run_summary: {
      with_skill: withSummary,
      without_skill: withoutSummary,
      delta: {
        pass_rate: deltaPassRate(withSummary.pass_rate.mean, withoutSummary.pass_rate.mean),
        time_seconds: deltaTime(withSummary.time_seconds.mean, withoutSummary.time_seconds.mean),
        tokens: deltaTokens(withSummary.tokens.mean, withoutSummary.tokens.mean),
      },
    },
  }

  const diagnostics = validateBenchmarkJson(benchDoc)
  if (diagnostics.length > 0) {
    return { ok: false, message: `internal: benchmark document failed validation (${diagnostics[0].path}: ${diagnostics[0].message})` }
  }

  const outDir = runDir(options.cacheRoot, skillName, `bench-${suiteKey({ skillHash, model: options.model, runs: options.runs })}`)
  mkdirSync(outDir, { recursive: true })
  const docPath = join(outDir, 'benchmark.json')
  const tmp = `${docPath}.tmp`
  writeFileSync(tmp, `${JSON.stringify(benchDoc, null, 2)}\n`)
  renameSync(tmp, docPath)
  return { ok: true, doc: benchDoc, docPath, cachedRuns, totalRuns: cases.length * CONFIGS.length * options.runs }
}
```

(If the `isBad` helper's typing fights the inferred attempt type, inline the two checks — behavior over form; keep the classification exactly `status !== 'completed' || extractFinalText(events) === null`.)

- [ ] **Step 4: Run the gates and commit**

Run: `bun test tests/harness/bench.test.ts tests/harness/run-dir.test.ts && bun test && bun run typecheck`
Expected: green.

```bash
git add src/lib/harness/run-dir.ts src/lib/harness/bench.ts tests/harness/bench.test.ts tests/harness/run-dir.test.ts
git commit -m "feat(harness): bench pipeline — run matrix, failure contract, validated benchmark.json"
```

---

### Task 10: `bench` CLI + pretty formatter + index wiring

**Files:**
- Create: `src/cli/bench.ts`
- Create: `src/cli/format/bench-pretty.ts`
- Modify: `src/cli/format/test-pretty.ts` (export the finding-line helper)
- Modify: `src/cli/index.ts` (bench case + usage line)
- Create: `tests/cli/bench-command.test.ts`
- Modify: `tests/cli/format-test.test.ts` or create `tests/cli/format-bench.test.ts` (pretty bytes)

**Interfaces:**
- Consumes: `runBenchSuite`/`BENCH_DEFAULT_RUNS` (Task 9), `runDeterministic`, `spawnClaudeRunner`/`DEFAULT_MODEL`, `cacheRoot`, `parseSkill`.
- Produces: `runBench(argv: string[], deps?: RunBenchDeps { runner?, cacheRoot? }): Promise<number>` (mirrors `runTest`'s injectable shape); `formatBenchPretty(doc, cachedRuns, totalRuns): string`; exported `harnessFindingLines(findings): string[]` from test-pretty.

- [ ] **Step 1: Write the failing tests**

`tests/cli/bench-command.test.ts`. Guard tests spawn the CLI (no runner needed, exit-2 paths); pipeline paths call `runBench` in-process with an injected FakeRunner and `spyOn(console, 'log')`/`spyOn(console, 'error')`:

```ts
import { expect, spyOn, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runBench } from '../../src/cli/bench'
import { completed, fakeRunner, failed, gradingReply } from '../harness/helpers'

const CLI = join(import.meta.dir, '../../src/cli/index.ts')
const FIXTURES = join(import.meta.dir, '../fixtures/harness')
const spawn = (args: string[]) => Bun.spawnSync(['bun', CLI, ...args], { cwd: tmpdir() })

const BENCH_USAGE = 'usage: shakespii bench <path> [--json] [--runs <n>] [--model <name>] [--fresh]'

test('guards: --runs value shapes', () => {
  for (const [args, msg] of [
    [['bench', join(FIXTURES, 'compress'), '--runs'], '--runs requires a value'],
    [['bench', join(FIXTURES, 'compress'), '--runs', '0'], '--runs must be a positive integer'],
    [['bench', join(FIXTURES, 'compress'), '--runs', '-1'], '--runs must be a positive integer'],
    [['bench', join(FIXTURES, 'compress'), '--runs', '1.5'], '--runs must be a positive integer'],
    [['bench', join(FIXTURES, 'compress'), '--runs', 'many'], '--runs must be a positive integer'],
    [['bench', join(FIXTURES, 'compress'), '--model'], '--model requires a value'],
    [['bench', join(FIXTURES, 'compress'), '--wat'], 'unknown option: --wat'],
  ] as const) {
    const r = spawn([...args])
    expect(r.exitCode).toBe(2)
    expect(r.stderr.toString()).toContain(msg)
    expect(r.stderr.toString()).toContain(BENCH_USAGE)
  }
})

test('guards: not a directory / not a skill / missing positional', () => {
  expect(spawn(['bench']).exitCode).toBe(2)
  const r = spawn(['bench', join(FIXTURES, 'compress/SKILL.md')])
  expect(r.exitCode).toBe(2)
  expect(r.stderr.toString()).toContain('not a directory:')
})

test('deterministic gate: findings printed, contractual message, exit 2, nothing spawned', () => {
  const r = spawn(['bench', join(FIXTURES, 'bad-evals')])
  expect(r.exitCode).toBe(2)
  const errText = r.stderr.toString()
  expect(errText).toContain('bench requires a valid eval suite — fix the findings above first')
  expect(errText).toContain('evals/evals.json')
})

test('deterministic gate blocks on warn-only findings too (spec §3.2: any finding)', () => {
  const r = spawn(['bench', join(FIXTURES, 'two-cases')])
  expect(r.exitCode).toBe(2)
  expect(r.stderr.toString()).toContain('bench requires a valid eval suite — fix the findings above first')
})
```

In-process pipeline tests (same file), using the on-disk 3-eval skill helper from `tests/harness/bench.test.ts` (extract that helper into `tests/harness/helpers.ts` if sharing is cleaner):

```ts
test('success: --json prints the document verbatim, exit 0', async () => {
  const log = spyOn(console, 'log').mockImplementation(() => {})
  try {
    const code = await runBench([skillDir, '--json', '--runs', '1'], { runner, cacheRoot })
    expect(code).toBe(0)
    const doc = JSON.parse(log.mock.calls[0][0] as string)
    expect(doc.metadata.runs_per_configuration).toBe(1)
  } finally {
    log.mockRestore()
  }
})

test('run failure: pretty prints only the failure message, exit 1', async () => {
  const log = spyOn(console, 'log').mockImplementation(() => {})
  try {
    const code = await runBench([skillDir, '--runs', '1'], { runner: failingRunner, cacheRoot })
    expect(code).toBe(1)
    expect(log.mock.calls).toHaveLength(1)
    expect(log.mock.calls[0][0]).toBe('bench run failed (eval 1, with_skill, run 1): executor timeout — hung again')
  } finally {
    log.mockRestore()
  }
})

test('run failure with --json: single-line {"error": ...}, exit 1', async () => {
  const log = spyOn(console, 'log').mockImplementation(() => {})
  try {
    const code = await runBench([skillDir, '--json', '--runs', '1'], { runner: failingRunner2, cacheRoot })
    expect(code).toBe(1)
    expect(log.mock.calls[0][0]).toBe(JSON.stringify({ error: 'bench run failed (eval 1, with_skill, run 1): executor timeout — hung again' }))
  } finally {
    log.mockRestore()
  }
})
```

Formatter byte test (`tests/cli/format-bench.test.ts`) — literal document in, exact bytes out:

```ts
import { expect, test } from 'bun:test'
import { formatBenchPretty } from '../../src/cli/format/bench-pretty'

test('bench pretty block: exact bytes', () => {
  const doc = {
    metadata: { skill_name: 'compress', model: 'sonnet', runs_per_configuration: 3, harness_schema_version: 1 },
    runs: [],
    run_summary: {
      with_skill: {
        pass_rate: { mean: 0.9167, stddev: 0.1443, min: 0.75, max: 1 },
        time_seconds: { mean: 45.2, stddev: 3.1, min: 41, max: 49.5 },
        tokens: { mean: 5200.5, stddev: 300.25, min: 4800, max: 5600 },
      },
      without_skill: {
        pass_rate: { mean: 0.4167, stddev: 0.1443, min: 0.25, max: 0.5 },
        time_seconds: { mean: 32.2, stddev: 2.1, min: 30, max: 34.5 },
        tokens: { mean: 3500.5, stddev: 200.25, min: 3300, max: 3700 },
      },
      delta: { pass_rate: '+0.50', time_seconds: '+13.0', tokens: '+1700' },
    },
  }
  expect(formatBenchPretty(doc as never, 3, 18)).toBe(
    [
      'bench compress · model sonnet · 3 run(s)/config',
      '  with_skill      pass_rate 0.92 ±0.14 · time 45.2s · tokens 5201',
      '  without_skill   pass_rate 0.42 ±0.14 · time 32.2s · tokens 3501',
      '  delta           pass_rate +0.50 · time +13.0s · tokens +1700',
      '3/18 run(s) cached',
    ].join('\n'),
  )
})
```

- [ ] **Step 2: Run to verify failure, then implement**

`src/cli/format/test-pretty.ts` — extract and export the finding-line renderer (internal callers switch to it; output bytes unchanged):

```ts
export const harnessFindingLines = (findings: HarnessFinding[]): string[] =>
  findings.map(f => `    ${f.severity === 'error' ? pc.red('error') : pc.yellow('warn ')}  ${f.file}  ${f.message}`)
```

`src/cli/format/bench-pretty.ts`:

```ts
import type { BenchmarkConfigSummary, BenchmarkJson } from '../../lib/evals/types'

const configLine = (label: string, s: BenchmarkConfigSummary): string =>
  `  ${label.padEnd(16)}pass_rate ${s.pass_rate.mean.toFixed(2)} ±${s.pass_rate.stddev.toFixed(2)} · time ${s.time_seconds.mean.toFixed(1)}s · tokens ${Math.round(s.tokens.mean)}`

export function formatBenchPretty(doc: BenchmarkJson, cachedRuns: number, totalRuns: number): string {
  const meta = doc.metadata as { skill_name?: unknown; model?: unknown; runs_per_configuration?: unknown }
  const delta = doc.run_summary.delta
  return [
    `bench ${String(meta.skill_name)} · model ${String(meta.model)} · ${String(meta.runs_per_configuration)} run(s)/config`,
    configLine('with_skill', doc.run_summary.with_skill),
    configLine('without_skill', doc.run_summary.without_skill),
    `  ${'delta'.padEnd(16)}pass_rate ${delta.pass_rate} · time ${delta.time_seconds}s · tokens ${delta.tokens}`,
    `${cachedRuns}/${totalRuns} run(s) cached`,
  ].join('\n')
}
```

`src/cli/bench.ts`:

```ts
import { existsSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { BENCH_DEFAULT_RUNS, runBenchSuite } from '../lib/harness/bench'
import type { ClaudeRunner } from '../lib/harness/claude-runner'
import { DEFAULT_MODEL, spawnClaudeRunner } from '../lib/harness/claude-runner'
import { runDeterministic } from '../lib/harness/deterministic'
import { cacheRoot } from '../lib/harness/run-dir'
import { parseSkill } from '../lib/parser'
import { formatBenchPretty } from './format/bench-pretty'
import { harnessFindingLines } from './format/test-pretty'

const USAGE = 'usage: shakespii bench <path> [--json] [--runs <n>] [--model <name>] [--fresh]'

export interface RunBenchDeps {
  runner?: ClaudeRunner
  cacheRoot?: string
}

export async function runBench(argv: string[], deps: RunBenchDeps = {}): Promise<number> {
  let json = false
  let fresh = false
  let runs: number | undefined
  let model: string | undefined
  const positionals: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--json') {
      json = true
    } else if (a === '--fresh') {
      fresh = true
    } else if (a === '--runs') {
      const v = argv[i + 1]
      if (v === undefined) {
        console.error(`--runs requires a value\n${USAGE}`)
        return 2
      }
      if (!/^\d+$/.test(v) || Number.parseInt(v, 10) < 1) {
        console.error(`--runs must be a positive integer\n${USAGE}`)
        return 2
      }
      runs = Number.parseInt(v, 10)
      i += 1
    } else if (a === '--model') {
      const v = argv[i + 1]
      if (v === undefined || v.startsWith('-')) {
        console.error(`--model requires a value\n${USAGE}`)
        return 2
      }
      model = v
      i += 1
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
    const findings = runDeterministic(skill)
    if (findings.length > 0) {
      console.error(harnessFindingLines(findings).join('\n'))
      console.error('bench requires a valid eval suite — fix the findings above first')
      return 2
    }
    const outcome = await runBenchSuite(skill, {
      runner: deps.runner ?? spawnClaudeRunner(),
      cacheRoot: deps.cacheRoot ?? cacheRoot(),
      model: model ?? DEFAULT_MODEL,
      runs: runs ?? BENCH_DEFAULT_RUNS,
      fresh,
    })
    if (!outcome.ok) {
      console.log(json ? JSON.stringify({ error: outcome.message }) : outcome.message)
      return 1
    }
    console.log(json ? JSON.stringify(outcome.doc, null, 2) : formatBenchPretty(outcome.doc, outcome.cachedRuns, outcome.totalRuns))
    return 0
  } catch (e) {
    console.error(`bench failed: ${(e as Error).message}`)
    return 2
  }
}
```

`src/cli/index.ts` — add the dispatch case:

```ts
    case 'bench': {
      const { runBench } = await import('./bench')
      return runBench(rest)
    }
```

and the usage line after the test line:

```
  bench <path> [--json] [--runs <n>]  benchmark with vs without skill (executes LLM runs)
```

- [ ] **Step 3: Full gates and commit**

Run: `bun test tests/cli/bench-command.test.ts tests/cli/format-bench.test.ts && bun test && bun run typecheck`
Expected: green (lint keystones untouched — `harnessFindingLines` extraction must leave test-pretty bytes identical).

```bash
git add src/cli/bench.ts src/cli/index.ts src/cli/format/ tests/cli/
git commit -m "feat(cli): shakespii bench — guards, deterministic gate, pretty and JSON output"
```

---

### Task 11: Calibration — CALIBRATION-M4B2.md (CONTROLLER-EXECUTED, spends tokens)

**This task is executed by the controller directly, not dispatched to a subagent.** Long sweeps run in the controller's own background shell (subagent background shells die at turn end — M4b-1 lifecycle gotcha). Budget: bench sweep 18 executor + 18 grader sessions on the compress fixture; trigger sweep 60 detect sessions on using-shakespii; both on sonnet; plus the cache-proof re-runs at zero tokens.

**Files:**
- Create: `docs/CALIBRATION-M4B2.md` + mirror `~/.ai-pref-nsync/local-docs/ai-shakespii/knowledge-references/CALIBRATION-M4B2.md`

- [ ] **Step 1: Write and commit predictions BEFORE any sweep (separate commit)**

Create `docs/CALIBRATION-M4B2.md` with sections: `## Protocol` (M4b-1 protocol verbatim: predictions first, verbatim actuals, adjudication classes: harness bug / miscalibration / eval-authoring miss; rewordings recorded, never applied in-phase), `## Predictions — bench (compress fixture, 3 evals × 2 configs × 3 runs, sonnet)` (predict per-config pass_rate direction: with_skill > without_skill; predict delta sign positive; predict rough time/token deltas), `## Predictions — triggers (using-shakespii, 20 queries × 3 reps, sonnet)` (predict per-query verdicts for all 20 queries, and the resulting accuracy band). Sync mirror (`cp` + `cmp`), then:

```bash
git add docs/CALIBRATION-M4B2.md
git commit -m "docs(calibration): M4b-2 predictions — committed before any sweep"
```

- [ ] **Step 2: Bench sweep (background shell)**

```bash
bun src/cli/index.ts bench tests/fixtures/harness/compress --json > /tmp/m4b2-bench-actual.json; echo "exit=$?"
```

Expected: exit 0 after ~18 executor + 18 grader sessions. Record the full `benchmark.json` verbatim in `## Actuals — bench`.

- [ ] **Step 3: Trigger sweep (background shell)**

```bash
bun src/cli/index.ts test skills/using-shakespii --run --triggers --json > /tmp/m4b2-triggers-actual.json; echo "exit=$?"
```

Expected: ~60 detect sessions (plus scenario/grading cache hits if M4b-1 cache entries survive — record either way). Record the trigger stage object verbatim in `## Actuals — triggers`.

- [ ] **Step 4: Cache proofs (zero tokens)**

```bash
bun src/cli/index.ts bench tests/fixtures/harness/compress --json > /tmp/m4b2-bench-replay.json
cmp /tmp/m4b2-bench-actual.json /tmp/m4b2-bench-replay.json && echo BENCH-REPLAY-OK
bun src/cli/index.ts test skills/using-shakespii --run --triggers --json > /tmp/m4b2-triggers-replay.json
cmp /tmp/m4b2-triggers-actual.json /tmp/m4b2-triggers-replay.json && echo TRIGGER-REPLAY-OK
```

Expected: both `-OK` markers; the bench pretty re-run reports `18/18 run(s) cached`. Record both proofs.

- [ ] **Step 5: Adjudicate deviations and commit**

For every prediction-vs-actual mismatch, classify (harness bug / miscalibration / eval-authoring miss) in `## Adjudication`. Query or eval rewordings are RECORDED but not applied (recorded-never-applied discipline; they feed Task 12's adjudication input and the M5 backlog). If a harness bug is found: STOP, fix it via a TDD task inserted before Task 12, then redo the affected sweep with `--fresh`. Sync the mirror (`cp` + `cmp`), then:

```bash
git add docs/CALIBRATION-M4B2.md
git commit -m "docs(calibration): M4b-2 actuals, adjudication, cache proofs"
```

---

### Task 12: using-shakespii v0.5.0

**Sequencing gate:** only start after Task 11's cache proofs are committed (SKILL.md body edits change `skillHash` and invalidate them).

**Files:**
- Modify: `skills/using-shakespii/SKILL.md` (version bump + new teaching sections)
- Modify: `tests/skill/using-shakespii.test.ts` (new-section anchors)

- [ ] **Step 1: Extend the weld test (failing)**

```ts
test('v0.5.0 teaches the bench and trigger loops', async () => {
  const raw = await Bun.file(join(SKILL_DIR, 'SKILL.md')).text()
  expect(raw).toContain('version: 0.5.0')
  expect(raw).toContain('shakespii bench')
  expect(raw).toContain('--triggers')
})
```

- [ ] **Step 2: Edit SKILL.md**

Bump frontmatter `version` to `0.5.0`. Add two subsections in the body (placed in the section that teaches `shakespii test`, matching the skill's existing voice and heading depth):

- **Benchmarking a skill** — teach: `shakespii bench <path>` runs each eval with and without the skill mounted (default 3 runs per configuration, `--runs <n>` to change, `--model <name>`, `--fresh` to bypass cache); read `run_summary.delta` for the with-vs-without capability delta; exit 0 means measured (bench never gates), exit 1 means a run failed, exit 2 means the eval suite has deterministic findings. Never point it at untrusted third-party skills (runs use `--dangerously-skip-permissions`).
- **Measuring trigger accuracy** — teach: author `evals/triggers.json` (16+ labeled queries including near-miss negatives; TR02 lints this statically), then `shakespii test <path> --run --triggers`; the trigger stage runs each query 3 times against a real mount, majority-scores it, and fails below 0.8 accuracy; description edits belong to a deliberate loop — measure, adjust, re-measure with `--fresh`.

The frontmatter `description` stays UNTOUCHED unless Task 11's adjudication explicitly directed a change (recorded-never-applied discipline — a directed change would itself cite the adjudication entry).

- [ ] **Step 3: Gates and commit**

Run: `bun test tests/skill/using-shakespii.test.ts && bun test && bun run typecheck`
Expected: green — lint stays zero-findings (prose sections only; if a lint rule fires, fix the prose, never the pin).

```bash
git add skills/using-shakespii/SKILL.md tests/skill/using-shakespii.test.ts
git commit -m "feat(skill): using-shakespii v0.5.0 — bench and trigger-accuracy loops"
```

---

### Task 13: Docs — HARNESS.md, LINT-RULES.md, ROADMAP.md, README.md + mirrors

**Files:**
- Modify: `docs/HARNESS.md`, `docs/LINT-RULES.md`, `docs/ROADMAP.md`, `README.md`
- Sync mirrors: `~/.ai-pref-nsync/local-docs/ai-shakespii/knowledge-references/HARNESS.md`, `.../specs/LINT-RULES.md`, `.../plans/ROADMAP.md`
- Sync this plan: `cp docs/superpowers/plans/2026-07-09-m4b2-harness-trigger-benchmark.md ~/.ai-pref-nsync/local-docs/ai-shakespii/plans/`

- [ ] **Step 1: HARNESS.md** — add two sections mirroring the existing M4b-1 sections' structure and depth:
  - **Trigger stage (`test --run --triggers`)**: contract summary (input gate, reps/threshold constants, majority scoring, accuracy 0.8, failure semantics: one retry then continue-to-next-query with exclusion from totals), `triggerKey` formula, artifacts layout (`<cacheRoot>/runs/<skillName>/<triggerKey>/` with `events.jsonl`, `transcript.md`, `trigger.json` + its key order), report shapes, the run_eval.py deviations (timeout ≠ no-trigger; unrelated first tool doesn't end the scan; verdict at block stop).
  - **Bench (`shakespii bench`)**: matrix and staging (`with_skill` = M4b-1 executor semantics; `without_skill` = files staged, no mount, no preamble, prompt verbatim), `benchKey`/`suiteKey` formulas, run-failure contract (executor one retry, grader shared budget, fail-fast abort, exact failure output), stats pins (sample stddev n−1, rounding, delta formats), `benchmark.json` location + metadata (no timestamp — replay byte-identity), exit codes.
  - Extend the existing `--dangerously-skip-permissions` risk warning to name `bench` and `--triggers` verbatim alongside `--run`.
- [ ] **Step 2: LINT-RULES.md** — add the TR02 "implemented" note (implemented 2026-07-09, M4b-2; four finding shapes; profile `TR02: { severity: warn, options: { minQueries: 16 } }`) beside the M3b-style implementation notes.
- [ ] **Step 3: ROADMAP.md** — tick the two M4b-2 items (TR02, benchmark) as done with commit references.
- [ ] **Step 4: README.md** — add one bench bullet to the command list: `bench` — benchmark a skill with vs without the skill mounted (`benchmark.json` with pass-rate/time/token deltas); note `test --triggers` under the test bullet.
- [ ] **Step 5: Sync all mirrors and verify**

```bash
for pair in "docs/HARNESS.md:knowledge-references/HARNESS.md" "docs/LINT-RULES.md:specs/LINT-RULES.md" "docs/ROADMAP.md:plans/ROADMAP.md" "docs/superpowers/plans/2026-07-09-m4b2-harness-trigger-benchmark.md:plans/2026-07-09-m4b2-harness-trigger-benchmark.md"; do
  src="${pair%%:*}"; dst="$HOME/.ai-pref-nsync/local-docs/ai-shakespii/${pair##*:}"
  cp "$src" "$dst" && cmp "$src" "$dst" && echo "MIRROR-OK $src"
done
```

Expected: four `MIRROR-OK` lines.

- [ ] **Step 6: Final gates and commit**

Run: `bun test && bun run typecheck`
Expected: green.

```bash
git add docs/ README.md
git commit -m "docs(m4b2): harness trigger+bench contracts, TR02 implemented note, roadmap tick"
```
