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

(recorded in Task 13, committed before any sweep)

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
