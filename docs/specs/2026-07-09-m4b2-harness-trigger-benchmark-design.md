# M4b-2 — Test harness, LLM half part 2: TR02 trigger eval + benchmark — Design

Date: 2026-07-09
Status: approved design, pending spec review
Depends on: M4a (deterministic stage, schemas/validators, run-dir/cache skeleton), M4b-1 (ClaudeRunner, executor, grader, cache, `test --run`)

## §0 Adjudications (user decisions, 2026-07-09)

| # | Question | Decision |
|---|---|---|
| 1 | One spec or split cycles for TR02 + benchmark | **One spec, both workstreams** — shared runner/cache/stream infra; plan sequences them |
| 2 | How much of skill-creator's trigger design | **Measure only** — no train/test split, no description-optimizer loop (that arrives with the M5 writer, which owns description edits) |
| 3 | Trigger-query storage | **`evals/triggers.json`** sibling file; `evals.json` stays byte-compatible with the pinned skill-creator schema |
| 4 | Benchmark CLI surface | **New `shakespii bench` subcommand**; trigger measurement stays under `test` as opt-in `--triggers` (requires `--run`) |
| 5 | Calibration sweep | **Both, full** — bench on the compress fixture (3 evals × 2 configs × 3 runs), triggers on using-shakespii (~20 queries × 3 reps); M4b-1 protocol (predictions first, verbatim actuals, adjudication classes) |
| 6 | Trigger detection approach | **A: native skill mount** — real SKILL.md at `.claude/skills/<name>/`, raw query, early stream detection; not the command-file port (drifted surface, uuid-mangled name distorts the signal) and not judge-based (intention ≠ behavior) |

Related decisions the same day (outside this spec, recorded in ROADMAP): XS02 threshold 0.65 applied; personal-skill migration deferred to M5 — **the dogfood corpus at `~/.claude/skills/` stays strictly read-only throughout M4b-2**. Neither `bench` nor `--triggers` ever writes into a skill directory.

## §1 Goal

Ship the second half of the harness's LLM stages: (a) TR02 trigger-accuracy measurement — does the skill's name + description make Claude invoke it for the right queries and leave it alone for near-misses — and (b) `benchmark.json` production — with-skill vs without-skill capability deltas with variance over repeated runs. Both tokenless-testable via the injected `ClaudeRunner`; live tokens only in the calibration sweep.

## §2 Evidence base (pinned)

- skill-creator `run_eval.py`: eval set = `[{query, should_trigger}]`; `--runs-per-query` default **3**; `--trigger-threshold` default **0.5**; per-query pass = `trigger_rate >= 0.5` for positives, `trigger_rate < 0.5` for negatives (equals majority rule at 3 reps). Detection: `--include-partial-messages`, watch `stream_event` `content_block_start` for `tool_use` named `Skill`/`Read`, accumulate `input_json_delta` fragments, verdict when the accumulated input names the target; early process kill on verdict. CLAUDECODE env strip. All ported.
- skill-creator `schemas.md`: defines `benchmark.json` (already typed + validated in M4a: `BenchmarkJson`, `validateBenchmarkJson`) but **no trigger-file schema** — the query set is script-internal, so shakespii defines `triggers.json` (§4) faithful to the internal shape.
- No stddev formula exists anywhere in skill-creator (`generate_report.py` is the optimizer HTML page). This spec pins its own: **sample standard deviation (n−1 denominator); stddev = 0 when n < 2**.
- LINT-RULES TR02 row (≥16 queries incl. near-miss negatives). The row's "pass threshold on held-out split" wording described the optimizer design; adjudication 2 supersedes it — an evidence-cited amendment to LINT-RULES ships with this milestone.

## §3 CLI contracts

### 3.1 `shakespii test` (extended)

```
test <path> [--json] [--run] [--fresh] [--model <name>] [--triggers]
```

