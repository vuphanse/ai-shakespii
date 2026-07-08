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

(recorded verbatim after the sweep)

## Cache proof

(recorded after the second sweep)

## Fixture validation

(events.jsonl shape comparison vs tests/fixtures/harness/stream-json/)

## Adjudications

(classes: harness bug / miscalibration / eval-authoring miss;
grader-verdict disputes recorded with evidence; expectation rewording is
recorded, never applied in this commit)
