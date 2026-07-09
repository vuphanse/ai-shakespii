# CALIBRATION-M4B2 — trigger accuracy + benchmark sweeps

Protocol (M4b-1 protocol verbatim): predictions are committed in a separate
commit BEFORE any sweep runs; actuals are recorded verbatim (no paraphrase);
every prediction-vs-actual deviation is adjudicated into one of three
classes — **harness bug** (fix via TDD before proceeding), **miscalibration**
(the prediction was wrong; record why), or **eval/query-authoring miss** (the
query or eval measures the wrong thing; record a proposed rewording but NEVER
apply it in-phase). Cache proofs close the phase. Long sweeps run in the
controller's own background shell, never a subagent's.

Sweep configuration:

- Bench: `tests/fixtures/harness/compress` — 3 evals × 2 configurations ×
  3 runs = 18 executor sessions + 18 gradings, model sonnet, default cache.
- Triggers: `skills/using-shakespii` — 20 queries × 3 reps = 60 detect
  sessions, model sonnet, preceded by a scenario/grading pre-warm under the
  post-TR02 skill hash (~6 executor + 6 grader sessions; Task 3's
  triggers.json rotated `skillContentHash`, so the M4b-1 cache entries are
  stale and any post-Task-3 `--run` spends these once regardless).

## Predictions — bench (compress, 3 × 2 × 3, sonnet)

Committed before any sweep. The measurement target is the with/without delta,
not an absolute quality bar — bench measures, it does not gate.

1. **Direction:** `with_skill` mean pass_rate exceeds `without_skill` — the
   suite's expectations encode skill-specific conventions a bare model cannot
   guess (the `sample-memory.original.md` backup name, caveman-compressed
   form, byte-identical fence preservation as an explicit contract).
2. **Magnitude:** with_skill mean pass_rate in **0.70–0.95** (M4b-1 sweep saw
   6/8 expectations pass with eval 3's idempotency pair flaky at 0/2);
   without_skill in **0.20–0.55** (generic compression plausibly satisfies
   "smaller than input" and sometimes preserves fences, but misses the backup
   convention and caveman form). Delta pass_rate **positive, ≥ +0.20**.
3. **Time:** with_skill slower per run (mount + SKILL.md read before work) —
   delta time_seconds positive, roughly **+5 to +60 s**.
4. **Tokens:** with_skill higher (skill mount enters context) — delta tokens
   positive, roughly **+2000 to +20000**.
5. **Variance:** eval 3 (idempotency) is the flakiest surface; expect it to
   dominate with_skill stddev. pass_rate stddev per config predicted ≤ 0.35.
6. **Mechanics:** exit 0; complete 18/18 matrix; zero executor retries
   consumed; grader retries ≤ 2 across 36 gradings (M4b-1 saw occasional
   invalid-JSON first replies); `benchmark.json` passes `validateBenchmarkJson`
   with the pinned metadata (no timestamp).

## Predictions — triggers (using-shakespii, 20 × 3, sonnet)

Per-query verdict predictions against the v0.4.0 description ("Use when
creating a new agent skill or auditing, linting, testing, or fixing an
existing one — drives the shakespii CLI (init, lint --json, test --run)…").
PASS means the majority-rule verdict matches the label.

| # | Query (abbrev) | Label | Predicted verdict | Confidence |
|---|---|---|---|---|
| 0 | Lint the skill I just wrote and fix findings | pos | PASS (triggers) | high |
| 1 | Run shakespii lint on ./skills/pdf-tools | pos | PASS | high (names the CLI) |
| 2 | Create a new skill called changelog-writer | pos | PASS | high |
| 3 | Scaffold a skill … make it pass lint | pos | PASS | high |
| 4 | Audit all my installed skills for duplication | pos | PASS | medium |
| 5 | Run the evals for my compress skill | pos | PASS | medium |
| 6 | Check whether my skill's description will trigger | pos | PASS | **low** — "trigger accuracy" is absent from the v0.4.0 description; rides on "auditing/testing a skill" |
| 7 | Benchmark my skill with and without the skill mounted | pos | PASS | **low** — "benchmark" absent from the description; the most likely positive to fail |
| 8 | Validate the frontmatter of SKILL.md | pos | PASS | high |
| 9 | My skill directory fails shakespii test | pos | PASS | high (names the CLI) |
| 10 | Add eval cases to my skill (minimum of three) | pos | PASS | medium |
| 11 | Which lint rules is my SKILL.md violating (CT03) | pos | PASS | high |
| 12 | Run eslint on my TypeScript project | neg | PASS (no trigger) | high |
| 13 | Fix the ESLint errors in src/cli | neg | PASS | high |
| 14 | Write unit tests for my parser module | neg | PASS | high |
| 15 | Review this pull request for code quality | neg | PASS | high |
| 16 | Benchmark my API server's request latency | neg | PASS | high |
| 17 | Lint this Markdown README for broken links | neg | PASS | **low** — "lint" overlap is the strongest false-positive pull among the negatives |
| 18 | Improve my prompt for the customer-support chatbot | neg | PASS | high |
| 19 | Audit my npm dependencies for vulnerabilities | neg | PASS | medium ("audit" overlap) |

**Aggregate:** accuracy **0.85–1.00** (17–20 of 20), above the 0.8 stage
threshold — stage predicted PASS. Most likely misses, in order: #7
(benchmark positive), #6 (trigger-check positive), #17 (markdown-lint
negative). Mechanics: 60/60 reps complete (no timeouts), positives detected
early via the `Skill` tool path more often than the `Read` path.

## Predictions — cache proofs

1. Bench replay: byte-identical `--json` document at zero live sessions;
   pretty re-run reports `18/18 run(s) cached`.
2. Trigger replay: every rep `cached === reps`; sweep-vs-replay reports
   identical after normalizing trigger `cached` counts (scenario/grading
   byte-identical thanks to the pre-warm) — `TRIGGER-REPLAY-OK`.

## Actuals — bench

(recorded after the sweep)

## Actuals — triggers

(recorded after the sweep)

## Adjudication

(recorded after the sweeps)

## Cache proofs

(recorded after the replays)