- `--triggers` requires `--run`: violating prints `--triggers requires --run` + usage, **exit 2** (same shape as the existing `--fresh`/`--model` guards).
- Without `--triggers`, output is **byte-identical to M4b-1** — pinned by regression tests. The trigger stage object exists in JSON `stages` only when the flag is passed (additive extension of test-JSON v1, precedent: the §13.1 `expectations` amendment in M4b-1).
- Stage order with `--triggers`: deterministic → scenario → grading → trigger. Deterministic failure skips all three LLM stages; the skip note set extends to `trigger` and the pretty line becomes `scenario/grading/trigger skipped (deterministic stage failed)`.
- Top-level usage line in `src/cli/index.ts` becomes:
  `test <path> [--json] [--run]        run harness checks; --run executes LLM stages (--triggers adds trigger accuracy)`

### 3.2 `shakespii bench` (new)

```
bench <path> [--json] [--runs <n>] [--model <name>] [--fresh]
```

- Inherently LLM — no `--run` gate. `ClaudeUnavailableError` → existing message, exit 2.
- Guards (each prints message + usage, exit 2): `--runs requires a value`; `--runs must be a positive integer` (rejects `0`, negatives, non-integers); `--model requires a value`; unknown options reuse the test CLI's fail-loud handling verbatim.
- Deterministic stage runs first as a **gate**: any deterministic finding → findings printed via the existing formatter, then `bench requires a valid eval suite — fix the findings above first`, **exit 2**, nothing spawned.
- Defaults: `BENCH_DEFAULT_RUNS = 3`, model `DEFAULT_MODEL` (`sonnet`). `--model` and runs count enter cache keys.
- Execution: for each eval (ascending id) × configuration (`with_skill`, then `without_skill`) × run_number (1..N): execute, grade, persist — sequential throughout (M4b-1 precedent; parallelism is a non-goal, §13).
- Exit codes: **0** benchmark completed (regardless of deltas — bench measures, it does not gate); **1** any run failed after its retry (partial artifacts kept, nothing cached for the failed run, no `benchmark.json` written); **2** usage / invalid suite / claude unavailable.
- Top-level usage gains:
  `bench <path> [--json] [--runs <n>]  benchmark with vs without skill (executes LLM runs)`
- `runBench(argv, deps?: RunBenchDeps { runner?, cacheRoot? }): Promise<number>` mirrors `runTest`'s injectable shape.

## §4 `evals/triggers.json` — schema and validator

```json
{
  "skill_name": "using-shakespii",
  "queries": [
    { "query": "Lint the skill I just wrote and fix the findings", "should_trigger": true },
    { "query": "Run eslint on my TypeScript project", "should_trigger": false }
  ]
}
```

`validateTriggersJson(doc: unknown): Diagnostic[]` in `src/lib/evals/validate.ts`, same diagnostic style and ordering discipline as the existing validators (`{path, message}`, document order, unknown keys rejected):

1. root must be an object (`$`)
2. `skill_name` must be a non-empty string
3. unknown root keys → `unknown key "<k>"`
4. `queries` must be a non-empty array
5. per entry, in order: `queries[i].query` non-empty string; `queries[i].should_trigger` boolean; unknown keys → `queries[i].<k>` `unknown key "<k>"`

Types in `src/lib/evals/types.ts`: `TriggerQuery { query: string; should_trigger: boolean }`, `TriggersJson { skill_name: string; queries: TriggerQuery[] }`. Field names match skill-creator's internal shape verbatim (wrap, don't reinvent).

## §5 TR02 lint rule (static, tokenless)

`src/lib/rules/TR02.ts` (flat, beside TR01) — severity **warn**, single finding per skill (TR01 cap precedent), options `{ minQueries: 16 }` profile-resolvable. Message pluralization follows TR01's house style (`error${n === 1 ? '' : 's'}`). Never spawns anything. Finding shapes, checked in this order, first match wins:

1. no `evals/triggers.json` in the inventory → `no evals/triggers.json — add a trigger-accuracy query set (16+ labeled queries incl. negatives)`
2. file present but JSON-unparsable or `validateTriggersJson` non-empty → `evals/triggers.json fails validation (<n> error(s))` (n = diagnostic count; 1 for unparsable JSON)
3. valid but `queries.length < minQueries` → `evals/triggers.json has <n> queries, fewer than <minQueries>`
4. valid but zero entries with `should_trigger: false` → `evals/triggers.json has no negative queries (should_trigger: false)`

