# shakespii test harness — contract

Status: M4b-1, M4b-2, and M5a shipped (deterministic + scenario + grading +
trigger stages; scenario/grading are opt-in via --run, trigger additionally
behind --triggers; benchmarking is a separate `bench` subcommand). M5a added
executor isolation (`--setting-sources project,local`, every runner
session), post-hoc contamination scanning (scenario/trigger/bench), the
`RUN_CACHE_VERSION` epoch (now 2), `grader-fail-<attempt>.md` observability
artifacts, and the `SETTLE_OUTER_BOUND_MS` shutdown bound — see Executor
isolation contract and Contamination scanning below. Upstream schema
authority: skill-creator `references/schemas.md` (pinned evidence, vintage
2026-07 — see profiles/default.yaml provenance).

## Stage pipeline

`shakespii test <path> [--json] [--run] [--fresh] [--model <name>] [--triggers]`
runs up to four stages, always in this order: `deterministic`, `scenario`,
`grading`, `trigger`.

- Without `--run`, scenario/grading report
  `status: "skipped", note: "pass --run to execute LLM stages"` and the
  command is free — no LLM calls, ever. TR01/TR02 (lint) delegate to the
  deterministic stage only; lint never spends tokens.
- With `--run`, each eval case is executed headlessly (`claude -p`,
  stream-json, model default `sonnet`, 300s timeout per LLM call) and then
  graded by a second LLM call. If the deterministic stage produced errors,
  scenario/grading (and trigger, if `--triggers` is set) report
  `status: "skipped", note: "deterministic stage failed"` — an invalid
  suite never burns tokens. Deterministic warnings alone do not block.
- `--fresh`, `--model`, and `--triggers` all require `--run` (usage error,
  exit 2, otherwise).
- The `trigger` stage only appears in the report at all when `--triggers`
  is passed — without it, `stages` is exactly the M4b-1 three-element
  array, byte-identical to pre-M4b-2 output (JSON and pretty).

Exit codes: 0 — no error findings (warnings allowed); 1 — at least one
error finding (failed expectations, executor/grader/trigger failures
included); 2 — run error only (bad usage, unreadable target, `claude` CLI
not spawnable, unexpected exception).

**Permissions bypass — accepted risk.** The executor runs
`claude -p --dangerously-skip-permissions` inside a disposable per-run
workspace. `--run`, `bench`, and `--triggers` all spawn it the same way.
This is opt-in, intended for the user's own trusted skills; the workspace
cwd is containment by convention, not a sandbox — a malicious skill could
escape via Bash. Do NOT point `--run`, `bench`, or `--triggers` at
untrusted third-party skills.

## test-JSON v1

Top-level key order is contractual: `version, mode, skill, stages, summary`.
Findings: `severity, message, file, line` (no ruleId; schema-path detail is
folded into `message`). Executed scenario stage: `stage, status, findings,
runs` with runs entries `evalId, cached, status, durationSeconds`
(`status` ∈ ok | timeout | nonzero-exit | no-result). Executed grading
stage: `stage, status, findings, expectations` with `expectations`
`{passed, total}` counting graded expectations across cold and cached
cases. Executed trigger stage: `stage, status, findings, queries, runs`
with `queries` `{passed, total}` (see the Trigger stage section below for
the full shape and semantics). Skipped stages: `stage, status, note`.
`summary` counts all findings across stages. The `trigger` element is
present in `stages` only when `--triggers` was passed.

## Executor

