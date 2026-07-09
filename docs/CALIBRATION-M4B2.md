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

Sweep required three passes (fail-fast + resume-from-cache working as designed):

- Pass 1: exit 1 — `bench run failed (eval 1, with_skill, run 3): grader returned invalid grading (reply is not valid JSON)`
- Pass 2: exit 1 — `bench run failed (eval 2, with_skill, run 1): grader returned invalid grading (reply is not valid JSON)`
- Pass 3: exit 0 — complete 18/18 matrix; `benchmark.json` written and validator-clean.

Full `benchmark.json` verbatim (the document at
`<cacheRoot>/runs/compress/bench-<suiteKey>/benchmark.json`, byte-identical
to the `--json` stdout):

```json
{
  "metadata": {
    "skill_name": "compress",
    "model": "sonnet",
    "runs_per_configuration": 3,
    "harness_schema_version": 1
  },
  "runs": [
    {
      "eval_id": 1,
      "configuration": "with_skill",
      "run_number": 1,
      "result": {
        "pass_rate": 1,
        "passed": 4,
        "failed": 0,
        "total": 4,
        "time_seconds": 159.85,
        "tokens": 6239,
        "tool_calls": 16,
        "errors": 2
      }
    },
    {
      "eval_id": 1,
      "configuration": "with_skill",
      "run_number": 2,
      "result": {
        "pass_rate": 1,
        "passed": 4,
        "failed": 0,
        "total": 4,
        "time_seconds": 66.65,
        "tokens": 1867,
        "tool_calls": 5,
        "errors": 0
      }
    },
    {
      "eval_id": 1,
      "configuration": "with_skill",
      "run_number": 3,
      "result": {
        "pass_rate": 1,
        "passed": 4,
        "failed": 0,
        "total": 4,
        "time_seconds": 138.34,
        "tokens": 4507,
        "tool_calls": 16,
        "errors": 1
      }
    },
    {
      "eval_id": 1,
      "configuration": "without_skill",
      "run_number": 1,
      "result": {
        "pass_rate": 1,
        "passed": 4,
        "failed": 0,
        "total": 4,
        "time_seconds": 76.43,
        "tokens": 1062,
        "tool_calls": 5,
        "errors": 0
      }
    },
    {
      "eval_id": 1,
      "configuration": "without_skill",
      "run_number": 2,
      "result": {
        "pass_rate": 1,
        "passed": 4,
        "failed": 0,
        "total": 4,
        "time_seconds": 64.06,
        "tokens": 975,
        "tool_calls": 3,
        "errors": 0
      }
    },
    {
      "eval_id": 1,
      "configuration": "without_skill",
      "run_number": 3,
      "result": {
        "pass_rate": 1,
        "passed": 4,
        "failed": 0,
        "total": 4,
        "time_seconds": 85.69,
        "tokens": 1077,
        "tool_calls": 4,
        "errors": 0
      }
    },
    {
      "eval_id": 2,
      "configuration": "with_skill",
      "run_number": 1,
      "result": {
        "pass_rate": 1,
        "passed": 2,
        "failed": 0,
        "total": 2,
        "time_seconds": 68.16,
        "tokens": 4116,
        "tool_calls": 12,
        "errors": 1
      }
    },
    {
      "eval_id": 2,
      "configuration": "with_skill",
      "run_number": 2,
      "result": {
        "pass_rate": 1,
        "passed": 2,
        "failed": 0,
        "total": 2,
        "time_seconds": 93.67,
        "tokens": 4933,
        "tool_calls": 17,
        "errors": 1
      }
    },
    {
      "eval_id": 2,
      "configuration": "with_skill",
      "run_number": 3,
      "result": {
        "pass_rate": 1,
        "passed": 2,
        "failed": 0,
        "total": 2,
        "time_seconds": 67.27,
        "tokens": 3002,
        "tool_calls": 7,
        "errors": 0
      }
    },
    {
      "eval_id": 2,
      "configuration": "without_skill",
      "run_number": 1,
      "result": {
        "pass_rate": 1,
        "passed": 2,
        "failed": 0,
        "total": 2,
        "time_seconds": 68.31,
        "tokens": 2551,
        "tool_calls": 8,
        "errors": 0
      }
    },
    {
      "eval_id": 2,
      "configuration": "without_skill",
      "run_number": 2,
      "result": {
        "pass_rate": 1,
        "passed": 2,
        "failed": 0,
        "total": 2,
        "time_seconds": 96.57,
        "tokens": 3662,
        "tool_calls": 8,
        "errors": 0
      }
    },
    {
      "eval_id": 2,
      "configuration": "without_skill",
      "run_number": 3,
      "result": {
        "pass_rate": 1,
        "passed": 2,
        "failed": 0,
        "total": 2,
        "time_seconds": 57.84,
        "tokens": 2050,
        "tool_calls": 8,
        "errors": 0
      }
    },
    {
      "eval_id": 3,
      "configuration": "with_skill",
      "run_number": 1,
      "result": {
        "pass_rate": 1,
        "passed": 2,
        "failed": 0,
        "total": 2,
        "time_seconds": 108.12,
        "tokens": 3704,
        "tool_calls": 11,
        "errors": 0
      }
    },
    {
      "eval_id": 3,
      "configuration": "with_skill",
      "run_number": 2,
      "result": {
        "pass_rate": 0,
        "passed": 0,
        "failed": 2,
        "total": 2,
        "time_seconds": 154.96,
        "tokens": 1623,
        "tool_calls": 8,
        "errors": 0
      }
    },
    {
      "eval_id": 3,
      "configuration": "with_skill",
      "run_number": 3,
      "result": {
        "pass_rate": 1,
        "passed": 2,
        "failed": 0,
        "total": 2,
        "time_seconds": 205.43,
        "tokens": 6553,
        "tool_calls": 18,
        "errors": 1
      }
    },
    {
      "eval_id": 3,
      "configuration": "without_skill",
      "run_number": 1,
      "result": {
        "pass_rate": 1,
        "passed": 2,
        "failed": 0,
        "total": 2,
        "time_seconds": 157.25,
        "tokens": 2423,
        "tool_calls": 10,
        "errors": 0
      }
    },
    {
      "eval_id": 3,
      "configuration": "without_skill",
      "run_number": 2,
      "result": {
        "pass_rate": 1,
        "passed": 2,
        "failed": 0,
        "total": 2,
        "time_seconds": 201.05,
        "tokens": 3830,
        "tool_calls": 15,
        "errors": 2
      }
    },
    {
      "eval_id": 3,
      "configuration": "without_skill",
      "run_number": 3,
      "result": {
        "pass_rate": 1,
        "passed": 2,
        "failed": 0,
        "total": 2,
        "time_seconds": 198.39,
        "tokens": 8095,
        "tool_calls": 11,
        "errors": 0
      }
    }
  ],
  "run_summary": {
    "with_skill": {
      "pass_rate": {
        "mean": 0.8889,
        "stddev": 0.3333,
        "min": 0,
        "max": 1
      },
      "time_seconds": {
        "mean": 118.05,
        "stddev": 49.45,
        "min": 66.65,
        "max": 205.43
      },
      "tokens": {
        "mean": 4060.44,
        "stddev": 1729.25,
        "min": 1623,
        "max": 6553
      }
    },
    "without_skill": {
      "pass_rate": {
        "mean": 1,
        "stddev": 0,
        "min": 1,
        "max": 1
      },
      "time_seconds": {
        "mean": 111.73,
        "stddev": 57.85,
        "min": 57.84,
        "max": 201.05
      },
      "tokens": {
        "mean": 2858.33,
        "stddev": 2233.19,
        "min": 975,
        "max": 8095
      }
    },
    "delta": {
      "pass_rate": "-0.11",
      "time_seconds": "+6.3",
      "tokens": "+1202"
    }
  }
}

Pretty (cached re-run):

```
bench compress · model sonnet · 3 run(s)/config
  with_skill      pass_rate 0.89 ±0.33 · time 118.0s · tokens 4060
  without_skill   pass_rate 1.00 ±0.00 · time 111.7s · tokens 2858
  delta           pass_rate -0.11 · time +6.3s · tokens +1202
