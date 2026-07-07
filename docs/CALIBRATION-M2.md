# M2 calibration run — seed rules vs dogfood corpus

**Date:** 2026-07-07 · **Profile:** default · **Command:** `bun scripts/calibrate.ts`
Corpus is read-only: findings here drive profile/rule tuning, never edits to installed skills.

Seed rules wired at M2: **FM01, FM02, FM04, CT03, ST02, PH01** (`src/lib/rules/index.ts`). The
other 22 profiled rules are declared in `profiles/default.yaml` but not yet implemented, so they
cannot fire during this sweep. All findings below come from those six rules only.

## Predictions (from docs/AUDIT-2026-07-07.md)

| Prediction | Source |
|---|---|
| CT03 fires on ~10/13 personal skills | Audit S4 |
| FM04 near-silent on superpowers (13/14 start "Use when"); bites the personal corpus | Audit Part 2 |
| PH01 fires nowhere (no live scaffolds installed) | M1 spec §3.5 |
| ST02: compress references a nonexistent path | Audit (compress benchmark) |

## Actual counts

<!-- pasted verbatim from scripts/calibrate.ts -->

## /Users/vuphan/.claude/skills — 13 skills

| Rule | Errors | Warnings | Skills affected |
|---|---|---|---|
| CT03 | 13 | 0 | 13 |
| FM04 | 13 | 0 | 12 |

## /Users/vuphan/.claude/plugins/cache/claude-plugins-official/superpowers/6.1.1/skills — 14 skills

| Rule | Errors | Warnings | Skills affected |
|---|---|---|---|
| CT03 | 14 | 0 | 14 |
| FM04 | 1 | 0 | 1 |
| ST02 | 1 | 0 | 1 |

**Notes on the counts.** The personal root holds 14 directories, but `personal-preferences/` has
no `SKILL.md` (the empty dir the audit flagged) and is skipped, leaving 13 linted skills. FM04's
personal row shows 13 errors across 12 skills because `find-skills` trips both FM04 branches at once
(first-person pronoun *and* non-trigger-first opening). PH01 does not appear in either table,
confirming the prediction. FM04's lone personal pass is `ai-whisper-plan-execution`; its lone
superpowers failure is `brainstorming`.

## Adjudications

Protocol: every deviation from a prediction gets one row, classified `rule-logic bug` (fix code),
`miscalibration` (edit profile options), or `audit-miss` (genuine finding the audit did not predict —
document only). Preference is documentation over code/profile churn unless the evidence is
unambiguous. Each deviation below was investigated against the offending skill's real content before
classification.

| Deviation | Classification | Action taken |
|---|---|---|
| CT03 fires on **13/13** personal skills, not ~10/13. The audit's Ex=Y skills (caveman, compress, find-skills) also fire. | audit-miss | None (no code/profile change). Investigation: the audit's "genuine examples" is a looser human judgment than CT03's structural contract. `compress` and `find-skills` place their before/after material under `## Pattern` and step-by-step prose, not an Examples-canonical/alias heading → "no Examples section found". `caveman` has a real `## Examples` section with a genuine user-question→caveman-answer demo, but labels it with skill-specific cues (`**User:**`, `**Caveman:**`, `**Normal:**`) that are absent from CT03's general input/output marker vocabulary → "no concrete input→output worked example". No clean general marker fix exists: adding `user:` alone would not clear caveman (no matching output marker follows it in-section), and adding `caveman:`/`normal:` as universal output markers would overfit the linter to one skill. CT03 is correctly enforcing the stricter content contract; the audit's ~10 estimate undercounted. |
| ST02 does **not** fire on `compress` (predicted to flag a nonexistent path). | audit-miss | None. Investigation: `compress/SKILL.md` contains zero markdown links, and ST02 (`extractLinks` over the SKILL.md body) only inspects SKILL.md sibling-file link targets. The broken reference the audit cited (`tests/caveman-compress/`) lives in `scripts/benchmark.py` (a Python glob, `__file__.parent.parent.parent / "tests" / "caveman-compress"`) and in `README.md` — both outside ST02's scope. The prediction mis-scoped the rule. The broken-fixture defect is real (audit S2) but belongs to a future "script references a nonexistent fixture" rule, not ST02; extending ST02 to parse Python globs would be unreliable scope creep. Documented as a coverage gap; no change. |
| ST02 **does** fire on `subagent-driven-development` (superpowers) — unpredicted. | audit-miss | None. Investigation: SKILL.md line 270 links `../requesting-code-review/code-reviewer.md`, a cross-skill relative link that escapes the skill directory. This is exactly ST02's contract (no `../`, one level deep, self-contained). Verified true positive — the target sits inside a sibling skill, not this skill's dir. ST02 is behaving correctly; the audit simply did not predict it. |
| CT03 fires on **14/14** superpowers skills — unpredicted (predictions table is silent on CT03 vs superpowers). | audit-miss | None. Investigation: consistent with Audit Part 2 ("no shipped evals," no declared worked examples in the reference corpus). Three skills carry Example-type headings (`## Example` in requesting-code-review; `## Example Workflow` in subagent-driven-development; `## Example: Bug Fix` in test-driven-development). The anatomy matcher is exact-normalized, so only the bare `## Example` matches the alias; its content is a workflow transcript with no input/output markers → still fires. The two decorated headings ("Example Workflow", "Example: Bug Fix") do not match the alias set and report "no Examples section found." Prefix/substring matching was considered and rejected: it risks over-matching unrelated headings (e.g. "Examples of failure") and would not change any count here. CT03's 14/14 is a true-positive pattern; documented, no change. |

## Outcome

After adjudication, all four deviations resolve to **audit-miss** — genuine, correctly-fired (or
correctly-silent) findings that the audit's prediction table under-specified — with **zero rule-logic
bugs and zero miscalibrations**. No rule code and no profile option was changed, so the full suite
(59 pass), the keystone init-output test (18 PH01 + 1 FM04 + 1 CT03), and the profile-consistency
test (28 rules, CT03 token === PH01 token) remain green. The confirmed predictions held cleanly: PH01
fired nowhere; FM04 was near-silent on superpowers (13/14 pass, only `brainstorming`'s "You MUST use
this…" opening trips it) and bit the personal corpus hard (12/13, only the best-engineered
`ai-whisper-plan-execution` passing). The two "misses" were both a stricter reality than the audit's
prose implied — CT03's content contract is harder to satisfy than a human reviewer's "there are
examples" checkmark (13/13 and 14/14 rather than the audited ~10), and ST02's scope is narrower and
more precise than the audit's freehand claim (it correctly ignores a path buried in a script and
correctly catches a `../` cross-skill escape the audit never mentioned). Net: the six-rule seed set
matches — and in places sharpens — the audit's picture of the corpus, and the profile needs no tuning
at M2.