Per eval case (sequential, ascending id): runKey → run dir; cache check;
cold path stages a workspace (`outputs/`): the skill mounted at
`outputs/.claude/skills/<skill_name>/`, each eval `files` entry copied at
its skill-relative path. Prompt: force-load preamble ("Read
.claude/skills/<name>/SKILL.md first…") plus the eval prompt verbatim —
scenario evals measure capability with the skill; natural triggering is
TR02's concern, measured separately by the trigger stage below. Executor
failures (timeout / nonzero-exit / completed with no result event) become
scenario error findings; the case is not graded and stays uncached.

## Executor isolation contract

Every runner session — scenario executor, trigger probe, bench (both
`with_skill` and `without_skill`), and the grader — spawns `claude` with
the same contractual argv (spec §3.1):

`claude -p <prompt> --output-format stream-json --verbose --dangerously-skip-permissions --model <model> --setting-sources project,local [--include-partial-messages]`
— the `--setting-sources project,local` pair sits after the `--model` pair
and before the conditional `--include-partial-messages`. Uniform policy:
every runner session (scenario, trigger, bench both configs, grader) gets
it — there is no code path in `spawnClaudeRunner` (`src/lib/harness/
claude-runner.ts`) that omits it.

**What isolation buys — spike-proven (docs/CALIBRATION-M5A.md, spike
evidence, run 2026-07-09).** `--setting-sources project,local` excludes
user-level SKILLS and PLUGINS from the session: an unflagged control run's
init event lists the user-global `compress` skill and invokes it; a
flagged run's init event omits it and never invokes it; a project-level
skill mount (`.claude/skills/<name>/SKILL.md` inside the run's own cwd)
still loads and is invoked under the flag; OAuth auth (no
`ANTHROPIC_API_KEY`) is unaffected. This is the mechanism behind the M5a
bare-baseline decontamination: the compress bench `without_skill` pass_rate
mean dropped from the M4b-2-contaminated 1.0 to 0.7222 once the
user-global `compress` skill stopped answering for bare runs, and a
retro-scan of the archived M4b-2 corpus flags 9/9 bare run dirs as having
invoked it (docs/CALIBRATION-M5A.md).

**Memory-file scope — version-dependent, re-verify after CLI upgrades.**
At M5a (2026-07-09), `--setting-sources project,local` did **not** exclude
the user memory file: docs/CALIBRATION-M5A.md adjudication 2 traced
`~/.claude/CLAUDE.md` entering isolated sessions (a scenario transcript
opening with a ToolSearch for a select string that appears verbatim in
that file and nowhere in the mounted skill), and its ask-before-acting
rules stalled headless single-turn sessions (adjudication 7 — 10/21
scenario-grading expectation failures across evals 1, 2, 6). The M5b
hermeticity spike (docs/HERMETICITY.md, claude CLI 2.1.202) found this
leak no longer reproduces: a paired canary probe quotes the memory file
verbatim without the flag and returns NONE with it, so the shipped argv
now excludes the user memory file on the current CLI. No runner change
was made and the cache epoch stayed at 2. Because the observed behavior changed
between the M5a trace and the M5b probe (the M5a-era CLI version was not
recorded), treat it as version-dependent: re-run the
HERMETICITY.md probe after major CLI upgrades before trusting
memory-sensitive results.

**Stream-drain bound.** After the child process exits (or is killed by a
timeout or an early trigger-detect verdict), a pending stdout/stderr
`ReadableStream` read is given `DRAIN_GRACE_MS` (2000ms) to settle before
the reader is force-cancelled; the whole settle-then-cancel sequence is
itself bounded by `SETTLE_OUTER_BOUND_MS` (10000ms,
`src/lib/harness/claude-runner.ts`), after which the caller receives the
fallback value regardless of reader state. This exists because a detached
process group that has been `SIGKILL`ed more than once within the same Bun
runtime has been observed to leave its pipe readers hanging past EOF — the
outer bound guarantees a runner session can never hang the harness
indefinitely, even when the drain-then-cancel path itself misbehaves.

## Contamination scanning (`src/lib/harness/contamination.ts`)

A pure post-hoc scan (spec §4) run against a session's persisted
`events.jsonl` (cached-replay path) or its in-memory events (live path)
after every runner call except the grader — grader sessions are isolated
but never scanned. Semantics: every assistant-event `Skill` tool_use
invocation whose exact `input.skill` name is not in the caller-supplied
`allowed` list is a hit; the scan reads full assistant messages only
(`stream_event` partials exist only in detect-mode trigger probes and
would double-count a still-streaming invocation) and is tolerant of
malformed events — it skips what it can't parse rather than throwing.

**Allowed sets (spec §4.2).** scenario / trigger / bench `with_skill` →
`[<target skill name>]`; bench `without_skill` → `[]`. Any `Skill`
invocation outside the allowed set is a hit — whether it's a user-level
skill the isolation flag failed to exclude, or (in `without_skill` runs)
the target skill itself somehow getting mounted.

**Three contractual message formats (spec §4.3) — exact strings, no
paraphrase:**
- scenario: `contamination: session invoked non-target skill "<skill>" (<count> invocation(s)) [eval <id>]` — `HarnessFinding` `severity: 'warn'`, `file: 'evals/evals.json'`, `line: null`.
- trigger: `contamination: session invoked non-target skill "<skill>" (<count> invocation(s)) [query <n> rep <r>]` — `severity: 'warn'`, `file: 'evals/triggers.json'`, `line: null`.
- bench (a plain string, not a `HarnessFinding` — `benchmark.json` has no findings array): `warn contamination: <config> eval <id> run <n> invoked non-target skill "<skill>" (<count> invocation(s))`.

**Warnings never flip status (spec §4.3).** Scenario and trigger stage
`status` derives from `severity === 'error'` findings only — a
contamination warning never turns a clean run's `status` to `'fail'`.
Clean runs (zero contamination, zero other findings) produce reports
byte-identical to M4b-2 output; the `contamination` finding class is
strictly additive, both stages measured zero contamination warnings in
the M5a sweep (docs/CALIBRATION-M5A.md).

**Bench and `bench --json` stdout purity.** Bench accumulates contamination
hits into a `warnings: string[]` returned alongside the document, not into
`benchmark.json` itself. Pretty mode (`formatBenchPretty`) appends them as
trailing lines; `--json` mode writes every warning to **stderr** (one
`console.error` per warning, `src/cli/bench.ts`) before printing the
pretty-printed `benchmark.json` to stdout — `bench --json`'s stdout stays
byte-pure (frozen surface, spec §11) no matter how many contamination
warnings fire.

**Ad hoc retro-scan.** The same `scanContamination`/`readPersistedEvents`
functions can be pointed at any archived run directory after the fact —
used this way (not as a shipped CLI feature) during the M5a calibration
sweep to retro-scan the M4b-2 corpus: 9/9 archived bare run dirs flagged
contamination by `compress` (docs/CALIBRATION-M5A.md), confirming the
M4b-2 baseline was fully contaminated, not just the three
transcript-verified runs documented at the time.

## Grader

Second `claude -p` call, cwd = the run dir. The grader reads transcript.md
and outputs/ and replies with JSON; the harness validates
(`validateGradingJson` + rubric fidelity: expectation texts verbatim, same
count and order) and persists. One retry (shared budget across gate and
runner-level failures — at most two grader calls per case); the summary is
recomputed by the harness (LLM arithmetic is never trusted); grading.json
is written atomically (tmp + rename). Grading findings: one error per
failed expectation, quoting the text and the grader's evidence.

**`grader-fail-<attempt>.md` artifacts.** Whenever a grader reply fails the
schema/rubric-fidelity gate (`kind: 'gate'` — invalid JSON, wrong
expectation count, or expectation text mismatch), the raw reply is
persisted verbatim to `grader-fail-1.md` (first attempt) or
`grader-fail-2.md` (retry attempt) in the run dir before the retry (or the
final failure) proceeds — closing the observability gap where a bad
grader reply was previously visible only in the failure message's
truncated summary. Written only for gate failures, not for runner-level
failures (timeout, nonzero-exit, no-reply) — those have no reply text to
persist.

## Trigger stage (`test --run --triggers`, `src/lib/harness/trigger-stage.ts`)

Measures whether the skill's `name` + `description` actually make Claude
invoke it — the natural-triggering half TR02 exists to guard, separate
from scenario's "does it work once mounted" question.

**Precondition and input gate.** Requires the deterministic stage to have
run clean (same precondition as scenario/grading). Given that, the stage
reads `evals/triggers.json` through a fixed gate, first failure wins (all
findings `severity: error`, `file: 'evals/triggers.json'`, `line: null`):
missing from the inventory → `evals/triggers.json missing — required by
--triggers`; unreadable (oversized/binary) or unparsable → `evals/triggers.json
is not valid JSON`; schema-invalid → one `evals/triggers.json: <path> —
<message>` finding per `validateTriggersJson` diagnostic; `skill_name`
mismatched against `evals/evals.json` → `evals/triggers.json: skill_name —
must match evals.json skill_name`. Any gate failure short-circuits before
any LLM call — `queries: {passed: 0, total: 0}`, `runs: []`.

**Reps, majority scoring, accuracy.** Constants:
`TRIGGER_REPS = 3`, `TRIGGER_PASS_THRESHOLD = 0.5`,
`TRIGGER_ACCURACY_THRESHOLD = 0.8`. For each query (in document order):
run up to 3 reps, each cache-checked independently via `triggerKey`; a
live rep stages a run dir (the full skill directory — SKILL.md plus every
inventory file, evals included — mounted at
`outputs/.claude/skills/<skill_name>/`; no per-case fixture staging, no
force-load preamble — the prompt is the query verbatim, because injecting
a preamble would defeat the measurement) and calls the runner with
`detect: { skillName }` (see Runner detect mode below). Per query: `rate =
fired / 3`; the query passes if `should_trigger ? rate >= 0.5 : rate <
0.5`. A query's accuracy only counts once all 3 reps complete; `queries.total`
(`measured`) excludes queries that hit a run failure. Suite-level
`accuracy = passed / measured` (skipped entirely, no finding, when
`measured === 0`); below `TRIGGER_ACCURACY_THRESHOLD` it becomes a finding
`trigger accuracy <acc> below threshold 0.8 (<P>/<Q> queries)` (`acc` =
`toFixed(2)`).

**Failure semantics.** A rep gets exactly one retry (identical query,
workspace restaged first). If still not `completed`, the query is
abandoned immediately — no further reps for it — with finding `trigger
run failed (query <i>, rep <r>): <status> — <errorMessage or 'no detail'>`
(`i` 0-based query index), and the loop continues to the next query. That
query is excluded from `{passed, total}` but still appears in `runs` with
its partial `triggered`/`reps`/`cached` counts and `status` ∈
`timeout | nonzero-exit`. A timeout or nonzero-exit is a run failure, not
evidence the skill "didn't trigger" — it is never folded into the
fired/not-fired tally.

**`triggerKey` and cache.** The trigger stage keys on ROUTING inputs, not
full content: `skillRoutingHash` = sha256 of frontmatter `name` + NUL +
`description`, the only inputs the model sees before deciding to invoke
(the picker entry). `triggerKey({skillHash, query, rep, model})` = first
16 hex of
`sha256("2\n<skillRoutingHash>\ntrigger:nd\n<sha256hex(query)>\n<rep>\n<model>")`
— the leading `2` is `RUN_CACHE_VERSION` (see Run-dir and cache below),
and the `trigger:nd` tag keeps this keyspace disjoint from the legacy
full-content `trigger` scheme (superseded 2026-07-13 with NO version bump:
scenario/bench keys keep `skillContentHash` because those sessions read
the whole mounted skill; old trigger dirs stay on disk, ignored; every
skill re-buys its matrix once under the new scheme). Body edits, `version`
bumps, and eval-suite edits therefore replay trigger caches; only
`name`/`description` edits re-buy. Cache gate (`readValidCachedTrigger`):
`trigger.json` must exist, parse, its `query` must match the current query
verbatim, and `triggered` must be a boolean — anything else is a
self-healing miss (same pattern as `grading.json`). The stored
`shouldTrigger` is write-time provenance only: the observation is
expectation-independent, so flipping a query's `should_trigger` label
replays the cached observation and merely re-scores it against the new
expectation.

**Artifacts.** `<cacheRoot>/runs/<skillName>/<triggerKey>/` holds
`events.jsonl` (raw stream-json), `transcript.md`, and `trigger.json`
(written only for a completed rep). `trigger.json` key order is
contractual: `query, shouldTrigger, rep, triggered, status,
durationSeconds`.

**Report shape.** `{ stage: 'trigger', status: 'pass' | 'fail', findings,
queries: { passed, total }, runs }`. `runs` entries (`TriggerRunMeta`):
`queryIndex, shouldTrigger, triggered, reps, cached, status` — note
`triggered` here is the **fired-rep count for the query** (0–3), not the
per-rep boolean stored in `trigger.json`; the two use the same field name
at different granularities. `status` ∈ `ok | timeout | nonzero-exit`.
`status: 'fail'` iff `findings.length > 0` (gate failure, any rep failure,
or accuracy below threshold).

**Pretty summary.** Appended only when `--triggers` was passed and the
stage isn't skipped: `` · trigger: <P>/<Q> query|queries accurate (<C>
cached)`` (house pluralization: `query` iff `Q === 1`; `<C>` sums `cached`
across every run entry, including failed/excluded queries). Skip variant
when `--triggers` is set and the deterministic stage failed:
`scenario/grading/trigger skipped (deterministic stage failed)`.

**Runner detect mode and the run_eval.py deviations.** Detection is ported
from skill-creator's `run_eval.py` (`src/lib/harness/detect.ts`) with two
adjudicated deviations (spec §6, per the module's own docstring):
- **Verdict fires at `content_block_stop`/`message_stop`, not mid-delta.**
  `partial_json` fragments for a pending `Skill`/`Read` tool_use are
  accumulated and only evaluated once the block (or the message) closes —
  a substring match against a half-streamed JSON fragment would false-fire.
- **An unrelated first tool_use does not end the scan.** Unlike
  `run_eval.py`'s "first tool decides" behavior, an initial `Bash` (or any
  non-`Skill`/non-`Read`) call leaves the detector watching; a later
  `Skill`/`Read` call in the same transcript can still fire the verdict.

Two further spec §6 provisions, not counted among the module's "two
deviations" but load-bearing for correctness:
- **`Read` fires only on a `file_path` ENDING in the mounted
  `.claude/skills/<name>/SKILL.md`** — an exact-suffix `endsWith` check on
  the parsed tool input, not a substring match. `.../SKILL.md.bak` and a
  longer nested path like `.../SKILL.md/notes.txt` must NOT count.
- **Timeout ≠ no-trigger** (runner-level, not part of the detector itself).
  A timed-out or nonzero-exit probe carries no `triggered` field at all
  (`RunnerResult.triggered` is present iff `detect` was requested AND
  `status === 'completed'`) — the trigger stage treats it as a run failure
  (see Failure semantics above), never as "the skill did not trigger."

On verdict, the runner kills the whole process group early (`--include-
partial-messages` streaming + `SIGKILL` on the group) rather than waiting
out the full turn — reps stay fast even when the model would otherwise
keep working after invoking the skill.

## Bench (`shakespii bench <path> [--json] [--runs <n>] [--model <name>] [--fresh]`, `src/lib/harness/bench.ts`)

A separate subcommand (not a `test` stage): benchmarks a skill's effect on
capability by running the same eval suite twice per case — once with the
skill mounted, once without — over multiple repetitions, and reports
pass-rate/time/token deltas.

**Deterministic gate.** Stricter than `test --run`: `bench` requires **zero
deterministic findings of any severity** (warnings included, not just
errors) before it will spend a token. On any finding: findings printed to
stderr (`harnessFindingLines`), then `bench requires a valid eval suite —
fix the findings above first`, exit 2.

**Matrix and staging.** For each eval case (ascending `id`), for each
configuration in `['with_skill', 'without_skill']` (that order), for
`runNumber` 1..`options.runs` (default `BENCH_DEFAULT_RUNS = 3`):
- `with_skill` — identical to the M4b-1 scenario executor: `stageRunDir`
  mounts the skill at `outputs/.claude/skills/<skill_name>/`, copies the
  eval's `files`, and the prompt is `buildExecutorPrompt` (force-load
  preamble + eval prompt).
