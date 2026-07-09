# M5a — Harness hardening + executor isolation — Design

Date: 2026-07-09. Status: approved design (brainstorm 2026-07-09), pending plan.
Canonical: `~/.ai-pref-nsync/local-docs/ai-shakespii/specs/`; repo mirror: `docs/specs/`.

## §0 Adjudications (user decisions, 2026-07-09)

1. **M5 order.** M5 splits into: **M5a** harness hardening + executor isolation (this
   spec) → **M5b** writer-as-skill → user dogfoods the writer (audit + author needed
   skills) → **M5c** install gate + npm publish → **M5d** personal-skill migration.
   The ai-cortex promotion path stays parked (writer-or-later; not decided here).
2. **Isolation approach: `--setting-sources project,local` + contamination detection
   guard.** `--bare` rejected (kills OAuth — auth becomes strictly
   `ANTHROPIC_API_KEY`; benchmarks a stripped agent, not a realistic one).
   Detection-only rejected (leaves the without_skill baseline contaminated; the
   measured M4b-2 problem would persist, merely visible).
3. **Scope: all six backlog items ride along** — grader prose tolerance,
   failed-grader-reply persistence, Skill-detection exact-match, settleWithGrace
   outer bound, bench test-hygiene minors, eval-5 rewording. The eval-5 rewording is
   applied **now** through the adjudication protocol (user override of the
   parked-with-migration default). The CALIBRATION-M4B1 **compress** rewordings
   remain parked with the M5d migration.
4. **Architecture: post-hoc scan (Approach A).** Contamination detection is a pure
   function over persisted `events.jsonl`, computed at stage/report time.
   Runner-integrated accumulation (Approach B) rejected: touches the streaming
   path (the harness's subtlest code), changes the runner return contract and
   cache format, and cannot scan pre-existing cached runs.

## §1 Goal

Make harness measurements trustworthy on real machines: executor sessions no longer
inherit the user's global claude environment (the measured M4b-2 contamination —
`without_skill` bench runs invoked the globally installed personal `compress` skill,
inverting the delta), residual contamination is detected and reported, and the
grader/runner/detector rough edges recorded in the M4b-2 backlog are closed. The
milestone ends with a calibration re-sweep proving the decontaminated baseline.

## §2 Evidence base (pinned)

- `docs/CALIBRATION-M4B2.md` adjudication 1: environment contamination, measured
  (transcripts show `Tool: Skill — {"skill":"compress"}` in three independent
  `without_skill` runs; `.original.md` convention traced to
  `~/.claude/skills/compress/SKILL.md` line 6).
- `docs/CALIBRATION-M4B2.md` adjudication 2: grader non-JSON reply rate ≈ 6 of ~24
  live calls; improvement candidates (a) prose-prefix tolerance, (b) failed-reply
  persistence — recorded there, implemented here.
- `docs/CALIBRATION-M4B2.md` adjudication 5: eval 5 timeout intermittence; rewording
  recorded there, applied here (§10).
- M4b-2 final-review parked list (`.superpowers/sdd/progress.md`, final-review
  entry): exact-match detection, settleWithGrace outer bound, bench test-hygiene
  minors, dead defensive branch.
- `claude --help` (verified 2026-07-09): `--setting-sources <sources>` —
  "Comma-separated list of setting sources to load (user, project, local)."

## §3 Executor isolation

### 3.1 Argv change

`spawnClaudeRunner` (`src/lib/harness/claude-runner.ts:44`) appends
`'--setting-sources', 'project,local'` to the fixed argv, after the `--model` pair
and before the conditional `--include-partial-messages`. Exact argv (contractual,
pinned by tests):

```
claude -p <prompt> --output-format stream-json --verbose
  --dangerously-skip-permissions --model <model>
  --setting-sources project,local
  [--include-partial-messages]   # detect mode only
```

The policy is **uniform**: every runner session gets the flag — scenario, trigger,
bench (both configurations), and grader. No per-stage exceptions.

Why this works: the run workspace is harness-created and contains only the staged
mount (`<workspace>/.claude/skills/<name>/`), so the surviving `project`/`local`
sources are trusted by construction; dropping `user` removes global personal
skills, user CLAUDE.md, and user-level plugins from the session.

The existing safety posture is unchanged and restated: never point `--run` /
`--triggers` / `bench` at untrusted third-party skills —
`--dangerously-skip-permissions` remains in the argv.

