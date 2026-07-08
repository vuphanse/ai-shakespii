# M4b-1 — Test harness, LLM half (executor + grader) — design spec

Date: 2026-07-08
Status: approved design, pre-plan
Predecessor: docs/specs/2026-07-08-m4a-harness-static-design.md (shipped)
Successor (out of scope here): M4b-2 — TR02 trigger eval + benchmark stats

## 0. Adjudicated decisions (user, 2026-07-08)

1. **M4b split**: M4b-1 = executor + grader (scenario/grading stages go live);
   M4b-2 = TR02 + benchmark, reusing the invocation layer.
2. **LLM stages are opt-in**: `shakespii test <path>` stays free/fast;
   `--run` executes the LLM stages. Lint-fix loops never burn tokens by accident.
3. **Model policy**: one knob governs executor and grader. Default `sonnet`,
   `--model <name>` overrides per invocation. The model string enters the
   runKey verbatim (existing M4a cache-key design).
4. **Calibration budget**: `skills/using-shakespii` (5 evals) + the repaired
   compress fixture (3 evals), 1 run per eval, sonnet. Second sweep must
   prove 8/8 cache hits with zero new sessions.
5. **Architecture**: Approach A — a single injected `ClaudeRunner` boundary;
   real implementation shells to `claude -p` headless (per the M4
   adjudication); the whole test suite runs tokenless via a scripted fake.

Standing constraints inherited from M4a: dogfood corpus strictly read-only
(M4b-1 calibration targets are both in-repo, so the live corpus is untouched
entirely); lint CLI surface and lint-JSON v1 frozen; TDD with unpiped
`bun test` + `bun run typecheck`; docs dual-location sync; never weaken an
assertion to absorb a new finding.

## 1. Goal

Make `shakespii test <path> --run` execute a skill's eval suite end to end:
run each eval case in an isolated workspace via headless `claude -p`
(executor), grade the transcript and artifacts against the case's
expectations via a second LLM call (grader), persist a validated
`grading.json` per (skill content, eval, model) in the M4a run-dir cache,
and fold results into the existing stage pipeline, findings model, and exit
codes. Repeat runs replay from cache deterministically at zero token cost.

## 2. CLI contract

```
shakespii test <path> [--json] [--run] [--fresh] [--model <name>]
```

- `--run` — execute the scenario and grading stages. Without it they report
  `status: "skipped"` (see §7) and the command spends no tokens.
- `--fresh` — ignore existing cached `grading.json` files; re-execute every
  eval. Requires `--run`: bare `--fresh` prints
  `--fresh requires --run` plus the usage line, exit 2.
- `--model <name>` — override the executor/grader model. Requires `--run`:
  bare `--model` prints `--model requires --run` plus usage, exit 2.
  `--model` as the last token (missing value) prints
  `--model requires a value` plus usage, exit 2. The value is passed through
  to `claude -p --model` and into the runKey verbatim; no allowlist.
- Default model constant: `DEFAULT_MODEL = 'sonnet'`
  (`src/lib/harness/claude-runner.ts`).
- Unknown options keep the M4a fail-loud contract:
  `unknown option: <flag>` plus usage, exit 2.
- Usage line becomes
  `usage: shakespii test <path> [--json] [--run] [--fresh] [--model <name>]`.
  The `src/cli/index.ts` USAGE entry becomes
  `test <path> [--json] [--run]        run harness checks; --run executes LLM stages`.
- Target validation unchanged: directory-only (`not a directory: <path>`),
  `not a skill: no SKILL.md at <dir>`, exit 2.

Exit codes (unchanged semantics):

- 0 — no error-severity findings (warnings allowed).
- 1 — at least one error finding. A single eval timing out or failing an
  expectation is a test failure, not a run error.
- 2 — run error only: bad usage, unreadable target, `claude` CLI not
  spawnable (`test failed: claude CLI not found — install Claude Code or put
  claude on PATH`), or an unexpected exception (`test failed: <msg>`).

The lint CLI surface is untouched. TR01 still delegates to the deterministic
stage only — lint never spends tokens.

## 3. `ClaudeRunner` — the injected LLM boundary