- `without_skill` — `stageBareRunDir`: the eval's `files` are copied as
  plain task inputs with **no skill mount at all**, and the prompt is
  `evalCase.prompt` **verbatim**, no preamble — the eval files are inputs
  to the task, not a hint that a skill exists.

**Run-failure contract.** Executor: one retry (identical request, restage
first) if `status !== 'completed'` OR the final assistant text is
unextractable; if still bad, `bench run failed (eval <id>, <config>, run
<n>): executor <status> — <errorMessage or 'no result event'>` (`<status>`
∈ `timeout | nonzero-exit | no-result` — `no-result` is a completed run
with no extractable text). On executor success, grading reuses the M4b-1
grader (`gradeCase`) with its own shared retry budget; a grader failure
surfaces as `bench run failed (eval <id>, <config>, run <n>):
<graded.failure>` — the grader's failure string verbatim, no `executor`
prefix. Either failure **aborts the whole suite immediately** (fail-fast):
`runBenchSuite` returns on the first bad run, no partial `benchmark.json`
is ever written, and the failed run's `grading.json` is never written (so
it stays an uncached miss). Failure surfaces on **stdout**, exit 1; with
`--json` the only stdout is the single-line `{"error":"<message>"}`.

**Result derivation.** `deriveBenchResult` turns a `grading.json` into a
`BenchmarkRun.result` — the same derivation for live and cached runs
(replay byte-identity by construction): `pass_rate` (round4), `passed`,
`failed`, `total`, `time_seconds` (round2, from
`timing.executor_duration_seconds`), `tokens` (input + output, unrounded
integer sum), `tool_calls`, `errors`. `null` (a field missing or non-
numeric) is treated as an underivable, self-healing cache miss — mirrors
the `grading.json` cache-hit gate.