### 3.2 Feasibility spike (plan Task 1, live, controller-executed)

Three assertions, each a live `claude -p` probe run before any implementation task:

- (a) **Global exclusion:** a probe query that reliably invokes the user-global
  `compress` skill in an unflagged session produces **zero** Skill tool_use events
  under `--setting-sources project,local`.
- (b) **Staged skill loads:** a workspace with a project-level
  `.claude/skills/<name>/SKILL.md` still triggers that skill under the flag.
- (c) **Auth intact:** the flagged session completes normally on the machine's
  OAuth credentials (no `ANTHROPIC_API_KEY` in the environment).

Spike failure on any assertion **halts the milestone** for re-spec. Contingency
candidates recorded, not built: temp `CLAUDE_CONFIG_DIR` home; `--settings` with an
explicit minimal file.

## §4 Contamination scan

### 4.1 Scanner

New `src/lib/harness/contamination.ts`:

```ts
export interface ContaminationHit { skill: string; count: number }
export function scanContamination(events: unknown[], allowed: string[]): ContaminationHit[]
```

Pure function. Scans `type === 'assistant'` events only (present in every persisted
`events.jsonl`; `stream_event` partials exist only in detect-mode runs and would
double-count). For each `tool_use` content block with `name === 'Skill'` and a
string `input.skill`: a hit iff `input.skill` is not **strictly equal** to any
entry of `allowed`. Hits dedupe by skill name with counts, ordered by first
occurrence. Tolerant: non-record events/blocks and missing/non-string `input.skill`
are skipped, never throw.

### 4.2 Allowed sets and wiring

| Run kind | allowed |
|---|---|
| scenario (`test --run`) | `[<target skill name>]` |
| trigger rep | `[<target skill name>]` |
| bench `with_skill` | `[<target skill name>]` |
| bench `without_skill` | `[]` (any Skill invocation is contamination) |

Grader sessions receive isolation (§3) but are **not** scanned — they persist no
`events.jsonl`; grader observability is §6.2.

The scan is computed at stage/report assembly time from the in-memory events (live
run) or the persisted `events.jsonl` (cached replay) — never cached itself, so it
works retroactively on any run dir, including pre-M5a ones.

### 4.3 Reporting

Contamination findings are **warnings that never flip stage status**
(measure-and-warn):

- `test --run` / `--triggers`: appended to the existing per-stage `findings`
  arrays as `HarnessFinding` values — severity `'warn'`, `line: null`, `file`
  matching the stage convention (`'evals/evals.json'` for scenario,
  `'evals/triggers.json'` for trigger). Message formats (contractual):
  - scenario: `contamination: session invoked non-target skill "<skill>" (<count> invocation(s)) [eval <id>]`
  - trigger: `contamination: session invoked non-target skill "<skill>" (<count> invocation(s)) [query <n> rep <r>]`
- `bench` pretty output: one warning line per hit in the summary, format:
  `warn contamination: <config> eval <id> run <n> invoked non-target skill "<skill>" (<count> invocation(s))`.
- `bench --json`: warning lines (same format) go to **stderr**; stdout stays the
  byte-pure `benchmark.json` document. The skill-creator schema is untouched.

Clean runs produce zero findings — their reports stay byte-identical to M4b-2
output.

## §5 Cache-key versioning

Isolation changes session semantics; pre-isolation cached runs must never replay as
comparable. `run-dir.ts` splits the version roles:

- New exported `RUN_CACHE_VERSION = 2` — the comparability epoch of cached runs.
- `HARNESS_SCHEMA_VERSION` stays `1` — it remains the **output document** version
  (`benchmark.json` metadata `harness_schema_version`, grading contract). Doc
  comments updated to state the split.

All four key formulas swap the leading segment (everything else unchanged):

```
runKey     = sha256("2\n<skillHash>\n<evalId>\n<model>")[:16]
triggerKey = sha256("2\n<skillHash>\ntrigger\n<sha256hex(query)>\n<rep>\n<model>")[:16]
benchKey   = sha256("2\n<skillHash>\n<evalId>\n<config>\n<runNumber>\n<model>")[:16]
suiteKey   = sha256("2\n<skillHash>\nbench-suite\n<model>\n<runs>")[:16]
```