`src/lib/harness/claude-runner.ts`:

```ts
export interface RunnerRequest {
  prompt: string
  cwd: string
  model: string
  timeoutMs: number
}

export type RunnerStatus = 'completed' | 'timeout' | 'nonzero-exit'

export interface RunnerResult {
  status: RunnerStatus
  finalText: string | null                 // the result event's text, if any
  events: unknown[]                        // parsed stream-json events, in order
  usage: { inputTokens: number; outputTokens: number } | null
  durationSeconds: number                  // wall clock, 2-decimal rounded
  errorMessage: string | null              // stderr tail (≤2000 chars) on failure
}

export interface ClaudeRunner {
  run(req: RunnerRequest): Promise<RunnerResult>
}

export const DEFAULT_MODEL = 'sonnet'
export const RUN_TIMEOUT_MS = 300_000     // per LLM call (executor or grader)

export function spawnClaudeRunner(): ClaudeRunner
```

Real implementation:

- argv: `['claude', '-p', prompt, '--output-format', 'stream-json',
  '--verbose', '--dangerously-skip-permissions', '--model', model]`.
- `cwd` from the request; env = `process.env` minus `CLAUDECODE`
  (skill-creator's documented trick for nesting `claude -p` inside a Claude
  Code session).
- stdout consumed line-by-line as NDJSON; lines that fail `JSON.parse` are
  skipped (tolerant reader). `events` holds the parsed objects in order.
- Timeout: kill the process, `status: 'timeout'`.
- Nonzero exit: `status: 'nonzero-exit'`, `errorMessage` = last ≤2000 chars
  of stderr.
- Unspawnable binary (ENOENT): throw `ClaudeUnavailableError` with message
  `claude CLI not found — install Claude Code or put claude on PATH`. This
  propagates out of `testSkill` and lands in `runTest`'s catch → exit 2.

**Permissions bypass — accepted risk, stated openly.** The executor runs the
skill under test with `--dangerously-skip-permissions` in an isolated
per-run workspace. Rationale: `--run` is opt-in, the eval suites executed
are the user's own trusted skills, and the workspace cwd is disposable. The
cwd is containment by convention, not a sandbox — a malicious skill could
escape via Bash. Documented in HARNESS.md; running `--run` against untrusted
third-party skills is explicitly warned against.

`testSkill` becomes `async` (`Promise<TestResult>`); `runTest` and the
`src/cli/index.ts` dispatch await it. `runDeterministic` stays synchronous;
TR01 is unaffected.

## 4. Stream-json parsing (`src/lib/harness/stream-json.ts`)

Pure module over `events: unknown[]`. Recognized shapes (all others are
carried in `events` but ignored by derivation):

- `{"type":"assistant","message":{"content":[...]}}` — content blocks of
  `{"type":"text","text":string}` and
  `{"type":"tool_use","name":string,"input":object}`.
- `{"type":"user","message":{"content":[{"type":"tool_result",
  "is_error":boolean, ...}]}}`.
- `{"type":"result","result":string,"usage":{"input_tokens":number,
  "output_tokens":number},"num_turns":number,"duration_ms":number,
  "is_error":boolean}` — terminal event; its absence after a completed run
  is an executor failure (§5).

Exports:

```ts
export interface ExecutionMetrics {
  tool_calls: Record<string, number>   // count of tool_use blocks by name
  total_tool_calls: number
  errors_encountered: number           // tool_result blocks with is_error true
  num_turns: number                    // from the result event; 0 if absent
  input_tokens: number                 // from usage; 0 if absent
  output_tokens: number
  transcript_chars: number             // length of the rendered transcript
}

export function deriveMetrics(events: unknown[], transcript: string): ExecutionMetrics
export function extractFinalText(events: unknown[]): string | null
export function renderTranscript(input: {
  skillName: string; evalId: number; prompt: string; events: unknown[]
}): string
```

`renderTranscript` template (headings contractual; tool inputs truncated to
500 chars, tool results to 2000 chars, each with a trailing `…` when cut):

