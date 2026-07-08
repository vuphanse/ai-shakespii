# M4a calibration — TR01 rule, `shakespii test` CLI, migrated evals

**Date:** 2026-07-08 · **Profile:** default · Corpus strictly read-only throughout.

## Corpus roots

- Personal: `~/.claude/skills`
- Superpowers: `~/.claude/plugins/cache/claude-plugins-official/superpowers/6.1.1/skills`

## Baseline (M3b, copied verbatim from the sweep tables in `docs/CALIBRATION-M3B.md`)

Post-fix stdout (byte-identical to the first run's stdout; `personal-preferences` accounting
was a `skipped`-reporting fix only, no rule's findings changed):

```
## /Users/vuphan/.claude/skills — 14 skills

| Rule | Errors | Warnings | Skills affected |
|---|---|---|---|
| CT01 | 13 | 0 | 13 |
| CT02 | 12 | 0 | 12 |
| CT03 | 13 | 0 | 13 |
| CT04 | 0 | 13 | 13 |
| CT05 | 0 | 13 | 13 |
| CT06 | 0 | 12 | 12 |
| CT07 | 7 | 0 | 7 |
| FM04 | 13 | 0 | 12 |
| FM05 | 13 | 0 | 13 |
| HY04 | 0 | 1 | 1 |
| HY05 | 0 | 1 | 1 |
| ST03 | 0 | 1 | 1 |
| ST04 | 5 | 0 | 5 |

### Corpus findings

- XS01 (warn): 52-line block shared by 3 skills — extract to a shared reference — sites: ai-whisper-bugfix, ai-whisper-deliberation, ai-whisper-ralph
- XS01 (warn): 54-line block shared by 2 skills — extract to a shared reference — sites: ai-whisper-bugfix, ai-whisper-ralph
- XS01 (warn): 30-line block shared by 4 skills — extract to a shared reference — sites: ai-whisper-bugfix, ai-whisper-deliberation, ai-whisper-ralph, ai-whisper-sdd
- XS01 (warn): 29-line block shared by 4 skills — extract to a shared reference — sites: ai-whisper-bugfix, ai-whisper-deliberation, ai-whisper-quick-task, ai-whisper-ralph
- XS01 (warn): 17-line block shared by 4 skills — extract to a shared reference — sites: ai-whisper-bugfix, ai-whisper-deliberation, ai-whisper-quick-task, ai-whisper-ralph
- XS01 (warn): 22-line block shared by 3 skills — extract to a shared reference — sites: ai-whisper-bugfix, ai-whisper-ralph, ai-whisper-sdd
- XS01 (warn): 21-line block shared by 5 skills — extract to a shared reference — sites: ai-whisper-bugfix, ai-whisper-deliberation, ai-whisper-quick-task, ai-whisper-ralph, ai-whisper-sdd
- XS01 (warn): 20-line block shared by 2 skills — extract to a shared reference — sites: ai-whisper-deliberation, ai-whisper-sdd
- XS01 (warn): 49-line block shared by 2 skills — extract to a shared reference — sites: ai-whisper-quick-task, ai-whisper-sdd
- XS01 (warn): 29-line block shared by 2 skills — extract to a shared reference — sites: ai-whisper-quick-task, ai-whisper-sdd

## /Users/vuphan/.claude/plugins/cache/claude-plugins-official/superpowers/6.1.1/skills — 14 skills

| Rule | Errors | Warnings | Skills affected |
|---|---|---|---|
| CT01 | 14 | 0 | 14 |
| CT02 | 14 | 0 | 14 |
| CT03 | 14 | 0 | 14 |
| CT04 | 0 | 14 | 14 |
| CT05 | 0 | 6 | 6 |
| CT06 | 0 | 4 | 4 |
| CT07 | 10 | 0 | 10 |
| FM04 | 1 | 0 | 1 |
| FM05 | 14 | 0 | 14 |
| HY03 | 0 | 1 | 1 |
| HY06 | 0 | 1 | 1 |
| ST01 | 2 | 2 | 3 |
| ST02 | 1 | 0 | 1 |
| ST03 | 0 | 13 | 6 |
| ST05 | 0 | 1 | 1 |
```

No `corpusFindings` block for the superpowers root (zero XS findings of either kind).
`skipped`: personal root reports `personal-preferences — broken symlink` (post-fix); superpowers
root reports none. Zero `runError` entries on either root.

**Derived baseline totals** (single-skill errors/warnings summed from the tables above, plus
corpus findings, per the CLI's `summary` contract — `src/cli/format/corpus-json.ts` sums
`skills[].findings` and `corpusFindings` severities together):

| Root | Single-skill errors | Single-skill warnings | Corpus findings (warn) | **Total errors** | **Total warnings** |
|---|---|---|---|---|---|
| Personal (`~/.claude/skills`) | 76 | 41 | 10 (XS01) + 0 (XS02) | **76** | **51** |
| Superpowers | 70 | 42 | 0 | **70** | **42** |

## Predictions (written before the sweep)

| # | Prediction | Basis |
|---|---|---|
| P1 | Personal root: TR01 fires exactly once per discovered skill except `using-shakespii` (migrated evals validate) — expected 13 TR01 warns; warnings total = M3b baseline + 13; errors total unchanged | zero `evals.json` existed in the corpus pre-M4a (verified pre-spec); using-shakespii symlinks to the repo skill |
| P2 | Superpowers root: TR01 fires exactly once per skill — expected 14 TR01 warns; warnings total = M3b baseline + 14; errors total unchanged | no superpowers skill ships evals |
| P3 | Every TR01 finding is shape 1 (`skill ships no evals/evals.json`) — zero shape 2/3 in both corpora | no corpus skill ships any evals.json at all |
| P4 | `shakespii test ~/.claude/skills/compress` exits 1 with the single missing-evals error ("before" evidence for the repair) | live compress has no evals/ |
| P5 | `shakespii test ~/.claude/skills/using-shakespii` exits 0 with `{ errors: 0, warnings: 0 }` | weld skill, migrated evals |
| P6 | `shakespii test tests/fixtures/harness/compress` exits 0 (the "after" evidence) | Task 9 keystone |
| P7 | Scaffold keystone `{ errors: 20, warnings: 0 }`, weld `{ 0, 0 }`, corpus keystone byte-identical | Tasks 5–6 blast-radius rule |

Arithmetic implied by P1/P2 against the derived baseline above: personal-root total warnings
51 + 13 = **64** (errors unchanged at 76); superpowers-root total warnings 42 + 14 = **56**
(errors unchanged at 70).

## Actual counts (verbatim)

Sweep commands (read-only; capture files outside the repo):

```bash
bun src/cli/index.ts lint ~/.claude/skills --corpus --json > /tmp/m4a-personal.json; echo "exit=$?"
bun src/cli/index.ts lint ~/.claude/plugins/cache/claude-plugins-official/superpowers/6.1.1/skills --corpus --json > /tmp/m4a-superpowers.json; echo "exit=$?"
bun src/cli/index.ts test ~/.claude/skills/compress --json; echo "exit=$?"
bun src/cli/index.ts test ~/.claude/skills/using-shakespii --json; echo "exit=$?"
bun src/cli/index.ts test tests/fixtures/harness/compress --json; echo "exit=$?"
```

Exit codes: personal lint `1`, superpowers lint `1` (both expected — each root still carries its
baseline errors; TR01 is a warn-only rule so it cannot flip either exit code), test-compress `1`,
test-using-shakespii `0`, test-fixture-compress `0`.

### Personal root (`~/.claude/skills`) — `summary` (verbatim JSON)

```json
{
  "skills": 14,
  "skipped": 1,
  "errors": 76,
  "warnings": 64
}
```

`skipped`: `[{ "dir": "/Users/vuphan/.claude/skills/personal-preferences", "reason": "broken symlink" }]` — unchanged from the M3b post-fix run.

Per-rule breakdown (`jq` over `.skills[].findings`, grouped by `ruleId`) — every row byte-identical
to the M3b baseline table above except the new `TR01` row:

| Rule | Errors | Warnings |
|---|---|---|
| CT01 | 13 | 0 |
| CT02 | 12 | 0 |
| CT03 | 13 | 0 |
| CT04 | 0 | 13 |
| CT05 | 0 | 13 |
| CT06 | 0 | 12 |
| CT07 | 7 | 0 |
| FM04 | 13 | 0 |
| FM05 | 13 | 0 |
| HY04 | 0 | 1 |
| HY05 | 0 | 1 |
| ST03 | 0 | 1 |
| ST04 | 5 | 0 |
| **TR01** | **0** | **13** |

TR01 per-skill (`jq '[.skills[] | {name, tr01: [.findings[] | select(.ruleId == "TR01")]}]'`):
all 13 non-`using-shakespii` skills (`ai-14all-fix-review`, `ai-14all-session-status`,
`ai-whisper-bugfix`, `ai-whisper-code-review`, `ai-whisper-deliberation`,
`ai-whisper-deliberation-craft`, `ai-whisper-plan-execution`, `ai-whisper-quick-task`,
`ai-whisper-ralph`, `ai-whisper-sdd`, `caveman`, `compress`, `find-skills`) each carry exactly
one `TR01` finding, verbatim message `skill ships no evals/evals.json — no reproducible eval`,
severity `warn`, `file: "SKILL.md"`, `line: null`. `using-shakespii` carries zero `TR01`
findings. Corpus composition has grown since the M3b sweep (5 new personal skills —
`ai-14all-fix-review`, `ai-14all-session-status`, `ai-whisper-code-review`,
`ai-whisper-deliberation-craft`, `ai-whisper-plan-execution` — replaced whatever filled those
slots at M3b time) but the discovered-skill *count* is unchanged at 14, so P1's arithmetic still
lands exactly.

`corpusFindings`: 10 (all `XS01`, all `warn`) — byte-identical set to the M3b baseline (same
sites, same block lengths). Zero `XS02` findings — unchanged (miscalibration, not re-litigated
here).

### Superpowers root — `summary` (verbatim JSON)

```json
{
  "skills": 14,
  "skipped": 0,
  "errors": 70,
  "warnings": 56
}
```

`skipped`: `[]` — unchanged. Per-rule breakdown, byte-identical to the M3b baseline table except
the new `TR01` row:

| Rule | Errors | Warnings |
|---|---|---|
| CT01 | 14 | 0 |
| CT02 | 14 | 0 |
| CT03 | 14 | 0 |
| CT04 | 0 | 14 |
| CT05 | 0 | 6 |
| CT06 | 0 | 4 |
| CT07 | 10 | 0 |
| FM04 | 1 | 0 |
| FM05 | 14 | 0 |
| HY03 | 0 | 1 |
| HY06 | 0 | 1 |
| ST01 | 2 | 2 |
| ST02 | 1 | 0 |
| ST03 | 0 | 13 |
| ST05 | 0 | 1 |
| **TR01** | **0** | **14** |

TR01 fires on all 14 superpowers skills, same verbatim shape-1 message, severity `warn`. Zero
`corpusFindings` on this root — unchanged.

### `shakespii test` outputs (verbatim JSON)

`shakespii test ~/.claude/skills/compress --json`, exit `1`:

```json
{
  "version": 1,
  "mode": "test",
  "skill": { "dir": "/Users/vuphan/.claude/skills/compress", "name": "compress" },
  "stages": [
    { "stage": "deterministic", "status": "fail", "findings": [
      { "severity": "error", "message": "no evals/evals.json — author evals first (see TR01); shakespii test requires a reproducible eval suite", "file": "evals/evals.json", "line": null }
    ] },
    { "stage": "scenario", "status": "unavailable", "note": "ships in M4b" },
    { "stage": "grading", "status": "unavailable", "note": "ships in M4b" }
  ],
  "summary": { "errors": 1, "warnings": 0 }
}
```

`shakespii test ~/.claude/skills/using-shakespii --json`, exit `0`:

```json
{
  "version": 1,
  "mode": "test",
  "skill": { "dir": "/Users/vuphan/.claude/skills/using-shakespii", "name": "using-shakespii" },
  "stages": [
    { "stage": "deterministic", "status": "pass", "findings": [] },
    { "stage": "scenario", "status": "unavailable", "note": "ships in M4b" },
    { "stage": "grading", "status": "unavailable", "note": "ships in M4b" }
  ],
  "summary": { "errors": 0, "warnings": 0 }
}
```

`shakespii test tests/fixtures/harness/compress --json`, exit `0`:

```json
{
  "version": 1,
  "mode": "test",
  "skill": { "dir": "/Users/vuphan/Dev/ai-shakespii/tests/fixtures/harness/compress", "name": "compress" },
  "stages": [
    { "stage": "deterministic", "status": "pass", "findings": [] },
    { "stage": "scenario", "status": "unavailable", "note": "ships in M4b" },
    { "stage": "grading", "status": "unavailable", "note": "ships in M4b" }
  ],
  "summary": { "errors": 0, "warnings": 0 }
}
```

### Suite evidence for P7 (scaffold / weld / corpus keystones)

`bun test tests/cli/keystone.test.ts tests/cli/test-keystone.test.ts tests/cli/corpus-keystone.test.ts tests/skill/using-shakespii.test.ts`:

```
bun test v1.3.14 (0d9b296a)

 10 pass
 0 fail
 123 expect() calls
Ran 10 tests across 4 files. [657.00ms]
```

Full unpiped suite: `bun test` — `308 pass`, `0 fail`, `783 expect() calls`, `Ran 308 tests
across 50 files`, exit `0`. `bun run typecheck` (`tsc --noEmit`) — exit `0`, no output. The sweep
did not change any test outcome.

## Adjudications

Protocol: every deviation from a prediction gets one row, classified `rule-logic bug` (fix code,
RED fixture first), `miscalibration` (record evidence + proposed profile-option change, never
edit `profiles/default.yaml`), or `audit-miss` (document only).

**Zero deviations.** All seven predictions (P1–P7) held exactly:

- **P1** — personal root: 13 TR01 warns, one per discovered skill except `using-shakespii`;
  warnings total 64 = baseline 51 + 13; errors total unchanged at 76. Confirmed exactly.
- **P2** — superpowers root: 14 TR01 warns, one per skill; warnings total 56 = baseline 42 + 14;
  errors total unchanged at 70. Confirmed exactly.
- **P3** — all 27 TR01 findings across both roots (13 + 14) are shape 1
  (`skill ships no evals/evals.json — no reproducible eval`); zero shape 2 (validation errors)
  or shape 3 (thin case count) findings anywhere. Confirmed exactly.
- **P4** — `shakespii test ~/.claude/skills/compress --json` exits `1` with exactly one finding,
  the shape-1 harness message on `evals/evals.json`. Confirmed exactly.
- **P5** — `shakespii test ~/.claude/skills/using-shakespii --json` exits `0` with
  `{ errors: 0, warnings: 0 }`. Confirmed exactly.
- **P6** — `shakespii test tests/fixtures/harness/compress --json` exits `0`. Confirmed exactly.
- **P7** — scaffold keystone (`tests/cli/keystone.test.ts`) still asserts
  `{ errors: 20, warnings: 0 }` with `TR01` absent; weld (`tests/skill/using-shakespii.test.ts`)
  still asserts `{ errors: 0, warnings: 0 }`; corpus keystone (`tests/cli/corpus-keystone.test.ts`)
  fixtures unchanged. All four keystone files pass (10/10); full suite green (308/308);
  `tsc --noEmit` clean. Confirmed exactly.

No rule-logic bugs, no miscalibrations, and no audit-misses were found. The one substantive
observation outside the predictions table: the personal root's corpus *composition* has drifted
since the M3b sweep (`ai-14all-fix-review`, `ai-14all-session-status`, `ai-whisper-code-review`,
`ai-whisper-deliberation-craft`, `ai-whisper-plan-execution` are new relative to M3b's skill set),
mirroring the M3-to-M3b drift precedent (`personal-preferences` going dangling). This did not
produce a deviation here because the discovered-skill count held at 14 and every pre-existing
rule's error/warning/skills-affected numbers are byte-identical to the M3b baseline table — the
drift is noted for the record, not adjudicated, since nothing in P1–P7 depended on which 14 named
skills make up the count.

## Outcome

**Zero deviations, zero code changes.** All seven predictions (P1–P7) were confirmed exactly by
the read-only sweep: TR01 fires once per skill as a `warn`-severity, shape-1-only finding on both
corpus roots (13 personal, 14 superpowers), lifting each root's warning total by precisely the
predicted amount while leaving every pre-existing rule's counts, the error totals, and the XS01
corpus findings byte-identical to the M3b baseline. The `shakespii test` harness evidence
(P4–P6) reproduces the "before" (live `compress`, exit 1, single missing-evals error), "after"
(repaired fixture, exit 0), and "weld" (`using-shakespii`, exit 0, `{0, 0}`) shapes exactly as
predicted, and the automated keystone suite (P7) — scaffold `{20, 0}` with `TR01` silent, weld
`{0, 0}`, corpus fixtures unchanged — passes in full alongside the rest of the 308-test suite and
a clean `tsc --noEmit`.

Corpus untouched: no file under `~/.claude/skills` or the superpowers cache root was created,
modified, or deleted (`find ... -newer <capture-file>` empty on both roots post-sweep; the
harness's on-disk cache, when it is ever exercised, lives under `~/.cache/shakespii` —
`src/lib/harness/run-dir.ts` — never inside a skill directory, and the deterministic stage run
here never calls `ensureRunDir`). `profiles/default.yaml` and `src/` are untouched by this task —
no rule-logic bug was found, so no fix was warranted.

