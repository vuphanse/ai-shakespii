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

(recorded in Task 13)

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

## Cache proofs

(recorded in Task 13)