```markdown
# Transcript — <skillName> eval <evalId>

## Prompt

<full prompt verbatim>

## Assistant

<text block verbatim>

**Tool: <name>** — <JSON.stringify(input), truncated 500>

## Tool result

<stringified content, truncated 2000>

## Result

<result event text, or "(no result event)">
```

Assistant/tool-result sections repeat in event order. Parser and renderer
are tested against hand-authored NDJSON fixtures in
`tests/fixtures/harness/stream-json/` built from the shapes above;
calibration captures real `events.jsonl` files and validates the fixtures
against reality — mismatches strengthen the fixtures, never weaken
assertions.

## 5. Executor (`src/lib/harness/executor.ts`)

Runs after the deterministic stage, only when `--run` is set and the
deterministic stage produced zero **errors** (warnings do not block).
Processes eval cases sequentially in ascending `id`; each case runs the full
execute→grade pipeline (§6) before the next case starts.

Per eval case:

1. `key = runKey({ skillHash, evalId, model })`;
   `dir = runDir(cacheRootPath, evalsJson.skill_name, key)`. The run-dir
   name segment is `evals.json`'s `skill_name` (always present and
   frontmatter-consistent in a deterministic-clean suite).
2. **Cache check**: unless `--fresh`, if `dir/grading.json` exists,
   parses, validates as GradingJson, **and** passes the rubric-fidelity
   check against the current case (§6: expectation texts verbatim, same
   count, same order), the case is a cache hit — no LLM calls; the grading
   stage replays findings from the file. A missing, unparseable,
   schema-invalid, or rubric-mismatched `grading.json` is a cache miss
   (self-healing); the run meta reports `cached: false`. (Rubric mismatch
   can only arise from corruption or tampering — `evals/evals.json` is an
   inventory file, so editing expectations changes `skillContentHash` and
   lands in a different runKey — but the guard holds regardless.)
3. **Cold path**: remove `dir` recursively if present, recreate via
   `ensureRunDir`. Create `dir/outputs/` (the executor cwd). Stage:
   - copy the entire skill directory to
     `outputs/.claude/skills/<skill_name>/` (SKILL.md + all inventory
     files, recursive);
   - copy each of the case's `files` entries from the skill dir into
     `outputs/<relPath>`, preserving the skill-relative path (eval prompts
     reference these paths verbatim, e.g.
     `evals/files/sample-memory.md`), creating parent dirs.
4. **Prompt** (exact template, contractual):

   ```
   A skill named "<skill_name>" is installed at .claude/skills/<skill_name>/. Read .claude/skills/<skill_name>/SKILL.md first, then complete this task following the skill:

   <eval prompt verbatim>
   ```

   Scenario evals measure capability *with* the skill force-loaded; natural
   triggering is TR02's concern (M4b-2).
5. `runner.run({ prompt, cwd: outputsDir, model, timeoutMs: RUN_TIMEOUT_MS })`.
6. **Artifacts** (cold path, written before grading):
   - `dir/events.jsonl` — one `JSON.stringify(event)` per line (parsed
     events re-serialized; unparseable stream lines are not preserved);
   - `dir/transcript.md` — `renderTranscript(...)`;
   - `dir/outputs/metrics.json` — `deriveMetrics(...)`, pretty-printed.
7. **Failure**: `status !== 'completed'`, or completed with no `result`
   event → one scenario-stage error finding
   `eval <id>: executor <status> — <errorMessage or 'no result event'>`
   (file `evals/evals.json`, line null), where `<status>` is the
   `ScenarioRunMeta` status word (`timeout`, `nonzero-exit`, or
   `no-result`). The case is excluded from grading;
   no `grading.json` and no `timing.json` are written, so the case stays
   uncached.

Run metadata (surfaced in test-JSON, §7):

```ts
export interface ScenarioRunMeta {
  evalId: number
  cached: boolean
  status: 'ok' | 'timeout' | 'nonzero-exit' | 'no-result'
  durationSeconds: number    // 0 for cache hits
}
```

Scenario stage status: `'fail'` iff it produced at least one error finding,
else `'pass'`.

## 6. Grader (`src/lib/harness/grader.ts`)

One `ClaudeRunner` call per successfully executed eval case, cwd = the run
dir (`dir`, not `outputs/`), same model, same `RUN_TIMEOUT_MS`. The grader
does **not** write files; it replies with JSON, and the harness validates
and persists.