18/18 run(s) cached
```

Grader-retry observability proven live: 2 of the 18 persisted gradings carry
`timing.grader_retries: 1` with cause `["gate: invalid grading (reply is not
valid JSON)"]`. The only non-perfect with_skill run is eval 3 (idempotency,
0/2) — the flaky surface predicted in item 5.

## Actuals — triggers

Pre-warm (`test --run --json`): exit 1 — evals 1–4, 6 graded and cached
(11/18 expectations passed, consistent with the M4b-1 sweep's known eval-2
clarify-and-stop behavior); eval 5 timed out (its reproducible M4b-1 flake)
and stayed uncached. In the recorded sweep eval 5 then completed `ok` cold
(262.03 s) and cached — the flake is genuinely intermittent.

Trigger stage verbatim: `status: pass`, `queries: {passed: 20, total: 20}`,
`findings: []` — **accuracy 1.00**, 60/60 reps completed, zero run failures,
zero rep retries.

Trigger stage object verbatim (from the recorded sweep report):

```json
{
  "stage": "trigger",
  "status": "pass",
  "findings": [],
  "queries": {
    "passed": 20,
    "total": 20
  },
  "runs": [
    {
      "queryIndex": 0,
      "shouldTrigger": true,
      "triggered": 3,
      "reps": 3,
      "cached": 0,
      "status": "ok"
    },
    {
      "queryIndex": 1,
      "shouldTrigger": true,
      "triggered": 3,
      "reps": 3,
      "cached": 0,
      "status": "ok"
    },
    {
      "queryIndex": 2,
      "shouldTrigger": true,
      "triggered": 2,
      "reps": 3,
      "cached": 0,
      "status": "ok"
    },
    {
      "queryIndex": 3,
      "shouldTrigger": true,
      "triggered": 3,
      "reps": 3,
      "cached": 0,
      "status": "ok"
    },
    {
      "queryIndex": 4,
      "shouldTrigger": true,
      "triggered": 2,
      "reps": 3,
      "cached": 0,
      "status": "ok"
    },
    {
      "queryIndex": 5,
      "shouldTrigger": true,
      "triggered": 3,
      "reps": 3,
      "cached": 0,
      "status": "ok"
    },
    {
      "queryIndex": 6,
      "shouldTrigger": true,
      "triggered": 3,
      "reps": 3,
      "cached": 0,
      "status": "ok"
    },
    {
      "queryIndex": 7,
      "shouldTrigger": true,
      "triggered": 3,
      "reps": 3,
      "cached": 0,
      "status": "ok"
    },
    {
      "queryIndex": 8,
      "shouldTrigger": true,
      "triggered": 3,
      "reps": 3,
      "cached": 0,
      "status": "ok"
    },
    {
      "queryIndex": 9,
      "shouldTrigger": true,
      "triggered": 3,
      "reps": 3,
      "cached": 0,
      "status": "ok"
    },
    {
      "queryIndex": 10,
      "shouldTrigger": true,
      "triggered": 3,
      "reps": 3,
      "cached": 0,
      "status": "ok"
    },
    {
      "queryIndex": 11,
      "shouldTrigger": true,
      "triggered": 3,
      "reps": 3,
      "cached": 0,
      "status": "ok"
    },
    {
      "queryIndex": 12,
      "shouldTrigger": false,
      "triggered": 0,
      "reps": 3,
      "cached": 0,
      "status": "ok"
    },
    {
      "queryIndex": 13,
      "shouldTrigger": false,
      "triggered": 1,
      "reps": 3,
      "cached": 0,
      "status": "ok"
    },
    {
      "queryIndex": 14,
      "shouldTrigger": false,
      "triggered": 0,
      "reps": 3,
      "cached": 0,
      "status": "ok"
    },
    {
      "queryIndex": 15,
      "shouldTrigger": false,
      "triggered": 0,
      "reps": 3,
      "cached": 0,
      "status": "ok"
    },
    {
      "queryIndex": 16,
      "shouldTrigger": false,
      "triggered": 0,
      "reps": 3,
      "cached": 0,
      "status": "ok"
    },
    {
      "queryIndex": 17,
      "shouldTrigger": false,
      "triggered": 0,
      "reps": 3,
      "cached": 0,
      "status": "ok"
    },
    {
      "queryIndex": 18,
      "shouldTrigger": false,
      "triggered": 0,
      "reps": 3,
      "cached": 0,
      "status": "ok"
    },
    {
      "queryIndex": 19,
      "shouldTrigger": false,
      "triggered": 0,
      "reps": 3,
      "cached": 0,
      "status": "ok"
    }
  ]
}
```


