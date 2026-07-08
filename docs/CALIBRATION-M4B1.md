# M4b-1 calibration — executor + grader live sweep

Budget (spec §0.4): using-shakespii (5 evals) + compress fixture (3 evals),
1 run/eval, sonnet. Sequencing rule (spec §10): this sweep runs BEFORE the
using-shakespii v0.4.0 changes; the suite has exactly 5 cases at sweep time.

## Predictions (committed before the sweep)

- P1: `shakespii test skills/using-shakespii --run` exits 0 or 1 with all 5
  scenario runs `status: "ok"` (no executor timeouts/crashes).
- P2: `shakespii test tests/fixtures/harness/compress --run` exits 0 or 1
  with all 3 scenario runs `status: "ok"`; eval 1's staged
  `evals/files/sample-memory.md` is present in the run workspace.
- P3: every produced grading.json passes validateGradingJson and rubric
  fidelity (no grader-invalid findings on either skill).
- P4: compress evals 1–3 pass-rate ≥ 0.5 each (the repaired fixture is
  runnable and the skill's procedure is followable by sonnet).
- P5: immediate second sweep of both skills: 8/8 runs `cached: true`,
  zero runner sessions, sub-second wall time per skill.
- P6: captured events.jsonl streams contain only event shapes already
  covered by the hand-authored parser fixtures (assistant text/tool_use,
  user tool_result, result) — any novel shape strengthens the fixtures.

## Actuals

**Date:** 2026-07-08 · **Model:** sonnet (harness default, `--model` omitted) ·
`SHAKESPII_CACHE_DIR` unset → default cache root `~/.cache/shakespii`.

Operational note: a first launch of sweep 1 from a backgrounded shell was killed
with its parent agent session before producing any artifacts (no cache entries,
empty capture file; at most a partial eval-1 executor session was started before
the kill). The sweeps below are the foreground re-runs; all recorded artifacts
come from them.

Sweep commands (sequential, foreground):

```bash
bun src/cli/index.ts test skills/using-shakespii --run --json; echo "exit=$?"
bun src/cli/index.ts test tests/fixtures/harness/compress --run --json; echo "exit=$?"
```

### Sweep 1 — `skills/using-shakespii`, exit `1`, wall 13:02

Verbatim `--json` report:

```json
{
  "version": 1,
  "mode": "test",
  "skill": {
    "dir": "/Users/vuphan/Dev/ai-shakespii/skills/using-shakespii",
    "name": "using-shakespii"
  },
  "stages": [
    {
      "stage": "deterministic",
      "status": "pass",
      "findings": []
    },
    {
      "stage": "scenario",
      "status": "fail",
      "findings": [
        {
          "severity": "error",
          "message": "eval 5: executor timeout — timed out after 300000ms",
          "file": "evals/evals.json",
          "line": null
        }
      ],
      "runs": [
        {
          "evalId": 1,
          "cached": false,
          "status": "ok",
          "durationSeconds": 170.57
        },
        {
          "evalId": 2,
          "cached": false,
          "status": "ok",
          "durationSeconds": 35.74
        },
        {
          "evalId": 3,
          "cached": false,
          "status": "ok",
          "durationSeconds": 42.51
        },
        {
          "evalId": 4,
          "cached": false,
          "status": "ok",
          "durationSeconds": 60.53
        },
        {
          "evalId": 5,
          "cached": false,
          "status": "timeout",
          "durationSeconds": 300.01
        }
      ]
    },
    {
      "stage": "grading",
      "status": "fail",
      "findings": [
        {
          "severity": "error",
          "message": "eval 2 expectation failed: \"Uses `shakespii init` rather than hand-rolling the directory layout\" — Only 3 Bash calls occurred (version check, PATH search, binary check); `shakespii init` was never invoked. The run ends (terminal_reason: 'completed', num_turns: 6) right after the agent states intent…",
          "file": "evals/evals.json",
          "line": null
        },
        {
          "severity": "error",
          "message": "eval 2 expectation failed: \"Leaves no scaffold placeholder tokens anywhere in the new skill\" — No new skill directory was ever created under outputs/ (only the pre-existing using-shakespii mount and metrics.json exist), so there is no scaffolded skill content to check for placeholder tokens; th…",
          "file": "evals/evals.json",
          "line": null
        },
        {
          "severity": "error",
          "message": "eval 2 expectation failed: \"Presents the skill with clean lint output and asks approval before any install\" — The session terminated after the clarifying-questions message with no shakespii lint ever run and no skill presented — the agent only stated a future intent to 'iterate shakespii lint until clean — th…",
          "file": "evals/evals.json",
          "line": null
        }
      ],
      "expectations": {
        "passed": 10,
        "total": 13
      }
    }
  ],
  "summary": {
    "errors": 4,
    "warnings": 0
  }
}
```

(Finding messages above are verbatim harness output; `gradingFindings` truncates
grader evidence at 200 chars, hence the trailing `…`. Full evidence strings are
quoted from the on-disk `grading.json` in the Adjudications section.)

### Sweep 2 — `tests/fixtures/harness/compress`, exit `1`, wall 7:35

Verbatim `--json` report:

```json
{
  "version": 1,
  "mode": "test",
  "skill": {
    "dir": "/Users/vuphan/Dev/ai-shakespii/tests/fixtures/harness/compress",
    "name": "compress"
  },
  "stages": [
    {
      "stage": "deterministic",
      "status": "pass",
      "findings": []
    },
    {
      "stage": "scenario",
      "status": "pass",
      "findings": [],
      "runs": [
        {
          "evalId": 1,
          "cached": false,
          "status": "ok",
          "durationSeconds": 63.36
        },
        {
          "evalId": 2,
          "cached": false,
          "status": "ok",
          "durationSeconds": 65.73
        },
        {
          "evalId": 3,
          "cached": false,
          "status": "ok",
          "durationSeconds": 172.63
        }
      ]
    },
    {
      "stage": "grading",
      "status": "fail",
      "findings": [
        {
          "severity": "error",
          "message": "eval 3 expectation failed: \"All URLs and identifiers survive the second pass\" — The compress CLI subprocess (task b75whendy, transcript.md lines 100-132) was still running when the session ended; events.jsonl shows `{\"type\":\"system\",\"subtype\":\"task_updated\",\"task_id\":\"b75whendy\",…",
          "file": "evals/evals.json",
          "line": null
        },
        {
          "severity": "error",
          "message": "eval 3 expectation failed: \"The file does not grow\" — No `already-compressed.original.md` backup exists anywhere under outputs/ (full file listing of outputs/ shows only the .claude mount, evals/files/already-compressed.md, and metrics.json) — per SKILL.…",
          "file": "evals/evals.json",
          "line": null
        }
      ],
      "expectations": {
        "passed": 6,
        "total": 8
      }
    }
  ],
  "summary": {
    "errors": 2,
    "warnings": 0
  }
}
```

### Per-eval grading detail (from the on-disk `grading.json` / `timing.json`)

| Skill / eval | pass_rate | passed/total | Executor s | Grader s |
|---|---|---|---|---|
| using-shakespii 1 (lint-and-fix loop) | 1.0 | 4/4 | 170.57 | 93.91 |
| using-shakespii 2 (create new skill) | 0.25 | 1/4 | 35.74 | 40.21 |
| using-shakespii 3 (negative trigger) | 1.0 | 2/2 | 42.51 | 17.88 |
| using-shakespii 4 (exit-2 handling) | 1.0 | 3/3 | 60.53 | 20.51 |
| using-shakespii 5 (corpus audit) | — (never graded) | — | 300.01 (timeout) | — |
| compress 1 (compress memory file) | 1.0 | 4/4 | 63.36 | 47.85 |
| compress 2 (code-only no-op) | 1.0 | 2/2 | 65.73 | 36.44 |
| compress 3 (idempotent second pass) | 0.0 | 0/2 | 172.63 | 69.68 |

Wall-time cross-check: sweep 1 executor+grader durations sum to 781.87 s ≈ the
13:02 wall; sweep 2 sums to 455.69 s ≈ the 7:35 wall — no unaccounted sessions.

P2's staging claim verified on disk: compress eval 1's run workspace
(`~/.cache/shakespii/runs/compress/9c3568b7a360006d/outputs/`) contains the staged
`evals/files/sample-memory.md` plus the skill-produced
`evals/files/sample-memory.original.md` backup.

Budget accounting: 8 budgeted executor sessions were spent in the sweeps (5 + 3);
the mandated cache-proof step re-ran the uncached eval 5 once more (see below),
for 9 executor sessions total. 7 grader sessions ran (eval 5 was never graded —
its executor timed out both times). Zero `grader-invalid` findings; per-case
retry counts are not persisted in run artifacts, so retries-within-budget cannot
be independently reconstructed, but every produced grading passed the gates.

## Cache proof

Immediate re-run of both commands, same shell, same cache root:

- **compress** — exit `1`, wall **0.09 s**: all 3 `runs[]` entries
  `"cached": true, "status": "ok", "durationSeconds": 0`; zero runner sessions;
  the report is byte-identical to sweep 2 except the `runs[]` cache metadata
  (verified by diffing the two reports with `runs[]` masked — every finding and
  the `expectations` totals replayed exactly from the cached `grading.json`).
- **using-shakespii** — exit `1`, wall **5:00**: evals 1–4
  `"cached": true, "status": "ok", "durationSeconds": 0` with identical replayed
  findings; eval 5 `"cached": false` re-ran live and **timed out again at
  300.01 s** (reproducible). Report identical to sweep 1 modulo `runs[]`.

The eval-5 cache miss is the designed contract, not a defect: a run is cache-hit
iff a valid `grading.json` exists under its runKey (`readValidCachedGrading`,
spec §5 self-healing cache); a timed-out executor writes none, so the proof
re-run legitimately re-spawned one runner session. P5's "8/8 cached, zero runner
sessions" wrongly assumed every first run succeeds. Note also that the re-run
re-staged the run dir (`stageRunDir` wipes on miss), so the eval-5 artifacts on
disk are from the second, reproduced timeout.

## Fixture validation

Census over all 8 captured `events.jsonl` files (636 events, 0 unparseable
lines) under `~/.cache/shakespii/runs/{compress,using-shakespii}/*/`:

| Event shape | Count |
|---|---|
| `assistant` (blocks: text 33, thinking 65, tool_use 94) | 192 |
| `user` (blocks: tool_result 94, text 5) | 99 |
| `rate_limit_event` | 9 |
| `result` (`subtype: "success"`) | 7 |
| `system:init` | 8 |
| `system:thinking_tokens` | 264 |
| `system:hook_started` / `hook_response` | 24 / 24 |
| `system:task_started` / `task_updated` / `task_notification` | 3 / 2 / 3 |
| `system:commands_changed` | 1 |

Shapes present in reality but absent from the hand-authored fixtures
(`basic.jsonl`, `no-result.jsonl`) — **P6 broken**:

1. top-level `rate_limit_event` events;
2. `system` subtypes beyond `init` (`thinking_tokens`, `hook_started`,
   `hook_response`, `task_started`, `task_updated`, `task_notification`,
   `commands_changed`);
3. `assistant` messages carrying `thinking` content blocks;
4. `user` messages carrying `text` content blocks (skill-mount injection);
5. `tool_result` blocks with **array** `content` (tool_reference lists) and with
   `is_error` absent (28 of 94 tool_results carry no `is_error` key);
6. the real `result` event field set: `subtype`, `total_cost_usd`, `modelUsage`,
   `stop_reason`, `terminal_reason`, `duration_api_ms`, `permission_denials`,
   etc., plus `usage` keys beyond `input_tokens`/`output_tokens`
   (`cache_creation_input_tokens`, `cache_read_input_tokens`, `service_tier`,
   `iterations`, …).

Strengthening applied (never weakening): new fixture
`tests/fixtures/harness/stream-json/live-shapes.jsonl` modeled on the captured
events (one representative per novel shape family), plus three characterization
tests in `tests/harness/stream-json.test.ts` locking the parser's behavior on
them — `extractFinalText`/`extractUsage` tolerate the full result field set,
`deriveMetrics` ignores thinking/system/rate-limit/user-text noise and does not
count an `is_error`-less tool_result as an error, and `renderTranscript`
JSON-stringifies array tool_result content while skipping thinking and user-text
blocks. The existing fixtures and every existing assertion are untouched. The
parser needed no code change — its tolerant-reader design already handled every
novel shape correctly; the strengthened fixtures now pin that against
regression. `bun test tests/harness/stream-json.test.ts`: 11 pass, 0 fail.

## Adjudications

Classes: harness bug / miscalibration / eval-authoring miss. Grader verdicts
that legitimately fail expectations are findings to record, not bugs to fix; no
skill or eval file is modified in this commit. Expectation rewordings are
recorded, never applied (spec §10: the sweep precedes using-shakespii v0.4.0).

**Scorecard: P1 BROKEN · P2 HELD · P3 HELD · P4 PARTIALLY BROKEN · P5 PARTIALLY
HELD · P6 BROKEN (fixtures strengthened as the prediction itself prescribed).**

- **A1 — P1 broken: using-shakespii eval 5 executor timeout, reproduced on the
  proof re-run. Class: eval-authoring miss** (with the prediction itself also
  miscalibrated). The prompt ("Audit all my installed skills for duplication and
  near-clones") stages no corpus via `files[]`, so the sandboxed workspace
  contains nothing to audit; the executor escaped to the real home directory,
  assembled a 14-skill corpus copy under /tmp, ran the real installed
  `~/.bun/bin/shakespii lint --corpus --json` over it, read remediations, wrote a
  full audit report, and cleaned up — 23 tool calls (20 Bash, 2 Read, 1 Write) —
  but exceeded the 300 s envelope before emitting a `result` event (events.jsonl
  ends mid-assistant-turn; `metrics.json`: `num_turns: 0`, tokens 0; transcript
  tail: `(no result event)`). The eval as authored cannot complete inside one
  300 s headless session. Recorded rewording (not applied): stage a small
  synthetic corpus via `files[]` and scope the prompt to it.
- **A2 — workspace escape observed (eval 5): recorded as a harness-design
  observation attached to A1, not a harness bug** (no crash, schema failure, or
  staging error; the run-dir cwd staging behaved exactly as specified). The
  executor runs with `--dangerously-skip-permissions`, and cwd staging is not
  confinement: the eval-5 executor read `~/.claude/skills`, executed the real
  installed shakespii binary, and **wrote a real file outside the workspace** —
  `~/.ai-pref-nsync/local-docs/ai-shakespii/knowledge-references/AUDIT-2026-07-08-skill-duplication.md`
  (5,166 bytes; its /tmp scratch it cleaned up itself). The stray file is left in
  place for the operator to review/delete. Follow-up recorded for M4b: evals
  whose prompts reference the real machine ("my installed skills") need either
  staged stand-ins or an isolation story.
- **A3 — P4 partially broken: compress eval 3 pass_rate 0 (evals 1–2 both 1.0).
  Class: miscalibration** of the prediction; the grader verdicts are legitimate
  and well-evidenced. Full grader evidence (grading.json, verbatim): the
  executor launched the compress CLI as a background task which was still
  running at session end — "events.jsonl shows
  `{"type":"system","subtype":"task_updated","task_id":"b75whendy","patch":{"status":"killed",...}}`
  followed by a task_notification with status "stopped" — the compression pass
  was killed before it ever ran to completion"; and "No
  `already-compressed.original.md` backup exists anywhere under outputs/ … a
  completed compression run always produces this backup. Its absence, combined
  with the killed background task, confirms the compression step never finished,
  so the file's unchanged size is not evidence of correct idempotent behavior —
  the second pass simply never ran." The burden-of-proof grading contract
  (superficial compliance is FAIL) worked exactly as designed: the input file
  surviving unchanged was correctly rejected as evidence of idempotency. Real
  skill-behavior finding recorded: the compress skill's CLI step is vulnerable
  to headless sessions ending before a backgrounded subprocess completes.
- **A4 — using-shakespii eval 2: 3 of 4 expectations failed. Class:
  eval-authoring miss.** The executor followed the skill's own procedure —
  expectation 1 ("Confirms kebab-case name, purpose, and trigger situations
  before scaffolding") PASSED on the grader's evidence that it asked exactly
  those questions — then stopped, because a single-shot headless session has no
  user to answer them; expectations 2–4 (run `shakespii init`, no placeholder
  tokens, present with clean lint) are unreachable in this harness once the
  skill's confirm-first gate fires. Grader evidence (verbatim): "The run ends
  (terminal_reason: 'completed', num_turns: 6) right after the agent states
  intent to run 'shakespii init <name>' once the user confirms — it never
  actually executed it." Recorded rewording (not applied): carry the confirmed
  name/purpose/triggers inside the eval prompt so the confirm gate is already
  satisfied, or split the case into a confirm-behavior eval and a scaffold
  eval.
- **A5 — P5 partially held: 7/8 cached (compress 3/3 at 0.09 s wall;
  using-shakespii 4/5, wall dominated by the eval-5 live re-run). Class:
  miscalibration** of the prediction, which wrongly assumed all first runs
  succeed. Timeout-not-cached-then-retry is the designed self-healing cache
  contract and behaved correctly; cached entries replayed byte-identical
  findings with zero runner sessions.
- **A6 — P6 broken: six novel event-shape families found (see Fixture
  validation). Class: miscalibration** of the prediction; the remedy the
  prediction itself prescribed — strengthen the fixtures — is applied in this
  commit (`live-shapes.jsonl` + three tests). No parser code change was needed.
- **P2 HELD** — 3/3 compress runs `ok`; staged `sample-memory.md` present in the
  eval-1 workspace (plus the produced `.original.md` backup). **P3 HELD** — all
  7 produced grading.json documents pass `validateGradingJson` and rubric
  fidelity (proven twice: at grading time and by the cache-proof replay, whose
  hit gate re-validates both); zero grader-invalid findings on either skill.
  Note P3's denominator: 7 graded cases, not 8 — eval 5 never reached the
  grader.

No harness bugs: zero crashes, zero schema failures, zero staging errors across
9 executor and 7 grader sessions. Both non-zero exit codes are grading/scenario
findings, which is the harness reporting real behavior — exactly its job.
