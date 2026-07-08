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
