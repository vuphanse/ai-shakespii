# M3 calibration run — full 24-rule catalog vs dogfood corpus

**Date:** 2026-07-08 · **Profile:** default · **Command:** `bun scripts/calibrate.ts`
Corpus is read-only: findings here drive profile-option tuning (never severity) or documentation, never edits to installed skills. This follows the M2 protocol exactly (docs/CALIBRATION-M2.md).

All 24 single-skill rules are wired as of Task 17 (`src/lib/rules/index.ts`): FM01–05, CT01–07, ST01–05,
HY01–06, PH01. XS01/XS02 need `--corpus` context (M3b, not yet built) and TR01/TR02 are harness-backed
(M4) — both families stay silent in this sweep regardless of their `profiles/default.yaml` entries.

**Corpus composition at sweep time.** Personal root (`~/.claude/skills/`) holds 15 directories:
`personal-preferences/` remains the empty dir flagged at M2 (skipped — no `SKILL.md`), and
`using-shakespii` has joined as this project's companion skill — the symlink at
`~/.claude/skills/using-shakespii` was created during M2.5 close-out, predating this milestone's
execution range (before base commit c0ae870), not mutated mid-sweep — leaving **14 linted skills**
(the 13 from M2 plus one). `using-shakespii` is therefore double-covered by design: the M2.5 weld test
(`tests/skill/using-shakespii.test.ts`) gates it at zero findings on every task, and this corpus sweep
lints it again as an ordinary personal-root skill; agreement between the two is expected, not
coincidental. Superpowers root is unchanged at the
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

Note: with `using-shakespii` (real `version: 0.1.0`) now in the personal corpus, FM05's "~27/27" is
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

## Actual counts (verbatim)

<!-- pasted verbatim from scripts/calibrate.ts, first run, before any adjudication fixes -->

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
| HY04 | 0 | 9 | 3 |
| ST03 | 0 | 1 | 1 |
| ST04 | 5 | 0 | 5 |

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
| HY01 | 1 | 0 | 1 |
| HY03 | 0 | 1 | 1 |
| HY04 | 0 | 1 | 1 |
| HY06 | 0 | 1 | 1 |
| ST01 | 2 | 2 | 3 |
| ST02 | 1 | 0 | 1 |
| ST03 | 0 | 13 | 6 |
| ST05 | 0 | 1 | 1 |

Both roots hold 14 linted skills, as predicted. Zero corpus edits were made anywhere in this run —
only rule source/test files changed, per the two `rule-logic bug` adjudications below.

### Post-fix re-verification (after the two rule-logic-bug fixes, §ST04/HY04/HY01 below)

`bun scripts/calibrate.ts` re-run after fixing HY04 and HY01, full suite green (`bun test`, 161 pass):

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
| ST03 | 0 | 1 | 1 |
| ST04 | 5 | 0 | 5 |

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

HY01 drops to 0/28 everywhere (matches the original prediction exactly). HY04 drops from 9
warnings/3 skills to 1 warning/1 skill (the one defensible remaining hit, adjudicated below). No other
rule's count moved — the fixes were narrowly scoped to the two evidenced false-positive mechanisms.

## Adjudications

Protocol: every deviation from a prediction gets one row, classified `rule-logic bug` (fix code, RED
fixture first), `miscalibration` (edit profile options, never severity), or `audit-miss` (document
only — either a genuine unpredicted finding, or a prediction that over/under-shot reality). Preference
is documentation over churn unless the evidence is unambiguous. Each row below was investigated against
the offending skill's (or rule's) real content/source before classification. Pre-fix counts are cited
where a fix changed the picture; all reads of `~/.claude/...` content were read-only.

### Confirmed predictions (no deviation — listed for completeness, not adjudicated)

FM01, FM02, FM03, FM05, HY02, PH01 (0/28 or ~27/28 exactly as predicted); FM04 and CT03 and ST02
continue their exact M2 actuals with `using-shakespii` correctly spared; CT01 "fires widely" (13/14
personal, 14/14 superpowers); CT02 fires on `ai-whisper-deliberation-craft` and is silent on
`ai-whisper-code-review` exactly as predicted (verified directly — see CT02 row below for the
mechanism); CT04 fires on 27/28; ST05 fires exactly once, on `brainstorming`, exactly as predicted.

### Deviations