Old run dirs stay on disk, ignored. Tests pinning key literals/formulas get a
**sanctioned re-pin wave**, enumerated in the plan (the M4b-2 "never weaken an
assertion" rule holds; this is a sanctioned re-pin, listed file by file).

## §6 Grader hardening

### 6.1 `extractGraderJson` prose tolerance

Current behavior (`grader.ts:51`): trim → unwrap one fenced block → `JSON.parse`,
else `undefined`. New fallback, applied only when that parse fails: find the first
`{` and the last `}` in the unwrapped body; if both exist in order, `JSON.parse`
the inclusive slice; on success return the value, else `undefined`. Outermost-brace
slicing handles the observed live shapes (prose prefix, prose suffix, both) and is
safe for nested braces. Retry prompt, gates, retry-cause strings, fail-fast, and
uncached-failure semantics are all unchanged.

### 6.2 Failed-reply persistence

Each grader attempt whose reply fails extraction or gating writes the raw reply
verbatim to `<runDir>/grader-fail-<attempt>.md` (attempt ∈ {1, 2}) before the
retry / fail-fast proceeds. Consequences: a recovered retry leaves
`grader-fail-1.md` beside the successful `grading.json`; a double failure leaves
both fail files and still writes no `grading.json`. Observability only — no
behavior change.

## §7 Skill-detection exact-match

`detect.ts` `matches()` Skill branch becomes parse-then-exact, mirroring the Read
branch:

- Primary: `JSON.parse(inputText)`; fire iff `typeof input.skill === 'string' &&
  input.skill === skillName`.
- Fallback (unparsable accumulation): `inputText.includes('"skill":"' + skillName + '"')`
  — key+value needle with closing quote, so `compress` no longer fires on
  `compress-v2`. Whitespace-variant JSON escapes the fallback by design; the parse
  path is primary.

Verdict timing (block stop / message stop), early-kill, and the Read branch are
unchanged. The contamination scanner (§4) shares the strict-equality semantics via
parsed assistant events (no fallback needed there).

## §8 settleWithGrace outer bound

Current shape (`claude-runner.ts:98`): 2 s grace → `reader.cancel()` → unbounded
`await work`; a cancel that itself hangs would hang the run. New constant
`SETTLE_OUTER_BOUND_MS = 10_000`, accepted by `settleWithGrace` as an optional
`outerBoundMs` parameter defaulting to the constant (tests inject a small value):
the entire settle sequence races the bound; on breach the helper returns its
`fallback` argument (stdout: `undefined` — events were already collected
line-by-line via `handleLine`; stderr: `''`). Behavior inside the bound is
byte-identical to today.

## §9 Bench test-hygiene minors (from the ledger's parked list)

1. Remove the dead defensive `deriveBenchResult`-null branch in the live bench
   path (replay byte-equality tests cover the invariant).
2. Extract the duplicated ~10-line fixture builder in bench tests into a shared
   helper.
3. Tighten the json-failure length assertion (Task 10 minor) to assert the exact
   expected findings rather than a length.
4. Drop the unused `existsSync` import in `tests/harness/trigger-stage.test.ts`
   (Task 6 minor).
5. Convert the gate zero-spawn proof to an injected-fake call-count assertion.

## §10 Eval-5 rewording (adjudicated application)

`skills/using-shakespii/evals/evals.json` eval 5 prompt narrows to bound session
length (the recorded M4b-2 adjudication-5 candidate). Exact replacement:

- Old: `"Audit all my installed skills for duplication and near-clones."`
- New: `"Audit all my installed skills for duplication and near-clones. Keep it to a single corpus lint pass and a summary of the flagged findings — don't inspect skills beyond the flagged sites."`

`expected_output` and the three expectations are unchanged (the narrowed prompt
still exercises the same corpus-lint loop). The before/after and rationale are
recorded as an adjudication entry in `docs/CALIBRATION-M5A.md`. The resulting
skillHash rotation is absorbed by the §5 cache epoch bump. This edit lands
**before** the calibration predictions commit, so the sweep measures the new
prompt (§14 sequencing).

## §11 Frozen surfaces

- Lint CLI and lint JSON v1: byte-identical.
- Flagless `test` output (JSON + pretty): byte-identical.
- `benchmark.json`: schema untouched (skill-creator), `harness_schema_version`
  stays `1`, `bench --json` stdout stays byte-pure (§4.3).
- grading.json contract, trigger report key orders, scenario/grading stage
  semantics: unchanged.
- Live corpus `~/.claude/skills/` and the superpowers plugin cache: read-only.
- New allowance, explicitly scoped: `--run`/`--triggers` reports may gain
  contamination `findings` entries **only when contamination is detected**; clean
  runs remain byte-identical.

## §12 Tokenless test plan

No test spawns real `claude`; every cache-touching test uses a temp cacheRoot.

- Runner argv pin includes `--setting-sources project,local` in the exact position
  (§3.1) for detect and non-detect modes (injected-fake spawn capture).
- `scanContamination` fixtures: clean run; single foreign hit; multiple hits with
  counts and first-occurrence order; unparseable/malformed events skipped;
  target-skill invocation allowed under `[target]`; any invocation flagged under
  `[]`; near-name `compress-v2` vs `compress` not a false positive.
- Report wiring: scenario/trigger findings carry the pinned message format and
  never flip status; bench pretty warning lines; bench `--json` writes warnings to
  stderr while stdout stays byte-identical to the clean-run document.
- `extractGraderJson` table: prose prefix; prose suffix; both; fenced block with
  surrounding prose; nested braces; no JSON at all → `undefined`; existing
  fence-unwrap cases still pass unchanged.
- Failed-reply persistence: attempt-1 failure writes `grader-fail-1.md` then retry
  succeeds (file + grading.json coexist); double failure writes both files and no
  grading.json; clean grading writes neither.
- Detector exact-match: parse-path exact fire; `compress` vs `compress-v2`
  non-fire; fallback needle fires on unparsable accumulation; Read branch
  regression pins untouched.
- settleWithGrace outer bound: a never-settling work promise with a hanging cancel
  returns fallback within the bound (fake reader; no real sleep of 10 s — inject
  the bound).
- Cache keys: formula/literal pins re-pinned to epoch `2`; `RUN_CACHE_VERSION`
  exported and used by all four keys; `HARNESS_SCHEMA_VERSION` still `1` in
  benchmark.json metadata.
- Hygiene items (§9) keep the suite green with no assertion weakened.

## §13 Non-goals

- Further MCP hermeticity (`--strict-mcp-config`), `--bare` hermetic mode, network
  isolation.
- Read-tool contamination detection (scanner covers Skill invocations only).
- Grader session event persistence (fail files only, §6.2).
- Description optimization (M5b writer), install gate / npm publish (M5c),
  personal-skill migration and compress-eval sync (M5d).
- Any change to lint rules or profiles.

## §14 Calibration (`docs/CALIBRATION-M5A.md`)

Protocol identical to M4b-2 (predictions → sweeps → adjudication → cache proofs;
rewordings recorded-never-applied, except eval-5 which lands pre-sweep by §10).

Sequencing: all code tasks green → §10 eval-5 edit → predictions committed →
sweeps → cache proofs → docs closeout.

1. **Bench re-sweep** — compress fixture, 3 runs per configuration under
   isolation. Headline question: does the `without_skill` baseline drop now that
   the global compress skill is excluded, and does the pass-rate delta flip
   direction from the contaminated −0.11?
2. **Trigger re-sweep** — using-shakespii, all 20 queries × 3 reps. Headline:
   accuracy holds (proves isolation didn't break staged-skill resolution).
3. **Retro-scan evidence** — `scanContamination` run over the archived M4b-2
   `without_skill` `events.jsonl` artifacts must flag `compress` (live proof the
   guard would have caught the M4b-2 incident).
4. **Cache proofs** — replay identity per the M4b-2 procedure, including the
   adjudication-4 widened normalization (cache metadata only).

Long sweeps run controller-executed in detached background shells (`nohup` +
Monitor), per the M4b-2 operational note.

## §15 Documentation plan

- `docs/HARNESS.md`: isolation contract (§3), contamination findings and formats
  (§4.3), `RUN_CACHE_VERSION` / `HARNESS_SCHEMA_VERSION` split (§5), grader-fail
  artifacts (§6.2), settle outer bound (§8).
- `docs/ROADMAP.md`: restructure M5 into M5a–M5d per §0.1; tick M5a items as they
  land.
- `README.md`: bench caveat updated — baseline contamination now mitigated
  (isolation) and detected (guard).
- `docs/LINT-RULES.md`: no change.
- All updates dual-location (canonical `~/.ai-pref-nsync/local-docs/ai-shakespii/`,
  repo mirror), cp + cmp verified.
