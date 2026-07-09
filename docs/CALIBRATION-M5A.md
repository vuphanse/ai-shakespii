# CALIBRATION-M5A — harness hardening + executor isolation

## Spike evidence (spec §3.2, run 2026-07-09)

Probe prompt: compress fixture eval-1 prompt (verbatim below).

> Compress the memory file evals/files/sample-memory.md to save tokens.

Each workspace carried the fixture's eval-1 input file
(`evals/files/sample-memory.md`), staged the way `stageBareRunDir` would; the
`staged` workspace additionally carried the fixture skill as a project-level
mount at `.claude/skills/compress/SKILL.md`. All runs on OAuth (no
`ANTHROPIC_API_KEY` in the environment), model sonnet, `CLAUDECODE` stripped.

| Assertion | Command evidence | Result |
|---|---|---|
| (a1) unflagged positive control invokes global compress | 2 Skill tool_use events; `"skill":"compress"` present in control.jsonl; exit 0 | PASS |
| (a2) flagged run excludes it | zero `"skill":"compress"` matches in flagged.jsonl; 1 result event; exit 0 | PASS |
| (b) project-level mount still loads | `"skill":"compress"` present in staged.jsonl (mounted copy invoked under the flag); 1 result event; exit 0 | PASS |
| (c) OAuth intact | no ANTHROPIC_API_KEY in env (AUTH-PRECONDITION-OK); all three sessions completed with result events | PASS |

Raw captures: /tmp/m5a-spike/{control,flagged,staged}.jsonl (not committed).

Verdict: `--setting-sources project,local` excludes user-global skills while
project-level mounts and OAuth auth survive. Tasks 2–14 unblocked.

## Predictions

Committed before any sweep. Setup: compress fixture bench (3 evals × 2
configurations × 3 runs = 18 runs), using-shakespii trigger sweep (20 queries
× 3 reps + 6 scenario evals), model sonnet, epoch-2 cache fully cold.

1. **Bench `without_skill` pass_rate mean DROPS from the contaminated 1.0**
   — predicted mean ∈ [0.40, 0.85] (confidence: medium). Mechanism: the
   `.original.md` backup convention that made every M4b-2 bare run pass came
   from the user-global compress skill (CALIBRATION-M4B2 adjudication 1); an
   isolated bare agent should not spontaneously invent it, so the
   convention-dependent expectations fail in most bare runs while generic
   compression expectations still pass.
2. **Delta pass_rate flips non-negative** — predicted ∈ [+0.10, +0.45]
   (confidence: medium). M4b-2 measured −0.11 under contamination.
3. **Bench `with_skill` pass_rate mean** ∈ [0.80, 1.00] (confidence:
   medium-high). M4b-2 measured 0.8889 with one eval-3 flake run.
4. **Trigger accuracy holds** ∈ [0.90, 1.00], expected 1.00 (confidence:
   high). Isolation must not regress staged-skill resolution — spike
   assertion (b) proved project-level mounts load under the flag.
5. **Grader retries** ≤ 2 single retries across all gradings and ZERO
   double-gate fail-fast aborts (confidence: medium). M4b-2 saw ≈6 non-JSON
   replies in ~24 grader calls; the Task 9 prose tolerance should absorb
   most of that class.
6. **Contamination warnings in the NEW sweeps: ZERO** (confidence: high).
   Isolation excludes user-global skills; bare workspaces mount nothing and
   with_skill workspaces mount only the target.
7. **Retro-scan flags `compress`** in ≥ 1 archived M4b-2 bare run dir
   (confidence: high — CALIBRATION-M4B2 documented three contaminated runs;
   discriminator: `events.jsonl` + `grading.json` present, `outputs/.claude`
   absent).
8. **Eval-5 scenario duration under the narrowed prompt** < 200 s with no
   timeout (confidence: medium). M4b-2 observed a pre-warm timeout and a
   262 s live run under the old prompt.

## Actuals

Sweeps run 2026-07-10, model sonnet, epoch-2 cache cold at start. Bench sweep
exited 0 on the first pass (no fail-fast recovery needed). Trigger sweep
exited 1 — the grading stage carries 10 failed expectations (adjudications 6–7);
the trigger stage itself passed at accuracy 0.80.