| # | Label | Fired | Verdict | Predicted |
|---|---|---|---|---|
| 0 | pos | 3/3 | PASS | PASS (high) |
| 1 | pos | 3/3 | PASS | PASS (high) |
| 2 | pos | 2/3 | PASS | PASS (high) |
| 3 | pos | 3/3 | PASS | PASS (high) |
| 4 | pos | 2/3 | PASS | PASS (medium) |
| 5 | pos | 3/3 | PASS | PASS (medium) |
| 6 | pos | 3/3 | PASS | PASS (low) |
| 7 | pos | 3/3 | PASS | PASS (low) |
| 8 | pos | 3/3 | PASS | PASS (high) |
| 9 | pos | 3/3 | PASS | PASS (high) |
| 10 | pos | 3/3 | PASS | PASS (medium) |
| 11 | pos | 3/3 | PASS | PASS (high) |
| 12 | neg | 0/3 | PASS | PASS (high) |
| 13 | neg | 1/3 | PASS | PASS (high) |
| 14 | neg | 0/3 | PASS | PASS (high) |
| 15 | neg | 0/3 | PASS | PASS (high) |
| 16 | neg | 0/3 | PASS | PASS (high) |
| 17 | neg | 0/3 | PASS | PASS (low) |
| 18 | neg | 0/3 | PASS | PASS (high) |
| 19 | neg | 0/3 | PASS | PASS (medium) |