Profile entry: `TR02: { severity: warn, options: { minQueries: 16 } }`. Lint JSON v1 stays byte-identical for skills where TR02 is silent; TR02 findings flow through the existing engine unchanged. LINT-RULES.md TR02 row amended: evidence cites run_eval.py defaults + adjudication 2 (measure-only; split wording retired).

## §6 Runner extension — detect mode

- `RunnerRequest` gains `detect?: { skillName: string }`.
- `RunnerResult` gains `triggered?: boolean` — present iff `detect` was requested **and** status is `completed`: `true` when detection fired (process killed early — early-kill still reports `completed`), `false` on clean completion without detection. Absent on `timeout`/`nonzero-exit`.
- `spawnClaudeRunner` with `detect`: argv gains `--include-partial-messages`; stdout is scanned line-by-line as it streams. Detection rule (ported from run_eval.py): on `stream_event` → `content_block_start` with `content_block.type === 'tool_use'` and name `Skill` or `Read`, start accumulating that block's `input_json_delta` fragments; at `content_block_stop`, the verdict fires if the accumulated input JSON contains the skill name (`Skill` tool) or a path ending in `.claude/skills/<skillName>/SKILL.md` (`Read` tool). On verdict: process-group SIGKILL (existing detached machinery), `{status: 'completed', triggered: true}`. Fallback for harnesses emitting complete `assistant` events without partials: a `tool_use` block in an `assistant` message matching the same rule also fires the verdict.
- Timeout and nonzero-exit in detect mode are **run failures**, never "did not trigger" — an environment hang must not masquerade as measurement. (Deviation from run_eval.py, which lets timeout read as no-trigger; adjudicated in design review as the M4b-1 failure-philosophy carry-over.)
- `FakeRunner` helpers gain `detected(triggered: boolean)` producing a scripted completed result with `triggered` set; the whole suite stays tokenless.

## §7 Trigger stage (`test --run --triggers`)

### 7.1 Pipeline per query (ascending array order), per rep (1..TRIGGER_REPS)

1. **Input gate**: read `evals/triggers.json`; missing file, unparsable JSON, or validator diagnostics → stage fails with one error finding per problem, message `evals/triggers.json: <path> — <message>` (or `evals/triggers.json missing — required by --triggers` / `evals/triggers.json is not valid JSON` for the two non-validator shapes). No sessions spawned.
2. **Cache probe** (skip when `--fresh`): rep key `triggerKey = sha256(HARNESS_SCHEMA_VERSION \n skillHash \n trigger \n sha256(query) \n rep \n model)[:16]`; cache-hit iff `<runDir>/trigger.json` exists, parses, and its `query` text and `shouldTrigger` label match the current entry **verbatim** (fidelity gate; M4b-1 rubric-gate precedent). Anything else is a self-healing miss.
3. **Live rep** on miss: `triggerRunDir` wipes the rep dir and mounts the skill at `outputs/.claude/skills/<name>/` — no eval files, no preamble; prompt = the query **verbatim**; runner called with `detect: {skillName}`, `RUN_TIMEOUT_MS`, model. Artifacts written even on failure: `events.jsonl`, `transcript.md`. On success additionally `trigger.json`: `{query, shouldTrigger, rep, triggered, status: "ok", durationSeconds}` (key order pinned). Failed reps cache nothing.
4. **Failure handling**: timeout/nonzero-exit → single retry re-issuing the identical request (shared with nothing — trigger reps have no gate retries); second failure → error finding `trigger run failed (query <i>, rep <r>): <status> — <errorMessage or 'no detail'>`, the query's remaining reps are not attempted, and the stage **continues with the next query** — M4b-1 scenario-stage behavior verified in `llm-stages.ts`: failures accumulate as findings while remaining evals still run. A run-failed query is excluded from `queries: {passed, total}` (mirroring how grading totals count only graded evals); its error finding already forces stage failure and exit 1.

### 7.2 Scoring (all reps resolved)

