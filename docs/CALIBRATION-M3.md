# M3 calibration run — full 24-rule catalog vs dogfood corpus

**Date:** 2026-07-08 · **Profile:** default · **Command:** `bun scripts/calibrate.ts`
Corpus is read-only: findings here drive profile-option tuning (never severity) or documentation, never edits to installed skills. This follows the M2 protocol exactly (docs/CALIBRATION-M2.md).

All 24 single-skill rules are wired as of Task 17 (`src/lib/rules/index.ts`): FM01–05, CT01–07, ST01–05,
HY01–06, PH01. XS01/XS02 need `--corpus` context (M3b, not yet built) and TR01/TR02 are harness-backed
(M4) — both families stay silent in this sweep regardless of their `profiles/default.yaml` entries.

**Corpus composition at sweep time.** Personal root (`~/.claude/skills/`) holds 15 directories:
`personal-preferences/` remains the empty dir flagged at M2 (skipped — no `SKILL.md`), and
`using-shakespii` has joined as this project's companion skill (symlinked in since Task 17-adjacent
work), leaving **14 linted skills** (the 13 from M2 plus one). Superpowers root is unchanged at the
pinned 6.1.1 vintage — **14 skills**. Total: 28 linted skills, not the audit's ~30 (the audit's scope
also covered skill-creator/plugin-dev reference files outside `calibrate.ts`'s two hardcoded roots).

## Predictions (written before the sweep)

### Seed predictions (docs/specs/2026-07-08-m3a-rule-catalog-design.md §7)

| Rule | Prediction | Evidence |
|---|---|---|
| FM05 | fires on every corpus skill (~27/27) | 0/30 audit compliance; zero corpus skills carry `version` |
| CT01 | fires widely | audit S6 undeclared dependencies |
| ST01 | writing-skills (689 lines / 3,807 words), subagent-driven-development (419 / 3,085) | LINT-RULES evidence row |
| ST04 | writing-skills `@`-links (lines 283–288) | LINT-RULES evidence row |
| ST05 | discipline-furniture skills lacking the table/red-flags pair (e.g. brainstorming's `<HARD-GATE>`) | audit Part 2 |
| HY04 | find-skills ("185K installs") | LINT-RULES evidence row |
| HY06 | caveman (~75%), compress (~65%) | LINT-RULES evidence row |

/ Note: with `using-shakespii` (real `version: 0.1.0`) now in the personal corpus, FM05's "~27/27" is
read as "every skill except using-shakespii" — 27 of the 28 total linted skills.

### Extended predictions (docs/AUDIT-2026-07-07.md + docs/LINT-RULES.md + docs/CALIBRATION-M2.md evidence)

| Rule | Prediction | Evidence |
|---|---|---|
| FM01 | fires nowhere (0/28) | LINT-RULES FM01: "14/14 superpowers use exactly name+description"; audit: 0/13 personal skills carry frontmatter beyond name+description |
| FM02 | fires nowhere (0/28) | LINT-RULES FM02: ecosystem spec + plugin auto-discovery already forces `name` = dir name |
| FM03 | fires nowhere (0/28) | LINT-RULES FM03: "corpus max is 234 chars" (superpowers); directly measured personal-corpus max is 346 chars (compress) — both well under the 500-char warn threshold |
| FM04 | continues M2 actuals: personal 13 errors across 12 of 14 skills (using-shakespii spared — trigger-first "Use when…" description); superpowers 1/14 (brainstorming only) | CALIBRATION-M2.md actual counts; using-shakespii's frontmatter directly confirmed trigger-first/third-person |
| CT02 | fires on ai-whisper-deliberation-craft only (none of its 3 headings match the Output alias set); predicted **silent** on ai-whisper-code-review despite audit S5's finding, because it carries a literal `## Output` heading — presence-only CT02 can't see that the section body reads "obey the workflow handoff's output format exactly" | audit S5 names both skills; direct read of `ai-whisper-code-review/SKILL.md:66-69` confirms the heading exists but the content delegates out-of-band — the exact CT02 coverage gap from spec §4 |
| CT03 | continues M2 actuals: personal 13/14 fire (using-shakespii spared), superpowers 14/14 unchanged | CALIBRATION-M2.md actual counts |
| CT04 | fires on 27/28 (every skill except using-shakespii, the only one carrying a literal `## Inputs` heading) | LINT-RULES CT04: "No skill in either corpus declares inputs"; confirmed via direct heading inventory of all 28 skills |
| CT06 | fires on 3 superpowers skills lacking an Intent-aliased heading — requesting-code-review, subagent-driven-development, using-superpowers — contradicting the audit's "reference corpus universally opens with `## Overview`" claim | audit Part 2 claims universality; direct heading inventory shows these 3 exceptions |
| ST02 | continues M2 actuals: fires only on subagent-driven-development (superpowers 1/14, the `../` cross-skill escape); 0/14 personal | CALIBRATION-M2.md actual counts and adjudication |
| HY01 | fires nowhere (0/28) | LINT-RULES HY01: "Ecosystem rule"; no backslash path pattern found in any corpus file |
| HY02 | fires nowhere (0/28) | LINT-RULES HY02: "None found in personal corpus SKILL.md files"; directly grepped `/Users/` and `/home/` across both corpus roots including `scripts/` siblings — zero literal hits |
| HY05 | fires on compress (unfenced step-2 run command) | LINT-RULES HY05 + audit quick win #2: "compress SKILL.md step 2 ships an unfenced run command" |
| PH01 | fires nowhere (0/28) | CALIBRATION-M2.md: "PH01 fired nowhere" (no live scaffolds installed); using-shakespii is authored content, not a raw scaffold |

Rules with no prediction row (CT01 beyond its seed row, CT05, CT07, ST03, HY03) are left unpredicted —
no unambiguous audit/LINT-RULES evidence pins a specific count, and hand-simulating the anatomy
matcher's exact-normalized heading comparison across 28 skills for every remaining rule would just be
running the linter by hand. Their actual counts (if any) are adjudicated as audit-misses below, per the
task's documentation-over-churn preference.