**Stats.** Samples are pooled **per configuration across every eval case
and run** (not per-eval-case): `pass_rate` stats use 4-decimal rounding,
`time_seconds`/`tokens` stats use 2-decimal rounding; each stat object is
`{mean, stddev, min, max}`. `stddev` is sample standard deviation (n−1
denominator), `0` when n < 2 (`src/lib/harness/stats.ts`). Deltas
(`with_skill.mean − without_skill.mean`, computed from the already-rounded
stored means) are always signed: `pass_rate` `(+|-)D.DD`, `time_seconds`
`(+|-)D.D`, `tokens` `(+|-)D` (rounded to an integer); a zero delta renders
`+0.00` / `+0.0` / `+0`.

**`benchKey`/`suiteKey`.** `benchKey({skillHash, evalId, config, runNumber,
model}) =` first 16 hex of `sha256("2\n<skillHash>\n<evalId>\n<config>\n<runNumber>\n<model>")`
— 6 segments, structurally distinct from `runKey`'s 4; `bench` never reuses
a `test --run` scenario cache entry, even for the same skill/eval/model.
`suiteKey({skillHash, model, runs}) =` first 16 hex of
`sha256("2\n<skillHash>\nbench-suite\n<model>\n<runs>")`. Both leading `2`s
are `RUN_CACHE_VERSION` (see Run-dir and cache below).