- Per query: `rate = triggered_reps / TRIGGER_REPS`; pass = `should_trigger ? rate >= TRIGGER_PASS_THRESHOLD : rate < TRIGGER_PASS_THRESHOLD` (constants: `TRIGGER_REPS = 3`, `TRIGGER_PASS_THRESHOLD = 0.5` — run_eval.py defaults, majority at 3 reps).
- Stage accuracy = passed queries / measured queries (run-failed queries excluded, §7.1). Below `TRIGGER_ACCURACY_THRESHOLD = 0.8` → stage fails with **one error finding**: `trigger accuracy <acc> below threshold 0.8 (<P>/<Q> queries)`, acc 2-decimal. At or above: stage passes, findings empty. Severity is error — not warn — because test's exit code fires only on `summary.errors > 0` (verified in `src/cli/test.ts`), and a measured trigger failure must reach CI exactly like a failed grading expectation does (grading findings are error, `grader.ts`). **Design-review note: §1's presented draft said "warn"; corrected to error during spec self-review for this reason — flagged for user review.** TR02 *lint* stays warn (static presence checks are advisory; measured behavior is not).
- All arithmetic recomputed by the harness; nothing numeric is read back from any LLM output.

### 7.3 Report shapes (key orders contractual)

Executed: `{stage: 'trigger', status, findings, queries: {passed, total}, runs: [...]}` — runs entries `{queryIndex, shouldTrigger, triggered, reps, cached, status}` (queryIndex 0-based array position; `triggered` = reps that fired; `cached` = reps served from cache; `reps` = reps attempted; `status` = `'ok'` for a fully measured query, else the failing rep's `'timeout'`/`'nonzero-exit'`), array in queries order. Skipped (only possible shape: deterministic failed while `--triggers` passed): `{stage: 'trigger', status: 'skipped', note: 'deterministic stage failed'}`. Pretty summary tail appends ` · trigger: <P>/<Q> query(ies) accurate (<C> cached)` (C = total cached reps); the existing skip variants extend `scenario/grading` to `scenario/grading/trigger` when `--triggers` is active.

## §8 Bench pipeline

### 8.1 Run matrix and staging

For each eval × config × run_number: `benchKey = sha256(HARNESS_SCHEMA_VERSION \n skillHash \n <evalId> \n <config> \n <runNumber> \n model)[:16]`; run dir `<cacheRoot>/runs/<skillName>/<benchKey>/`.

- `with_skill`: exactly the M4b-1 executor semantics — mount + eval `files` staged + the pinned scenario preamble prompt.
- `without_skill`: same eval `files` staged (fixtures are task inputs, not skill hints), **no mount, no preamble** — prompt = the eval `prompt` verbatim.
- Both graded by the M4b-1 grader unchanged (same rubric, same gates, same shared retry budget, same atomic `grading.json`). Cache-hit gates identical (schema + rubric fidelity). Bench never reads or writes `test --run`'s scenario cache entries — the key inputs differ structurally, and samples stay independent by design.
- A run failing after its grader-side retry budget → bench aborts, exit 1, failed run uncached. Fail-fast here is deliberate and NOT the test-stage behavior (test stages continue and accumulate findings): `benchmark.json` requires the complete run matrix for its stats, so once a run is unrecoverable the document is unwritable and every further session would spend tokens on a doomed suite.

### 8.2 Stats and `benchmark.json`

`src/lib/harness/stats.ts`, pure functions over number arrays: `mean`, `stddev` (sample, n−1; 0 when n < 2), `min`, `max`.

Per run, `result` derives: `pass_rate` (recomputed from the grading document, 4-decimal), `passed`/`failed`/`total` (recomputed counts), `time_seconds` (runner `durationSeconds`, 2-decimal), `tokens` (input + output from usage), `tool_calls` (`total_tool_calls` from metrics), `errors` (`errors_encountered`).

Document (validated by `validateBenchmarkJson` **before** the atomic write — `.tmp` + `renameSync`; a validation failure is an internal error, exit 1, nothing written):

- `metadata`: `{skill_name, model, runs_per_configuration, harness_schema_version}` — **no timestamp**; cached replay must reproduce the document byte-identically at zero tokens.
- `runs`: ascending eval id, `with_skill` before `without_skill`, run_number ascending; entry keys `{eval_id, configuration, run_number, result}`; `eval_name`, `expectations`, `notes` omitted in v1 (schema-optional).
- `run_summary`: per config `{pass_rate: {mean, stddev, min, max}, time_seconds: {…}, tokens: {…}}` — pass_rate stats 4-decimal, time/tokens stats 2-decimal; `delta` strings = with_skill mean − without_skill mean, always signed: pass_rate `(+|-)D.DD`, time_seconds `(+|-)D.D`, tokens `(+|-)D` (integer) — formats match the schemas.md example (`"+0.50"`, `"+13.0"`, `"+1700"`).

Location: `<cacheRoot>/runs/<skillName>/bench-<suiteKey>/benchmark.json`, `suiteKey = sha256(HARNESS_SCHEMA_VERSION \n skillHash \n bench-suite \n model \n <runs>)[:16]`. Also printed to stdout with `--json` (the document verbatim); pretty output:

```
bench <skill_name> · model <model> · <N> run(s)/config
  with_skill      pass_rate <mean> ±<stddev> · time <mean>s · tokens <mean>
  without_skill   pass_rate <mean> ±<stddev> · time <mean>s · tokens <mean>
  delta           pass_rate <Δ> · time <Δ>s · tokens <Δ>
<C>/<T> run(s) cached
```

Exact bytes pinned by formatter tests in the plan (M4b-1 pretty precedent).

## §9 Hardening (reviewer follow-ups folded in)

- **`skill_name` path safety**: the deterministic stage gains one cross-document check — `skill_name` must be a safe path segment (regex `^[A-Za-z0-9][A-Za-z0-9._-]*$`, no `/`, no `\`, not `.`/`..`) → error finding `skill_name must be a safe path segment` when violated. Since the deterministic stage gates both `test --run` and `bench`, no unsafe name ever reaches `runDir`/mount composition. Defense-in-depth: run-dir helpers additionally throw on separator-bearing names (internal error, never expected to fire). The same check applies to `triggers.json`'s `skill_name`? No — `triggers.json.skill_name` is never used in path composition; it gets the existing cross-document consistency check instead: trigger stage fails with `evals/triggers.json: skill_name — must match evals.json skill_name` when they differ.
- **Grader-retry observability**: when the shared retry budget was consumed, `grading.json`'s `timing` gains `grader_retries` (integer ≥ 1) and `grader_retry_causes` (string array, e.g. `["gate: invalid grading (…)"]`); both absent when no retry occurred — existing cached documents remain valid, replay unaffected.
- **Executor workspace isolation (A2)**: **explicit non-goal** (§13) — remains a documented risk. The README/HARNESS warning ("never point `--run` at untrusted third-party skills; runs use `--dangerously-skip-permissions`") extends verbatim to `bench` and `--triggers`.

## §10 Frozen surfaces

Unchanged and pinned by regression tests: lint CLI + lint JSON v1 (byte-identical, TR02 additions flow through the existing engine only for skills that trigger the rule); `test` output without `--triggers` (byte-identical to M4b-1, both JSON and pretty); `profiles/default.yaml` except the one added `TR02:` line; scenario/grading stage contracts; `evals.json`/`grading.json`/`benchmark.json` schemas (M4a types untouched — bench *produces* what M4a validates); `HARNESS_SCHEMA_VERSION` stays 1 (new key namespaces are additive; no existing cache entry changes meaning).

## §11 Tokenless test plan

All via `FakeRunner`/stub-`/bin/sh` (no live tokens anywhere in `bun test`):

- `validateTriggersJson`: valid → `[]`; non-object root; missing/empty `skill_name`; unknown root key; empty/missing `queries`; empty `query`; non-boolean `should_trigger`; unknown entry key — diagnostics in pinned order.
- TR02 rule: the four finding shapes + clean-silent + single-finding cap + `minQueries` profile override.
- Runner detect mode (stub sh emitting stream-json): Skill tool_use naming the skill → `triggered: true` + early process-group kill verified (orphan-reaping stub pattern from M4b-1); clean completion without detection → `triggered: false`; Read of the mounted SKILL.md path → `true`; unrelated tool_use → no verdict; timeout → status `timeout`, `triggered` absent.
- Trigger stage: majority scoring (2/3 passes positive, 1/3 fails; inverse for negatives); accuracy threshold finding at exactly 15/20 vs 16/20; cache write/replay (second run zero runner calls, identical report); fidelity-mismatch self-heal (edited query text re-runs); `--fresh` bypass; failed-rep retry, then continue-to-next-query with the failed query excluded from `{passed, total}` and its runs entry carrying the failure status; missing/invalid triggers.json findings; skill_name-mismatch finding; skipped-on-deterministic-failure shape.
- Bench: full matrix ordering (runner receives with_skill run 1..N then without_skill per eval, ascending); prompt shapes (preamble present/absent); stats against hand-computed fixtures (incl. n=1 → stddev 0); golden `benchmark.json` byte-compared AND passed through `validateBenchmarkJson`; delta signs (positive, negative, zero → `+0.00`); replay byte-identical at zero runner calls; run failure → exit 1, no document; deterministic gate → exit 2, zero runner calls.
- CLI: `--triggers requires --run` guard; bench `--runs` guards (missing value, `0`, `-1`, `1.5`, non-numeric); unknown-option fail-loud; keystone byte-identity re-pins for flagless `test`.
- Formatters: trigger stage JSON key order; pretty tail variants; bench pretty bytes.
- using-shakespii weld: existing anchors plus new-section anchors (§12).

## §12 Companion skill — using-shakespii v0.5.0

- `evals/triggers.json` authored for using-shakespii: **20 queries — 12 positive, 8 near-miss negatives** (negatives = adjacent-but-wrong: generic linting/testing/code-review asks that must NOT pull the skill). This is the trigger calibration target.
- SKILL.md v0.5.0: new subsections teaching `shakespii bench` and `test --run --triggers` loops; description untouched unless calibration adjudication says otherwise (recorded-never-applied discipline).
- **Binding sequencing rule** (M4b-1 precedent): (1) author `triggers.json` → (2) commit predictions → (3) trigger + bench sweeps → (4) cache proofs → (5) only then v0.5.0 SKILL.md body edits (body edits change `skillHash` and would invalidate the proofs). Lint stays zero-findings; weld tests re-pinned with the version bump.

## §13 Non-goals

- Description-optimizer loop (train/test split, rewriting) — M5 writer.
- Executor workspace isolation/sandboxing — documented risk, M5-or-later.
- Parallel run execution — sequential only; revisit with evidence of need.
- `without_skill` mode for `test --run`; benchmark gating semantics (bench measures, never fails on deltas).
- Writing any artifact into any skill directory; touching `~/.claude/skills/` (read-only until M5 migration).
- `eval_name`, `expectations`, `notes` population in `benchmark.json` (schema-optional, omitted v1).

## §14 Calibration (adjudication 5: both, full)

CALIBRATION-M4B2.md, M4b-1 protocol verbatim: predictions committed in a separate commit before any sweep; sweeps live-token — (1) bench on `tests/fixtures/harness/compress` (3 evals × 2 configs × 3 runs = 18 sessions + 18 gradings), (2) triggers on `skills/using-shakespii` (20 queries × 3 reps = 60 detect sessions); actuals verbatim; deviations adjudicated as harness bug / miscalibration / eval-authoring miss; eval or query rewordings recorded, never applied in-phase; cache proofs (bench re-run byte-identical at zero tokens; trigger re-run fully cached). Long-running sweeps execute in the controller's own background shell, never a subagent's (M4b-1 lifecycle gotcha).

## §15 Documentation plan

HARNESS.md: bench + trigger sections (contracts, key formulas, artifacts layout). LINT-RULES.md: TR02 implemented note + evidence amendment (measure-only adjudication, run_eval.py defaults). ROADMAP.md: M4b-2 ticked on completion. README.md: bench bullet. All dual-location (repo `docs/` + `~/.ai-pref-nsync/local-docs/ai-shakespii/`), cmp-verified.