Prompt (exact template, contractual; expectations numbered in eval order):

```
You are grading a skill evaluation run. Work in the current directory.

Read transcript.md (the execution transcript). Examine the files under outputs/, ignoring outputs/.claude/ (it is the skill mount, not an artifact).

The task given to the executor:
<eval prompt verbatim>

Expected outcome:
<eval expected_output verbatim>

Grade each expectation below as passed true or false, with cited evidence. The burden of proof is on the expectation: PASS only with clear evidence of genuine completion; superficial compliance (right filename, wrong content) is FAIL. No partial credit.

Expectations (grade exactly these, verbatim, in this order):
1. <expectation text>
2. ...

Reply with ONLY this JSON — no prose before or after:
{
  "expectations": [
    { "text": "<expectation verbatim>", "passed": true, "evidence": "<specific citation>" }
  ],
  "summary": { "passed": 0, "failed": 0, "total": 0, "pass_rate": 0 }
}
```

Validation gates on the grader's reply (`finalText`):

1. **Extraction**: trim; if the reply is a fenced block (` ```json ` or
   ` ``` `), take the fence body; `JSON.parse`.
2. **Schema**: `validateGradingJson(doc)` must return `[]`.
3. **Rubric fidelity**: `doc.expectations[i].text` must equal the eval's
   `expectations[i]` verbatim — same count, same order. A grader that
   grades its own invented rubric is a failed grade.

On any gate failure: one retry — a second `runner.run` whose prompt is the
original prompt plus:

```

Your previous reply failed validation:
<one line per diagnostic or mismatch>

Previous reply:
<previous finalText verbatim>

Reply again with ONLY the corrected JSON.
```

If the retry also fails a gate: one grading-stage error finding
`eval <id>: grader returned invalid grading (<first diagnostic or mismatch,
one line>)`; nothing is written; the case stays uncached.

On success the harness builds the persisted document — the grader's
arithmetic is never trusted:

- `expectations` — from the grader, verbatim.
- `summary` — **recomputed**: `passed` = count of `passed: true`, `failed` =
  `total - passed`, `total` = expectations length, `pass_rate` =
  `passed / total` rounded to 4 decimals.
- `execution_metrics` — the contents of `outputs/metrics.json`.
- `timing` — `{ executor_duration_seconds, grader_duration_seconds,
  total_duration_seconds }` from the two `RunnerResult.durationSeconds`
  values (2-decimal rounded; total = sum). The same object is written to
  `dir/timing.json`.

The merged document must pass `validateGradingJson` (internal invariant —
a failure here is a bug and throws). Persistence is atomic: write
`grading.json.tmp`, then `renameSync` to `grading.json` — the cache marker
never exists half-written.

Grading findings (per case, cold or cached replay):

- one error finding per failed expectation:
  `eval <id> expectation failed: "<text>" — <evidence truncated to 200
  chars, trailing … when cut>` (file `evals/evals.json`, line null).

Cached replay reads `grading.json`, revalidates it through the same two
gates as a live reply — `validateGradingJson` **and** rubric fidelity
against the current case's expectations — and derives the identical
findings deterministically; a second `--run` is byte-identical output and
zero tokens. A cached file failing either gate is a cache miss handled in
§5 step 2, never a replayed verdict.

Grading stage status: `'fail'` iff at least one error finding, else
`'pass'`. Cases excluded by executor failure simply don't contribute
grading findings (the scenario finding already carries the error).

## 7. Stage pipeline, test-JSON, pretty output

`testSkill` signature:

```ts
export interface TestOptions {
  run?: boolean          // default false
  fresh?: boolean        // default false
  model?: string         // default DEFAULT_MODEL
  runner?: ClaudeRunner  // default spawnClaudeRunner() — the injection point
  cacheRoot?: string     // default cacheRoot() — tests always pass a temp dir
}
export async function testSkill(skill: ParsedSkill, options?: TestOptions): Promise<TestResult>
```

`StageReport` union becomes:

```ts
export type StageReport =
  | { stage: 'deterministic'; status: 'pass' | 'fail'; findings: HarnessFinding[] }
  | { stage: 'scenario'; status: 'pass' | 'fail'; findings: HarnessFinding[]; runs: ScenarioRunMeta[] }
  | { stage: 'grading'; status: 'pass' | 'fail'; findings: HarnessFinding[] }
  | { stage: 'scenario' | 'grading'; status: 'skipped'; note: string }
```

Skip notes (contractual strings):

- without `--run`: `pass --run to execute LLM stages` (both stages);
- with `--run` but deterministic errors: `deterministic stage failed`
  (both stages) — never burn tokens on an invalid suite. Deterministic
  warnings alone do not block.
- M4a's `status: 'unavailable'` / `note: 'ships in M4b'` is retired; every
  test that pins it re-pins to the new strings (enumerated at plan time).

test-JSON stays **version 1** — all changes are additive or were
pre-announced in M4a ("unavailable until M4b"): new status value `skipped`,
real scenario/grading stage bodies, and the scenario stage's `runs` array.
Key orders are contractual: top level `version, mode, skill, stages,
summary`; findings `severity, message, file, line`; runs entries
`evalId, cached, status, durationSeconds`. `summary` keeps counting all
findings across stages (errors/warnings), exactly as M4a defined.

Pretty output (`src/cli/format/test-pretty.ts`) — findings list unchanged
(M4a layout, `padEnd(13)`); the summary line becomes (real pluralization
throughout, existing helper):

- no `--run`:
  `deterministic: <E> error(s), <W> warning(s) · scenario/grading skipped (pass --run)`
- `--run`, deterministic errors:
  `deterministic: <E> error(s), <W> warning(s) · scenario/grading skipped (deterministic stage failed)`
- `--run`, stages executed:
  `deterministic: <E> error(s), <W> warning(s) · scenario: <ok>/<total> run(s) ok (<C> cached) · grading: <P>/<Q> expectation(s) passed`
  where `<ok>` counts runs with status `ok` (cached hits included),
  `<total>` = eval-case count, `<C>` = cache hits, `<P>`/`<Q>` = passed /
  graded expectation totals across graded cases.

## 8. Keystones and blast radius

- **Re-pins (mechanical, enumerated in the plan)**: every assertion on
  `status: 'unavailable'` / `ships in M4b` / the M4a pretty summary tail
  `scenario/grading pending M4b` — in `tests/harness/*`, `tests/cli/format-test.test.ts`,
  `tests/cli/test-command.test.ts`, `tests/cli/test-keystone.test.ts`, and
  the using-shakespii weld's `shakespii test` lock. Re-pins swap exact
  strings; assertion strength is preserved.
- **Async migration**: `testSkill` callers gain `await`; no behavioral
  change without `--run`.
- **Frozen surfaces**: lint CLI/JSON v1 byte-identical; `profiles/default.yaml`
  untouched; TR01 code untouched; scaffold keystone `{errors: 20, warnings: 0}`
  and corpus keystone byte-identical; live corpus (`~/.claude/skills/`,
  superpowers cache) read-only and — in M4b-1 — entirely untouched, since
  both calibration targets live in-repo.
- **Cache writes** only ever land under the resolved cache root. Every test
  that touches the cache passes an explicit temp `cacheRoot`; no test reads
  or writes `~/.cache/shakespii`.
- `HARNESS_SCHEMA_VERSION` stays 1: M4b-1 implements the layout M4a
  announced; no cached artifacts exist in the wild to invalidate.

## 9. Test strategy (all tokenless)

- `FakeRunner` helper (`tests/harness/helpers.ts`):
  scripted queue of `RunnerResult`s (or functions of the request), records
  every `RunnerRequest` for assertions (prompt containment, cwd, model,
  timeout).
- Runner: argv construction, env strip, NDJSON tolerance, timeout kill,
  stderr capture — unit-tested where possible without spawning `claude`
  (a tiny stub executable driven via PATH is acceptable for the spawn
  paths; no network, no tokens).
- Stream-json: fixtures under `tests/fixtures/harness/stream-json/`
  (hand-authored per §4 shapes) covering text+tool_use turns, error tool
  results, missing result event, garbage lines.