**Document.** Written to `<cacheRoot>/runs/<skillName>/bench-<suiteKey>/benchmark.json`
(atomic: tmp + rename) after `validateBenchmarkJson` passes — a failure
there is an internal bug, not a user-facing bench failure:
`internal: benchmark document failed validation (<path>: <message>)`,
stdout, exit 1, nothing written. Key order: `metadata` (`skill_name,
model, runs_per_configuration, harness_schema_version` — **no timestamp**,
so replaying the identical suite/model/runs combination against an
unchanged skill reproduces a byte-identical document), `runs` (`eval_id,
configuration, run_number, result`), `run_summary` (`with_skill,
without_skill, delta`).

**Exit codes.** 0 — `benchmark.json` written and printed (pretty or
`--json`). 1 — a run failed, or the internal validation failure above.
2 — usage errors (bad flags, non-directory target, missing `SKILL.md`),
the deterministic gate, or an uncaught exception (`bench failed: <msg>`,
mirrors `test failed: <msg>`).

## Run-dir and cache (`src/lib/harness/run-dir.ts`)

- Cache root: `SHAKESPII_CACHE_DIR`, else `$XDG_CACHE_HOME/shakespii`,
  else `~/.cache/shakespii`. The harness never writes inside a skill dir.
- `skillContentHash`: sha256 over SKILL.md raw bytes plus every inventory
  file's (relPath, raw bytes), sorted; any byte change rotates the hash.