Environment note: the machine's global `~/.claude/skills/` also contains an
installed using-shakespii (the M2.5 symlink). Trigger measurement remains
valid — detection keys on the skill NAME (Skill tool) or a path ending in
`.claude/skills/using-shakespii/SKILL.md` (Read tool), and the duplicate
shares both, so a session pulling either copy measures the same
name+description signal.

## Adjudication

1. **Bench delta direction (prediction 1) — WRONG. Class: environment
   contamination (miscalibration with a structural cause).** The
   `without_skill` runs were not bare: transcripts show the executor invoking
   the user's globally-installed personal `compress` skill (explicit
   `Tool: Skill — {"skill":"compress"}` and "Using the compress skill…"
   narration in three independent runs; `outputs/.claude/` verified absent,
   so the mount was not the source). The `.original.md` backup convention
   that let every without_skill run pass the backup expectation comes from
   `~/.claude/skills/compress/SKILL.md` line 6. The harness behaved exactly
   as specified — executor sessions inherit the user's global claude
   environment, and workspace isolation (A2) is an explicit spec §13
   non-goal. Consequence: on machines where an equivalent skill is installed
   globally, bench's without_skill baseline is contaminated and the delta
   under-measures the skill's value. This is now MEASURED evidence
   prioritizing the M5 executor-isolation follow-up. No in-phase fix (argv
   and staging are frozen surfaces; isolation is adjudicated M5-or-later).
2. **Grader non-JSON reply rate (prediction 6) — under-predicted. Class:
   miscalibration.** Predicted ≤ 2 single retries across 36 gradings; actual
   ≈ 6 non-JSON replies across ~24 grader calls (2 recovered by the shared
   retry, 2 samples failing BOTH attempts → fail-fast aborts, recovered by
   re-run resume-from-cache). Every contract behaved correctly (retry,
   observability fields, fail-fast, uncached failure, cache resume).
   Improvement candidates RECORDED, not applied: (a) `extractGraderJson`
   could tolerate a prose prefix before the JSON object; (b) failed grader
   replies are not persisted anywhere (observability gap — only successful
   gradings leave artifacts). Both feed M5.
3. **Trigger predictions — all 20 correct; accuracy 1.00 at the ceiling of
   the predicted 0.85–1.00 band.** No adjudication required. The v0.4.0
   description generalized to the two new surfaces (bench, trigger checks)
   better than predicted (#6/#7 fired 3/3), so no description rewording is
   even recorded.
4. **Trigger cache-proof procedure — plan-authoring gap. Class: protocol
   adaptation (recorded).** The plan's proof normalized only trigger
   `cached` counts, assuming the pre-warm left scenario fully cached; eval
   5's intermittent timeout defeated that (it entered the recorded sweep
   cold). Field-level diff confirmed the ONLY sweep-vs-replay differences
   were cache metadata (trigger `cached` 0→3 on all 20 queries; scenario
   eval-5 `cached false→true`, `durationSeconds 262.03→0`) with every
   measurement field byte-equal. The proof script was widened to normalize
   scenario cache metadata and to additionally assert the replay is fully
   cached in BOTH stages. Measurements unaffected.
5. **Eval 5 timeout intermittence — matches the M4b-1 known flake** (timeout
   in pre-warm, `ok` at 262 s in the sweep, i.e. near the 300 s budget).
   Eval-authoring rewording RECORDED, not applied: eval 5's corpus-audit
   prompt could be narrowed to bound session length.
6. Remaining predictions held: with_skill pass_rate 0.8889 ∈ [0.70, 0.95];
   delta time +6.3 s ∈ [+5, +60]; with_skill stddev 0.3333 ≤ 0.35 driven by
   eval 3 as predicted. Token delta +1202 fell below the predicted
   [+2000, +20000] band (minor miscalibration; the mount is cheaper than
   estimated).

Zero harness bugs: no code, profile, eval, or query changes made in-phase.

## Cache proofs

1. **BENCH-REPLAY-OK** — second `bench … --json` byte-identical (`cmp`
   silent) at zero live sessions; pretty re-run reports `18/18 run(s)
   cached`.
2. **TRIGGER-REPLAY-OK** — replay fully cached (every trigger rep
   `cached === reps`; every scenario run `cached: true`), and sweep vs
   replay identical after normalizing cache metadata only (adjudication 4).