- Executor: staging correctness (skill mount, `files` relPath preservation),
  prompt template, cache hit short-circuit, `--fresh` re-run, stale-dir
  wipe, corrupt-cache self-heal, **rubric-mismatch self-heal** (a
  schema-valid cached `grading.json` whose expectation texts do not match
  the current eval is treated as a miss and re-run, never replayed),
  failure findings, run metadata.
- Grader: prompt template, extraction (fenced/bare), all three gates, retry
  flow, summary recomputation, metrics/timing merge, atomic write, failure
  finding, evidence truncation.
- Pipeline/CLI: flag parsing (incl. `--fresh`/`--model` guards), skip
  notes, JSON key orders, pretty summary variants, exit codes — via
  `TestOptions` injection; `runTest` grows an optional deps parameter for
  the runner/cacheRoot so CLI tests stay tokenless.
- Existing suites: keystone re-pins per §8; everything else must pass
  unmodified.

## 10. Calibration protocol (M4b-1)

Per the adjudicated budget — both in-repo targets, 1 run/eval, sonnet:

1. **Predictions committed before the sweep** (separate commit):
   per-eval pass/fail predictions for `skills/using-shakespii` (5 cases)
   and `tests/fixtures/harness/compress` (3 cases), plus the prediction
   that the second sweep is 8/8 cached with zero sessions.
2. Sweep: `shakespii test skills/using-shakespii --run --json` and
   `shakespii test tests/fixtures/harness/compress --run --json`; verbatim
   actuals recorded.
3. Cache proof: immediate re-run of both; assert every `runs[]` entry has
   `cached: true` and wall time is sub-second per skill.
4. Fixture validation: captured `events.jsonl` files are compared against
   the hand-authored stream-json fixtures; divergences strengthen fixtures
   (never weaken assertions) and are recorded.
5. Adjudication classes as before: harness bug / miscalibration /
   eval-authoring miss. Grader verdict disputes are recorded with the
   evidence string; expectation rewording is recorded-never-applied inside
   the calibration commit (eval edits are their own commits).
6. Doc: `docs/CALIBRATION-M4B1.md` (+ canonical copy under
   `knowledge-references/`).

## 11. Documentation plan

- `docs/HARNESS.md` — rewritten: stages live behind `--run`, final run-dir
  layout (`outputs/`, `events.jsonl`, `transcript.md`, `metrics.json`
  placement, `timing.json`, `grading.json` as cache marker), model policy,
  permissions-bypass risk note, cache replay semantics. (Amends the M4a
  sketch: `events.jsonl`/`transcript.md` at run-dir level are additive.)
- `docs/ROADMAP.md` — M4b section split into M4b-1 (checked on completion)
  and M4b-2 (TR02, benchmark, `--fresh` was M4b-1's, live-compress sync
  gate stays at M4 close).
- `README.md` — test bullet gains `--run`.
- `skills/using-shakespii` — v0.4.0: SKILL.md teaches the `--run` loop
  (when to spend tokens, reading scenario/grading findings, `--fresh`);
  description mentions testing (resolves the parked M4a follow-up); sixth
  eval case covering the `--run` teaching; weld re-pins.
- Dual-location sync for every doc (canonical
  `~/.ai-pref-nsync/local-docs/ai-shakespii/…`, repo mirror, cmp-verified).

## 12. Non-goals (M4b-2 or later)

- TR02 trigger-accuracy eval (lint rule + trigger eval-set format + runs).
- `benchmark.json` writers, with/without-skill configs, runs-per-eval > 1,
  variance stats.
- Parallel eval execution (sequential only in M4b-1).
- Grader extras: claims extraction, user-notes, eval_feedback (the
  validators already accept these optional blocks; the M4b-1 grader prompt
  doesn't request them).
- Config-file knobs for timeout/model (constants + `--model` only).
- Live-compress evals sync — still gated on user sign-off at M4 close,
  attached to the personal-skill-migration decision.

## 13. Plan-time amendments

None yet. Factual discoveries during planning are applied here as numbered
amendments (with re-review), never as silent plan deviations — the M4a §12
mechanism.