- `runKey({skillHash, evalId, model})`: first 16 hex of
  `sha256("2\n<skillHash>\n<evalId>\n<model>")` — the leading `2` is
  `RUN_CACHE_VERSION`.
- Layout: `<root>/runs/<skillName>/<runKey>/` holds `outputs/` (workspace:
  skill mount, staged files, agent artifacts, `metrics.json`),
  `events.jsonl` (raw stream-json), `transcript.md`, `timing.json`, and
  `grading.json` — written last, only after validation.
- **Cache-hit definition: `grading.json` exists under the runKey AND
  passes schema + rubric-fidelity validation against the current case.**
  A missing, unparseable, schema-invalid, or rubric-mismatched file is a
  self-healing miss. Cached replay derives identical findings
  deterministically at zero token cost.
- **`RUN_CACHE_VERSION` vs `HARNESS_SCHEMA_VERSION` — two independent
  version numbers, spec §5.** `RUN_CACHE_VERSION` (currently 2, bumped in
  M5a from 1) is the comparability epoch of cached runs: it is the leading
  segment hashed into all four run keys (`runKey`, `triggerKey`,
  `benchKey`, `suiteKey`) and bumps whenever executor session semantics
  change in a way that makes old and new runs non-comparable — M5a bumped
  it because `--setting-sources project,local` isolation changes what a
  session can see and do, so a run cached under epoch 1 must never be
  treated as a valid replay of an epoch-2 request. Old epoch-1 run dirs
  are not deleted; they simply stop matching any key and sit on disk,
  orphaned. `HARNESS_SCHEMA_VERSION` (currently 1, unchanged by M5a) is a
  different thing entirely: the version of the OUTPUT documents
  (`benchmark.json` metadata, the grading contract), and it lives only in
  `benchmark.json`'s `metadata.harness_schema_version` field — it is not
  hashed into any cache key. Eval runs are on-demand and cached — never
  per-commit.

`triggerKey`/`benchKey`/`suiteKey` share this module and its `SAFE_SEGMENT`
skill-name guard (defense in depth — the deterministic stage already
rejects an unsafe `skill_name` before any run dir is composed); see the
Trigger stage and Bench sections above for their formulas and layouts.
`validateBenchmarkJson` (`src/lib/evals/validate.ts`) encodes the
`benchmark.json` shape that the Bench section documents in full.