### Bench — full `benchmark.json` verbatim (byte-identical to the `--json` stdout)

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
        "time_seconds": 247.95,
        "tokens": 8792,
        "tool_calls": 18,
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
        "time_seconds": 63.99,
        "tokens": 2185,
        "tool_calls": 11,
        "errors": 1
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
        "time_seconds": 107.85,
        "tokens": 3053,
        "tool_calls": 12,
        "errors": 1
      }
    },
    {
      "eval_id": 1,
      "configuration": "without_skill",
      "run_number": 1,
      "result": {
        "pass_rate": 0.5,
        "passed": 2,
        "failed": 2,
        "total": 4,
        "time_seconds": 9.15,
        "tokens": 423,
        "tool_calls": 2,
        "errors": 0
      }
    },
    {
      "eval_id": 1,
      "configuration": "without_skill",
      "run_number": 2,
      "result": {
        "pass_rate": 0.5,
        "passed": 2,
        "failed": 2,
        "total": 4,
        "time_seconds": 16.91,
        "tokens": 915,
        "tool_calls": 4,
        "errors": 1
      }
    },
    {
      "eval_id": 1,
      "configuration": "without_skill",
      "run_number": 3,
      "result": {
        "pass_rate": 0.5,
        "passed": 2,
        "failed": 2,
        "total": 4,
        "time_seconds": 20.33,
        "tokens": 1311,
        "tool_calls": 3,
        "errors": 0
      }
    },
    {
      "eval_id": 2,
      "configuration": "with_skill",
      "run_number": 1,
      "result": {
        "pass_rate": 0.5,
        "passed": 1,
        "failed": 1,
        "total": 2,
        "time_seconds": 31.7,
        "tokens": 597,
        "tool_calls": 5,
        "errors": 0
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
        "time_seconds": 100.53,
        "tokens": 4775,
        "tool_calls": 15,
        "errors": 1
      }
    },
    {
      "eval_id": 2,
      "configuration": "with_skill",
      "run_number": 3,
      "result": {
        "pass_rate": 0.5,
        "passed": 1,
        "failed": 1,
        "total": 2,
        "time_seconds": 34.31,
        "tokens": 733,
        "tool_calls": 4,
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
        "time_seconds": 72.71,
        "tokens": 3089,
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
        "time_seconds": 24.44,
        "tokens": 1518,
        "tool_calls": 4,
        "errors": 0
      }
    },
    {
      "eval_id": 2,
      "configuration": "without_skill",
      "run_number": 3,
      "result": {
        "pass_rate": 0,
        "passed": 0,
        "failed": 2,
        "total": 2,
        "time_seconds": 30.86,
        "tokens": 2184,
        "tool_calls": 2,
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
        "time_seconds": 60.81,
        "tokens": 843,
        "tool_calls": 5,
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
        "time_seconds": 161.63,
        "tokens": 2029,
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
        "time_seconds": 167.17,
        "tokens": 2606,
        "tool_calls": 13,
        "errors": 0
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
        "time_seconds": 209.66,
        "tokens": 4556,
        "tool_calls": 14,
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
        "time_seconds": 25.92,
        "tokens": 1695,
        "tool_calls": 2,
        "errors": 0
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
        "time_seconds": 23.38,
        "tokens": 1778,
        "tool_calls": 3,
        "errors": 0
      }
    }
  ],
  "run_summary": {
    "with_skill": {
      "pass_rate": {
        "mean": 0.7778,
        "stddev": 0.3632,
        "min": 0,
        "max": 1
      },
      "time_seconds": {
        "mean": 108.44,
        "stddev": 71.97,
        "min": 31.7,
        "max": 247.95
      },
      "tokens": {
        "mean": 2845.89,
        "stddev": 2593.64,
        "min": 597,
        "max": 8792
      }
    },
    "without_skill": {
      "pass_rate": {
        "mean": 0.7222,
        "stddev": 0.3632,
        "min": 0,
        "max": 1
      },
      "time_seconds": {
        "mean": 48.15,
        "stddev": 63.17,
        "min": 9.15,
        "max": 209.66
      },
      "tokens": {
        "mean": 1941,
        "stddev": 1236.68,
        "min": 423,
        "max": 4556
      }
    },
    "delta": {
      "pass_rate": "+0.06",
      "time_seconds": "+60.3",
      "tokens": "+905"
    }
  }
}
```

`bench --json` stderr: empty — zero contamination warnings (prediction 6).
Grader: zero retries and zero `grader-fail-*.md` files across all 18 gradings
(the two `grader_retries` timing.json files under runs/compress are dated
2026-07-09 — the M4b-2 sweep, pre-isolation).

### Triggers — trigger stage object verbatim

```json
{
  "stage": "trigger",
  "status": "pass",
  "findings": [],
  "queries": {
    "passed": 16,
    "total": 20
  },
  "runs": [
    {
      "queryIndex": 0,
      "shouldTrigger": true,
      "triggered": 2,
      "reps": 3,
      "cached": 0,
      "status": "ok"
    },
    {
      "queryIndex": 1,
      "shouldTrigger": true,
      "triggered": 0,
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
      "triggered": 1,
      "reps": 3,
      "cached": 0,
      "status": "ok"
    },
    {
      "queryIndex": 4,
      "shouldTrigger": true,
      "triggered": 0,
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
      "triggered": 2,
      "reps": 3,
      "cached": 0,
      "status": "ok"
    },
    {
      "queryIndex": 8,
      "shouldTrigger": true,
      "triggered": 0,
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
      "triggered": 2,
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
      "triggered": 0,
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

### Scenario stage object verbatim

```json
{
  "stage": "scenario",
  "status": "pass",
  "findings": [],
  "runs": [
    {
      "evalId": 1,
      "cached": false,
      "status": "ok",
      "durationSeconds": 38.1
    },
    {
      "evalId": 2,
      "cached": false,
      "status": "ok",
      "durationSeconds": 45.84
    },
    {
      "evalId": 3,
      "cached": false,
      "status": "ok",
      "durationSeconds": 26.62
    },
    {
      "evalId": 4,
      "cached": false,
      "status": "ok",
      "durationSeconds": 44.21
    },
    {
      "evalId": 5,
      "cached": false,
      "status": "ok",
      "durationSeconds": 67.54
    },
    {
      "evalId": 6,
      "cached": false,
      "status": "ok",
      "durationSeconds": 44.52
    }
  ]
}
```

### Grading stage object verbatim (the 10 failed expectations, adjudication 7)

```json
{
  "stage": "grading",
  "status": "fail",
  "findings": [
    {
      "severity": "error",
      "message": "eval 1 expectation failed: \"Consults references/rule-remediations.md for each ruleId\" \u2014 No findings were returned (findings: [] in both lint calls, transcript.md lines 209-221 and 233-245), and there is no mention of 'rule-remediations' anywhere in transcript.md (confirmed via grep \u2014 zer\u2026",
      "file": "evals/evals.json",
      "line": null
    },
    {
      "severity": "error",
      "message": "eval 1 expectation failed: \"Reports before/after finding counts and per-rule changes\" \u2014 Final report (transcript.md lines 250 and 256-258) only states 'Skill already clean. no error, no warning finding. 0 fix needed.' \u2014 a single current-state statement, not an explicit before/after count\u2026",
      "file": "evals/evals.json",
      "line": null
    },
    {
      "severity": "error",
      "message": "eval 2 expectation failed: \"Uses `shakespii init` rather than hand-rolling the directory layout\" \u2014 The transcript ends at line 234 with the agent's confirmation questions; no `shakespii init` (or any scaffold) command was ever run. metrics.json shows only 7 Bash calls total (version checks, bun ins\u2026",
      "file": "evals/evals.json",
      "line": null
    },
    {
      "severity": "error",
      "message": "eval 2 expectation failed: \"Leaves no scaffold placeholder tokens anywhere in the new skill\" \u2014 No new skill was ever created \u2014 `find outputs -not -path '*/.claude/*' -type f` returns only outputs/metrics.json, so there are no SKILL.md/section files to check for placeholder tokens.",
      "file": "evals/evals.json",
      "line": null
    },
    {
      "severity": "error",
      "message": "eval 2 expectation failed: \"Presents the skill with clean lint output and asks approval before any install\" \u2014 The run terminates at the confirmation-question stage (transcript.md lines 219-233); no lint was ever run and no completed skill was presented \u2014 the agent only asked pre-scaffolding clarifying questio\u2026",
      "file": "evals/evals.json",
      "line": null
    },
    {
      "severity": "error",
      "message": "eval 6 expectation failed: \"Confirms with the human before the first token-spending --run\" \u2014 The agent never invoked --run at all (transcript.md:272 shows only `shakespii test ~/.claude/skills/compress --json`, no --run flag), so no confirmation-before-spend step ever occurs; the only ask pos\u2026",
      "file": "evals/evals.json",
      "line": null
    },
    {
      "severity": "error",
      "message": "eval 6 expectation failed: \"Invokes `shakespii test <dir> --run --json` rather than executing evals by hand\" \u2014 transcript.md:272 shows the only test invocation is `$SHAKESPII test ~/.claude/skills/compress --json` \u2014 no `--run` flag is ever passed in the entire transcript, so the required command form was never\u2026",
      "file": "evals/evals.json",
      "line": null
    },
    {
      "severity": "error",
      "message": "eval 6 expectation failed: \"Distinguishes scenario findings (executor failures) from grading findings (failed expectations)\" \u2014 transcript.md:296-306 shows the test output with scenario status 'skipped' and grading status 'skipped' (note: 'pass --run to execute LLM stages'); since --run was never used, no scenario or grading f\u2026",
      "file": "evals/evals.json",
      "line": null
    },
    {
      "severity": "error",
      "message": "eval 6 expectation failed: \"Reports failed expectations verbatim with the grader's evidence\" \u2014 The agent's final report (transcript.md:327-338) contains zero grader output or failed-expectation text; it only reports the deterministic finding 'no evals/evals.json \u2014 author evals first (see TR01)'\u2026",
      "file": "evals/evals.json",
      "line": null
    },
    {
      "severity": "error",
      "message": "eval 6 expectation failed: \"Relies on the cache for unchanged re-runs instead of passing --fresh by default\" \u2014 No re-run of any kind occurs in the transcript \u2014 `shakespii test` is invoked exactly once (transcript.md:272) and the session ends after the agent asks the human whether to author evals (transcript.md\u2026",
      "file": "evals/evals.json",
      "line": null
    }
  ],
  "expectations": {
    "passed": 11,
    "total": 21
  }
}
```

### Retro-scan of archived M4b-2 artifacts (verbatim)

```
8ae2c430706dbfed: [{"skill":"compress","count":1}]
0fc562227beb9fd4: [{"skill":"compress","count":1}]
2ad167ddd21d6076: [{"skill":"compress","count":1}]
0670d7bc69a220a9: [{"skill":"compress","count":1}]
33e94236cfe36ce2: [{"skill":"compress","count":1}]
b2228a2aaf0874e4: [{"skill":"compress","count":1}]
2f075197d8baa748: [{"skill":"compress","count":1}]
57a492fc8229c14b: [{"skill":"compress","count":1}]
1203247934764356: [{"skill":"compress","count":1}]
RETRO-SCAN bare=9 flaggedCompress=9
```

### Predictions vs actuals

| # | Prediction | Actual | Verdict |
|---|---|---|---|
| 1 | without_skill pass_rate drops, mean ∈ [0.40, 0.85] | 0.7222 | HOLDS |
| 2 | delta pass_rate ∈ [+0.10, +0.45] | +0.06 | MISS (direction right, magnitude under — adjudication 4) |
| 3 | with_skill pass_rate ∈ [0.80, 1.00] | 0.7778 | MISS (marginal — adjudication 5) |
| 4 | trigger accuracy ∈ [0.90, 1.00] | 0.80 (16/20) | MISS (structural — adjudication 6) |
| 5 | grader retries ≤ 2, zero fail-fast aborts | 0 retries, 0 aborts, 0 fail files | HOLDS |
| 6 | zero contamination warnings in new sweeps | 0 warnings | HOLDS |
| 7 | retro-scan flags compress in ≥ 1 archived bare dir | 9/9 bare dirs flagged | HOLDS |
| 8 | eval-5 scenario < 200 s, no timeout | 67.54 s, ok | HOLDS |

Scenario grading failures (10/21 expectations) were not covered by any
prediction — a calibration-design gap, recorded as part of adjudication 7.

## Adjudication

1. **Eval-5 rewording applied (user-adjudicated, spec §10).** The CALIBRATION-M4B2
   adjudication-5 candidate — narrow the corpus-audit prompt to bound session
   length (observed: timeout in the M4b-2 pre-warm, ok at 262 s in the sweep,
   near the 300 s budget) — is applied here by user decision (spec §0.3),
   overriding the parked-with-migration default. Before/after:
   - old: "Audit all my installed skills for duplication and near-clones."
   - new: "Audit all my installed skills for duplication and near-clones. Keep it
     to a single corpus lint pass and a summary of the flagged findings — don't
     inspect skills beyond the flagged sites."
   `expected_output` and expectations unchanged. The CALIBRATION-M4B1 compress
   rewordings remain parked with the M5d migration.
2. **Isolation is partial: user skills and plugins are excluded, the user
   memory file is NOT. Class: measured structural finding (recorded for
   M5b+, no in-phase fix — spec §13 excludes further hermeticity).**
   Evidence: the failing eval-2 run's init event lists `skills` = the mount
   plus built-ins only (no compress, no personal skills) and `plugins: []`,
   and six bare bench runs produced zero compress invocations (vs 9/9 in the
   archived M4b-2 runs) — the M4b-2 defect is fixed and measured fixed. But
   the transcript's first action is a ToolSearch for the exact ai-cortex
   select string that occurs verbatim in `~/.claude/CLAUDE.md` (1 match
   there, 0 in the mounted skill) — the user memory file still enters
   isolated sessions. Impact: identical in both bench configurations (delta
   remains internally fair), but it perturbs scenario behavior
   (adjudication 7) and adds first-action noise to trigger sessions.
3. **Prediction 1 held with the predicted mechanism.** The bare baseline
   dropped 1.0 → 0.7222 once the global compress skill stopped answering
   for it.
4. **Prediction 2 miss (delta +0.06 below [+0.10, +0.45]). Class:
   miscalibration.** with_skill dropped too (0.8889 → 0.7778): the old
   environment (plugins/hooks) assisted BOTH configurations, so removing it
   compressed the delta rather than widening it.
5. **Prediction 3 miss (0.7778 vs [0.80, 1.00], marginal). Class:
   miscalibration.** Same environment effect plus one zero-scoring eval-3
   run (min 0, the known M4b-2 flake class).
6. **Prediction 4 miss (trigger accuracy 0.80 vs [0.90, 1.00]). Class:
   miscalibration with a structural cause.** All four failures are
   POSITIVES under-firing (q1 "Run shakespii lint…" 0/3, q3 1/3, q4 0/3,
   q8 0/3); every negative held (zero over-triggering). The M4b-2 accuracy
   1.00 was measured with the superpowers plugin's session-start injection
   ("if there is even a 1% chance a skill might apply you MUST invoke the
   skill") and a duplicate user-level copy of using-shakespii in scope —
   both now excluded. 0.80 is the honest un-primed baseline. Improvement
   candidates RECORDED, not applied: description/trigger-phrasing
   optimization moves to the M5b writer with this clean baseline.
7. **Scenario grading failures — 10/21 expectations across evals 1, 2, 6.
   Class: environment + eval-authoring (zero harness bugs).** Structural
   cause: the residual user memory file (adjudication 2) instructs
   "describe your approach and wait for approval" / "ask clarifying
   questions before starting" — in a headless single-turn session the agent
   asks and the session ends (eval-2 transcript ends with four clarifying
   questions and "Answer these, then run `using-shakespii` to scaffold");
   eval-6's confirm-before---run expectation stalls the same way. All six
   executor runs completed ok in 26.62–67.54 s; gradings were valid and
   cached. Improvement candidates RECORDED, not applied: headless-aware
   eval expectations and/or skill-body guidance for non-interactive
   contexts — travels to M5b with the writer.
8. **Predictions 5–8 held** (zero grader retries — the Task 9 tolerance
   absorbed the M4b-2 non-JSON class entirely; zero contamination warnings;
   retro-scan 9/9 — the M4b-2 bare baseline was fully contaminated, not
   just the three transcript-verified runs; eval-5 at 67.54 s under the
   narrowed prompt vs 262 s + timeouts before).

Zero harness bugs: no code, profile, eval, or query changes made in-phase
(the Task 12 eval-5 rewording was a pre-sweep, spec-mandated change).

## Cache proofs

1. **BENCH-REPLAY-OK** — second `bench … --json` byte-identical (`cmp`
   silent) at zero live sessions; pretty re-run reports `18/18 run(s)
   cached`.
2. **TRIGGER-REPLAY-OK** — replay fully cached (every trigger rep
   `cached === reps`, every scenario run `cached: true`) and sweep vs
   replay identical after normalizing cache metadata only (trigger
   `runs[].cached`; scenario `runs[].cached` + `durationSeconds`). The
   replay exits 1 with the same cached grading findings — failed
   expectations cache and replay deterministically by design.
