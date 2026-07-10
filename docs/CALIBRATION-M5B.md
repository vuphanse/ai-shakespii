# CALIBRATION-M5B — writer-as-skill

Milestone M5b calibration: using-shakespii v0.6.0 (headless-safe evals,
re-scoped description) and authoring-skills v0.1.0, measured live after the
hermeticity spike's RESOLVED-UPSTREAM verdict (docs/HERMETICITY.md — the user
memory file no longer enters harness sessions on claude CLI 2.1.202; cache
epoch stays 2, so no new cache proofs are owed and the M5a proofs remain
authoritative).

## Predictions

Committed before any live run (M5a protocol). Ranges, each with its
mechanism.

1. **using-shakespii scenario suite exits 0** (all six evals pass grading).
   Mechanism: both M5a adjudication-7 failure mechanisms are gone — the
   ask-and-stall expectations were reworded pre-sweep (Task 5) and the
   memory file that injected ask-before-acting rules is excluded upstream
   (HERMETICITY.md). Named risk: the eval-3 zero-scoring flake class seen in
   M4b-2/M5a.
2. **using-shakespii trigger accuracy ∈ [0.85, 1.00]** (17–20 of 20) on the
   first post-re-scope measurement, against the 0.80 un-primed baseline.
   Mechanism: the description now carries the under-firing queries'
   vocabulary (lint, audit, validate, frontmatter, evals, trigger accuracy,
   bench), so q1/q3/q4/q8 should recover. Named risk: flipped q2 ("Create a
   new skill called changelog-writer", now a negative) may still fire —
   the description retains "scaffolding one with the shakespii CLI".
3. **Description-loop iterations to hold ≥ 0.8 with no regressions ∈ [0, 2]**
   (0 = the first measurement already holds).
4. **authoring-skills scenario suite exits 0 within ≤ 2 skill-body fix
   iterations.** Named risk (the sweep's highest): eval 1 asks for a full
   init → fill → lint-loop in one headless session against the 300 s
   timeout; the prompt's brevity instruction is the mitigation. Per the
   no-mid-sweep-rewording rule, an eval-authoring defect here is recorded
   and adjudicated, not patched.
5. **authoring-skills trigger accuracy ∈ [0.75, 1.00]** on first measurement,
   reaching ≥ 0.8 within ≤ 2 description iterations. Mechanism: the
   description was authored against the interview's trigger vocabulary and
   the negatives are adversarial (four using-shakespii intents).
6. **Zero contamination warnings** across every M5b run. Mechanism: M5a
   isolation held at zero; the only mounted non-target surfaces are
   built-ins.
7. **Zero grader retries.** Mechanism: the M5a outermost-brace tolerance
   absorbed the whole observed non-JSON reply class.
8. **Cache epoch unchanged (2); no replay proofs owed.** Mechanism:
   RESOLVED-UPSTREAM verdict — no runner change, no key-formula change; the
   M5a BENCH-REPLAY-OK / TRIGGER-REPLAY-OK proofs remain authoritative.

## Actuals

(Recorded after the sweeps; verbatim stage objects.)

## Predictions vs actuals

(Filled with the actuals.)

## Adjudication

(Filled with the actuals.)

## Cache proofs

Not owed this milestone (prediction 8): the epoch did not move.