| Deviation | Classification | Investigation and action |
|---|---|---|
| **ST01** fires on a 3rd, unpredicted skill: `using-superpowers` (warn, "no H1 title found"). The two predicted skills (writing-skills, subagent-driven-development) fire exactly as predicted (both error, hard-limit word count). | audit-miss | Direct read of `using-superpowers/SKILL.md` confirms the body opens straight into `<SUBAGENT-STOP>`/`<EXTREMELY-IMPORTANT>` XML tags with no `# Title` line anywhere in the file — a genuine, correctly-detected gap the seed prediction (which only cited size breaches) didn't anticipate. True positive; no code change. |
| **ST04** does **not** fire on `writing-skills` (predicted, citing lines 283–288); fires **5×**, entirely unpredicted, on the personal corpus (`ai-whisper-bugfix`, `-deliberation`, `-quick-task`, `-ralph`, `-sdd`). | audit-miss | writing-skills:286 is `` `@skills/testing/test-driven-development/SKILL.md` `` **inside backticks**, labeled "❌ Bad:" — it's demonstrating the anti-pattern, already safely fenced; `textOutsideFences` correctly excludes inline code, so the rule is right to stay silent and the original audit citation (inherited into the seed prediction) mischaracterized documentation-about-the-antipattern as a live violation. The 5 personal hits are each a `- *"...phrase..."* / *"...phrase @docs/X.md"*` line in a "Match phrases like" list — a hypothetical **user utterance** shown in italics+quotes, not an authored `@`-link in the skill's own instructions. ST04's contract (M3a spec §5: "Outside code: `@` preceded by whitespace, followed by a path-like token") has no quoted-user-utterance exemption — unlike CT03's narrow `stripQuotedListItems` (scoped to Examples-section list items that are *solely* a quoted string, which these lines aren't: they interleave prose, `/`, and two phrases). The rule is doing exactly what its documented contract says; whether that contract should exempt illustrative quoted text is a genuine design judgment call, not a clear-cut bug — filed as a future-refinement candidate, not fixed here (documentation over churn). |
| **HY04** predicted to fire on `find-skills` via its fenced "185K installs" example; pre-fix actual is 9 warnings across 3 skills (`ai-14all-session-status`, `compress`, `find-skills`×7) plus 1 more in superpowers (`brainstorming`) — none of them the predicted line. | rule-logic bug (fixed) | The literal `(185K installs)` (find-skills:88) sits inside a fenced "Example response" code block — correctly silent by design, so the seed prediction's specific mechanism was wrong from the start. But investigating the other 9 hits found a real, unambiguous, repeated false-positive pattern: ordered-list markers (`2. Waiting on user input`, `4. Return result to user`, `3. Suggest the user could...`) and `### Step N:` heading numbers (`### Step 5: Present Options to the User`, `### Step 2: Check the Leaderboard First`) were matched by the bare-integer branch of `MAGNITUDE` and paired with an incidental rot-noun (`user`, `install`) a few tokens away — 9 independent occurrences across 4 skills in both corpus roots, the exact "false positive" failure mode the M3a spec's own precision-first posture calls unacceptable (misses are fine, false positives aren't). Fixed in `src/lib/rules/HY04.ts`: skip a magnitude token when it's a leading ordered-list marker (optionally after heading hashes, e.g. `### 2.`) or immediately preceded by "Step"/"Steps". RED fixtures added in `tests/rules/HY04.test.ts` (list marker, `### Step N:` heading, numbered heading, and a same-line regression check that a real stat next to a list marker still fires) before the fix; `bun test` green after. Post-fix: personal HY04 drops to 1/1 (`find-skills:70`, "100" near "installs" in "Be cautious with anything under 100" — a defensible embedded-threshold true positive, left alone). |
| **HY06** predicted to fire on `caveman` (~75%) and `compress` (~65%); actual is **zero** fires on either, plus one entirely unpredicted fire on superpowers (`systematic-debugging`, "40%" near "faster", condition-based-waiting.md:114). | audit-miss | `caveman`'s only quantitative claim ("Slash token usage ~75%") lives **exclusively in the YAML frontmatter `description` field** — HY06 scans `skill.body.raw` (post-frontmatter), the same body-only scope 6 of the 8 ST/HY prose rules use (HY01/HY02 scan the whole raw file because path strings can legitimately appear anywhere; HY06 and its body-scoped siblings treat frontmatter as structured metadata, not prose) — so it structurally cannot see this claim. `compress`'s "~65%" (and its own real "~45%"/"59.6%" benchmark-table figures) live in `README.md`, which HY06 does scan, but every occurrence fails one of two independent gates: the phrasing uses "cuts"/"cut"/"fewer" (not in HY06's `CLAIM` word list — `saves?\|savings\|saved\|faster\|speedups?\|reduc\w*\|compress\w*\|improvements?\|smaller`), and the benchmark table's percentages are wrapped in markdown bold (`**59.6%**`) which `strip()` doesn't remove (unlike `normalizeHeading`, which already strips `*_\`` for the same reason) — and even fixing the bold-stripping wouldn't help, since the claim words live in a separate header row from the data rows and HY06 only checks token proximity within one line. Given the M3a spec's explicit "precision-first — accept misses" posture for ST/HY rules (§5), HY06 has no profile-configurable options to miscalibrate, and the gaps span two independent, defensible design choices (frontmatter scope, word-list breadth) rather than one clear-cut defect, this is documented as an audit-miss with a future-refinement note, not fixed. `systematic-debugging`'s hit is a genuine, correctly-fired true positive (unbacked "40% faster" claim, no eval, no "unverified" marker) that the personal-only seed prediction didn't anticipate. |
| **HY01** predicted 0/28; fires once, unpredicted, on a superpowers reference sibling (`writing-skills/anthropic-best-practices.md:1002`). | rule-logic bug (fixed) | The line reads `...like "Field 'signature\_date' not found. Available fields: customer\_name, order\_total, signature\_date\_signed"...` — `signature\_date\_signed` is a **CommonMark backslash-escaped underscore** (prevents `_..._` italics parsing), not a path. `BACKSLASH_CHAIN`'s `\w+\\{1,2}\w+\\{1,2}\w+` heuristic (designed for `C:\Users\name\Documents`-style chains) treated the two `\_` escapes as path separators — an unambiguous false positive: the spec's own stated design goal already excludes one class of incidental backslash use ("regex escapes `\s`, `\d` survive"); markdown-escaped underscores are the same category of "backslash isn't a path separator" the rule already intends to avoid. Fixed with a negative lookahead so a backslash immediately followed by `_` doesn't count as a chain link (`\w+(?:\\(?!_)){1,2}\w+(?:\\(?!_)){1,2}\w+`). RED fixtures added in `tests/rules/HY01.test.ts` (the escaped-underscore case, plus a regression check that a real chain with an underscore *inside* a segment, e.g. `docs\my_folder\file.md`, still fires) before the fix; `bun test` green after, all 4 pre-existing HY01 fixtures unaffected. Post-fix: 0/28 everywhere, matching the original prediction exactly. **Accepted recall trade-off:** the `(?!_)` lookahead is a blunt instrument — it also silences a genuine Windows path whose segment happens to start with an underscore (e.g. `docs\_internal\file`), since that backslash is followed by `_` too; no corpus evidence of this pattern surfaced, so the trade-off is accepted rather than resolved with escape-context detection. |
| **HY05** predicted to fire on `compress` (audit's cited unfenced step-2 command); actual is **zero** fires anywhere. | audit-miss | `compress/SKILL.md:26` is `cd <directory_containing_this_SKILL.md> && python3 -m scripts <absolute_filepath>` — genuinely unfenced, exactly the audit's citation. But `CMD_LINE`'s regex anchors the recognized command word at line-start (`^(?:\$ )?(git\|bun\|...\|python3\|...)\b`); this line starts with `cd`, which isn't in HY05's `COMMANDS` list, so `python3` appearing later (after `&& `) never matches. This is a **miss**, not a false positive — the rule fails to flag a real offender because it only checks the line-initial command word, a structural limitation of the line-start-anchored design. Extending it to match compound/chained commands safely (without new false positives on prose like "cd to the repo, then run tests") is more redesign than a minimal fix warrants here; per the explicit "misses are acceptable, false positives aren't" posture and the documentation-over-churn preference, this is documented, not fixed — directly mirroring the M2 ST02-vs-compress precedent (a real audit-cited defect, real and traceable, but structurally outside this rule's scope). |
| **CT06** predicted to fire on 3 named superpowers skills (`requesting-code-review`, `subagent-driven-development`, `using-superpowers`); actual is **4** — `brainstorming` also fires. | audit-miss (my own prediction undercounted) | Direct heading inventory of `brainstorming/SKILL.md` shows `## Anti-Pattern: ...`, `## Checklist`, `## Process Flow`, `## The Process`, `## After the Design`, `## Key Principles`, `## Visual Companion` — no heading normalizes to `intent`, `overview`, `purpose`, or `why`. My own extended prediction misread brainstorming as opening with `## Overview` (confusing it with another skill); it doesn't. Rule and audit are both correct; my manual heading scan was the error. No code change — corrected here for the record. |

## CT02 coverage gap (spec §4)

CT02 is presence-only (anatomy key `output`, same mechanism as CT01/CT04–CT07): it reports a finding
only when no section heading normalizes to "Output" or one of its aliases (`Output contract`,
`Output format`, `Deliverable`, `Handback`, `Report format`). It does **not** re-check the section's
*content* — ST02 already checks every markdown link in the SKILL.md body, including inside the Output
section, so a per-section re-check would double-report the same broken link (spec §4's adopted
refinement).

This sweep gives a concrete, in-corpus demonstration of what that leaves uncaught: `ai-whisper-code-review/SKILL.md:66-69`
carries a literal `## Output` heading —

```
## Output

When invoked by an ai-whisper workflow, obey the workflow handoff's output format
exactly.
```

— so CT02 is correctly silent on it (presence is satisfied), even though the body is exactly the
defect the audit's S5 finding named: a bare **prose-path contract** ("obey the workflow handoff's
output format") pointing at a format that isn't a markdown link (so ST02 can't see it either) and isn't
shipped inside this skill's directory. `ai-whisper-deliberation-craft` has no Output-aliased heading at
all, so it correctly fires. Neither ST02 (link-only) nor CT02 (presence-only) can catch a prose sentence
that delegates a contract by reference rather than by link, or a contract that points at an external
URL — this mirrors the M2 `compress`/ST02 adjudication (a real defect, genuinely outside the rule's
static-analysis reach) exactly, and is left as a documented coverage gap rather than chased with
low-precision heuristics (e.g. flagging any sentence containing "format" near "handoff").

## Unpredicted rules (no explicit prediction row, per the disclaimer above)

CT05 (13/14 personal, 6/14 superpowers), CT06's personal half (12/14 personal — only the 3-skill
superpowers side had a prediction, at the seed table above), CT07 (7/14 personal, 10/14 superpowers),
ST03 (1/14 personal, 6/14 superpowers by skill, 13 warnings), HY03 (1/14 superpowers), and CT02's
superpowers half (14/14, beyond the personal-only prediction) all fired without an explicit numeric
prediction in this doc, as flagged upfront. CT07's personal count was independently cross-checked by hand against the anatomy
alias table (`Procedure`/`Process`/`The Process`/`Workflow`/`Steps`/`Checklist`/`Usage`) and matches
exactly: the 7 skills that pass all carry a `Steps` or `Process` heading (`ai-whisper-bugfix`,
`-deliberation`, `-quick-task`, `-ralph`, `-sdd`, `compress`, `using-shakespii`), the 7 that fire don't.
CT02's superpowers 14/14 is consistent with the full corpus heading inventory taken while building the
predictions table (no superpowers skill carries an Output-family heading). These share CT01–CT07's
simple, already-tested `matchAnatomySections` presence mechanism (the same code path validated by the
confirmed CT01/CT02/CT03/CT04 predictions above), so they were spot-checked rather than fully
re-derived by hand for every skill — no anomalies found. No adjudication rows: documenting-only was
already this doc's stated intent for rules left unpredicted, and none showed a suspicious pattern (like
HY04/HY01's repeated false positives) under spot-check.

## Outcome

Seven deviations from an explicit prediction were found and adjudicated: **two rule-logic bugs (fixed,
both with RED fixtures first)** — HY04's ordered-list-marker/`Step N:` false positives (9 occurrences
across 4 skills, both corpus roots) and HY01's markdown-escaped-underscore false positive
(`signature\_date\_signed` misread as a Windows path chain) — and **five audit-misses (documented, zero
code change)**: ST01's unpredicted `using-superpowers` no-H1 hit, ST04's near-total misprediction (the
seed citation was a safely-fenced anti-example; the real hits are an unmodeled quoted-user-utterance
pattern), HY06's zero-fire on both seed skills (frontmatter-scoped claim for caveman, word-list/markdown
gaps for compress) plus an unpredicted superpowers hit, HY05's miss on compress's compound command
line, and CT06's one-skill undercount (my own manual heading scan error, not a rule defect). **Zero
miscalibrations** — no profile option in `profiles/default.yaml` needed adjustment, and no severity was
touched (per the §0 rule: severity demotions are a user decision, evidence-only).

The two fixes are narrowly scoped: HY04 and HY01 each gained a small, evidence-driven exclusion
(list/heading-number context; markdown-escape context) with regression fixtures proving the exclusion
doesn't suppress genuine hits (a real stat next to a list marker; a real path segment containing an
underscore). Post-fix, HY01 matches its original 0/28 prediction exactly and HY04 drops to a single
defensible remaining hit. The CT02 presence-only design (spec §4) was validated against a concrete,
named in-corpus example (`ai-whisper-code-review`) rather than compress alone, strengthening the M2
precedent this task was asked to mirror. Full suite: 161 pass, 0 fail (`bun test`), up from 155 at the
start of this task (4 new HY04 fixtures — leading list marker, numbered heading `### 2. Title`, `Step
N:` heading, and a same-line regression check — plus 2 new HY01 fixtures — escaped underscore and an
underscore-inside-a-real-path regression check).

