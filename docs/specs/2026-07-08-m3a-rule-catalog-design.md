# M3a — Single-skill rule catalog completion

**Status:** approved (design review 2026-07-08); not yet implemented.
**Scope owner:** docs/ROADMAP.md M3, first of two cycles (M3a rules / M3b corpus+config).
**Predecessors:** M2 MVP CLI (docs/specs/2026-07-07-m2-mvp-cli-design.md), M2.5 companion skill (docs/specs/2026-07-07-m2.5-using-shakespii-design.md).

## 0. Decisions (user-adjudicated, 2026-07-08 brainstorm)

| Decision | Choice | Rationale |
|---|---|---|
| M3 slicing | Two cycles: M3a = 17 single-skill rules + rule-adjacent backlog; M3b = `--corpus` + XS01/XS02 + config-file overrides | One plan for all of M3 would exceed 20 tasks; the two halves have independent surfaces |
| M2 deferred backlog | Fold in rule-adjacent items only (see §3); validateProfile depth and inventory edge tests stay deferred | HY01/HY02/ST04 build on link/text extraction — fix it once, before consumers land |
| Severity posture | Implement catalog severities exactly; calibrate; demote only with documented evidence via the M2 adjudication protocol | The corpus failing loudly is the point; FM05 is the flagship "skills are components" requirement |
| Score model | **Severity counts only** — closes the roadmap open decision. No 0–100 aggregate | No research-backed weighting exists; an invented formula is false precision and gameable. Revisit condition: M6 library ranking |

## 1. Scope and non-goals

**Delivers:**

1. The 17 remaining single-skill rules: FM03, FM05, CT01, CT02, CT04, CT05, CT06, CT07, ST01, ST03, ST04, ST05, HY01, HY02, HY03, HY04, HY05, HY06. After M3a, all 23 single-skill rules in docs/LINT-RULES.md are live; only XS01/XS02 (corpus context, M3b) and TR01/TR02 (harness, M4) remain.
2. Five rule-adjacent M2 backlog fixes (§3), landed before the rules that consume them.
3. Calibration sweep over the dogfood corpus with `docs/CALIBRATION-M3.md` under the M2 adjudication protocol (§7).
4. Self-cleanliness maintained throughout: keystone RED set verified, `using-shakespii` weld test at zero findings (§6).

**Non-goals:** no `--corpus` flag, no XS rules, no config-file profile overrides, no score field, no new CLI flags or output-schema changes of any kind. The CLI surface remains exactly M2's: `shakespii lint <path> [--json]`, exit 0/1/2, `--json` version 1. No profile schema changes — `profiles/default.yaml` already declares every M3a rule with severity and options; rules read what is declared.

## 2. Architecture and build order

Unchanged from M2: each rule is a pure function `(skill, ctx) → RuleFinding[]` in `src/lib/rules/<ID>.ts`, exported through `src/lib/rules/index.ts`; the engine stamps severity from the profile, honors per-finding severity overrides, and skips rules without a profile entry. Every rule ships fixture tests before implementation.

Build order inside the milestone (dependency-honest):

1. **Extraction hardening** (§3) — parser/link fixes plus the CT03/FM04 heuristic fixes.
2. **FM family** (FM03, FM05) — trivial frontmatter checks.
3. **CT family** (CT01, CT02, CT04–CT07) — anatomy-matcher-driven presence checks.
4. **ST family** (ST01, ST03, ST04, ST05) — first consumers of `textOutsideFences`.
5. **HY family** (HY01–HY06).
6. **Calibration** (§7) and close-out (§9).

Per-task discipline: any new rule that fires on `skills/using-shakespii` or changes the raw-scaffold finding set is handled in the same task (fix the skill / adjudicate the keystone delta). No commit lands with a red suite.

### 2.1 Shared helpers

- `textOutsideFences(body: string): string` — returns the body with fenced code blocks (``` and ~~~) and inline code spans blanked out, **preserving line positions** (stripped content replaced by empty lines / spaces so downstream line attribution is exact). Lives in `src/lib/parser/sections.ts` beside the other body-text utilities. Consumers: ST04, ST05, HY03, HY05, HY06.
- Sibling scoping reuses the existing inventory (PH01 precedent): *md siblings* = inventoried files with `relPath` ending `.md`, excluding SKILL.md; *text siblings* = the inventory's text-file set.
- Existing helpers `matchAnatomySections` (src/lib/rules/anatomy.ts) and `fieldLine` (src/lib/rules/frontmatter-util.ts) are reused as-is.

Helpers beyond these are extracted only when a second consumer appears.

## 3. Extraction hardening (folded-in M2 backlog)

Each item lands with a RED fixture first. All five precede the rule families.

| # | Item | Fix |
|---|---|---|
| 1 | Reference-style links invisible to `extractLinks` (src/lib/parser/sections.ts) | The mdast walk collects only `link`/`image` nodes; `[text][ref]` + `[ref]: path.md` parse as `linkReference`/`definition`. Also collect `definition` nodes (they carry `url` + position; every resolvable reference link has one). ST02 gains the coverage immediately; ST04/HY01/HY02 inherit it |
| 2 | CRLF line endings break fence detection | Normalize `\r\n → \n` once at the parser entry point before mdast parse. Line numbers unaffected (same line count) |
| 3 | ST02 `file.md#fragment` untested | Code already strips fragments (`target.split('#')[0]`); add the locking fixture — test-only change |
| 4 | CT03 `stripQuotedListItems` over-strips | Current filter drops any list item that starts and ends with a quote char, so `- "input" → "output"` (a genuine one-line worked example) is stripped. Fix: strip only when the item body is a single quoted phrase with nothing outside the quotes. Fixture pair: bare quoted trigger list still stripped; quoted input→output line counts |
| 5 | FM04 pronoun-I matches "I/O" | `/\bI\b/` matches the "I" in "I/O" (`/` is a non-word char). Fix: pronoun-I must not be adjacent to `/`. Fixtures: "handles file I/O" passes; "Use when I need to…" still fires. Other pronouns untouched |

Explicitly still deferred (not rule-adjacent): validateProfile depth checks, inventory edge-case tests.

## 4. FM and CT rule semantics

### FM03 — description length (warn)

`description` string length: `> warnChars` (500) → warn; `> maxChars` (1024) → error via per-finding severity override (engine mechanism locked by the T1 engine test). One finding at most (the error subsumes the warn). Line = description field line. Messages: `description is N chars (warn threshold 500)` / `description is N chars (hard limit 1024)`.

### FM05 — version required, semver (error)

Two failure modes, distinct messages:
- `version` field absent → `version field missing — skills are versioned components (semver)`.
- Present but not valid semver 2.0 (`MAJOR.MINOR.PATCH` with optional pre-release/build suffixes) → `version "X" is not valid semver`.

Non-string values (e.g. YAML parses `1.0` as a number) are "present but not semver". Line = version field line, or frontmatter start when absent. FM01 already whitelists `version` as an allowed extra field; no interaction.

### CT01, CT04, CT05, CT06, CT07 — section presence (per catalog severities)

Each rule reads its anatomy entry from `ctx.anatomy` (CT03 precedent) and reports one finding when `matchAnatomySections` finds no section: `no <Canonical> section found (canonical "<Canonical>" or an alias)`, file SKILL.md, line null. If the profile lacks the anatomy entry, the rule returns no findings (CT03 precedent).

| Rule | Anatomy key | Severity |
|---|---|---|
| CT01 | preconditions | error |
| CT04 | inputs | warn |
| CT05 | anti-patterns | warn |
| CT06 | intent | warn |
| CT07 | procedure | error |

**Scope adjudication (explicit):** the catalog phrases CT01 as "enumerates *every* external dependency" — completeness is statically undecidable (a linter cannot know a skill secretly needs `jq`). At M3a these rules check structure presence; content-completeness graduates to the M4 harness. The audit's real offenders were missing sections entirely, so presence is where the static evidence lives. This narrowing is recorded in docs/LINT-RULES.md at close-out (§9).

**No placeholder double-reporting:** PH01 owns placeholder detection (it already fires 18× on the raw scaffold). Presence rules never re-flag placeholder content. CT03's existing "unfilled placeholder" message stays — it is an accuracy fix (markers cannot be evaluated through a token), not a duplicated responsibility.

### CT02 — output contract present (error)

Presence-only, same mechanism as the table above (anatomy key `output`, severity error).

**Refinement against the presented design (adopted during spec self-review):** the design sketch gave CT02 a second check — links inside the Output section must resolve. ST02 already checks *every* link in the SKILL.md body, including the Output section; a per-section re-check would double-report the same broken link. CT02 is therefore presence-only. What ST02 cannot see (bare prose paths like "obey the format in docs/deliberations/" and external-URL contracts) is a documented coverage gap in CALIBRATION-M3.md, mirroring the M2 compress adjudication — not chased with low-precision heuristics.

### Consequences for the scaffold and the companion skill

The scaffold template carries real semver `version: 0.1.0`, all seven canonical headings, and a short description → FM03, FM05, and all CT rules add **zero** raw-scaffold findings. `skills/using-shakespii` (seven sections, `0.1.0`, ~200-char description) is likewise expected clean.

## 5. ST and HY rule semantics

**Posture (applies to every heuristic here):** precision-first — fire only on high-confidence patterns, accept misses. Most of these are warns; a false positive teaches agents to ignore the linter, a miss just waits for a better rule. The regex/token lists below are the spec; fixtures pin them; calibration adjudicates disagreements. All "outside code" language means `textOutsideFences` (§2.1).

| Rule | Sev | Check | Detection | Scope |
|---|---|---|---|---|
| ST01 | warn (error branch) | H1 + size budget | Missing H1 → warn `no H1 title found`. Body > `maxWords` (2000) whitespace-split tokens or > `maxLines` (500) → warn. Body > `hardMaxWords` (3000) → error via per-finding override (subsumes the word-count warn; a line-count warn may still co-fire) | SKILL.md body |
| ST03 | warn | Long references carry a TOC | md sibling with > `tocMinLines` (100) lines and no TOC. TOC = a heading whose normalized text is `contents` or `table of contents`, or ≥3 internal anchor links `](#…)` within the first 40 lines | md siblings |
| ST04 | error | No `@`-force-load links | Outside code: `@` preceded by start-of-line or whitespace, followed by a path-like token (contains `/` or ends `.md`). Message names the context cost and suggests the bare path | SKILL.md + md siblings |
| ST05 | warn | Discipline furniture complete | Trigger (any, outside code): (a) `iron law` case-insensitive; (b) an ALL-CAPS XML-style tag matching `<[A-Z][A-Z-]+>`; (c) ≥3 standalone ALL-CAPS `MUST`/`NEVER` tokens (combined count). Once triggered, require BOTH: a markdown table whose header row contains a `Reality` column (covers `Excuse/Reality` and `Thought/Reality` variants) AND a heading matching `/red flags?/i`. One finding naming whichever half is missing | SKILL.md |
| HY01 | error | Forward-slash paths only | Drive-letter prefix `/[A-Za-z]:\\/` or a ≥2-backslash word-segment chain `/\w+\\{1,2}\w+\\{1,2}\w+/`. Single backslashes never flagged (regex escapes `\s`, `\d` survive). Scanned everywhere in md files, fences included (offending paths live in commands) | SKILL.md + md siblings |
| HY02 | error | No machine-specific absolute paths | `/\/(Users|home)\/[A-Za-z0-9._-]+/` or `/[A-Za-z]:\\Users\\/`, everywhere including fences and scripts — catches compress's Python glob, the M2 calibration coverage gap | SKILL.md + all text siblings |
| HY03 | warn | No time-sensitive phrasing | Phrase list only, word-boundary, outside code: `currently`, `as of`, `recently`, `at the time of writing`. **Bare dates are never flagged** (changelogs, spec filenames, provenance headers are legitimate). Exempt inside `<details>` blocks and under any heading matching `/old patterns/i` | SKILL.md + md siblings |
| HY04 | warn | Rot-prone embedded stats | A magnitude number (`\d+` with optional decimal and `K/M/B` suffix) within 6 tokens of a rot noun (`installs`, `downloads`, `stars`, `users`, `leaderboard`, `rank/ranking`), outside code. Exempt when the skill has frontmatter `version` AND a `/last reviewed/i` marker in SKILL.md or an md sibling | SKILL.md + md siblings |
| HY05 | warn | Commands belong in fences | A line outside code starting (after optional `$ `) with a known command word — `git`, `bun`, `npm`, `npx`, `node`, `python`, `python3`, `pip`, `pip3`, `brew`, `curl`, `wget`, `make`, `docker`, `cargo`, `go`, `shakespii`, `whisper`, `claude` — AND whose remainder carries a flag (`-x`/`--flag`) or path-ish token (contains `/` or a file extension). Command-word match is case-sensitive lowercase: sentence-initial prose ("Go to docs/…", "Make sure…") stays silent, real commands are lowercase. Inline backticks count as fenced. The argument requirement keeps prose like "git history proves it" silent | SKILL.md + md siblings |
| HY06 | warn | Quantitative claims backed | A `%` figure or `Nx` multiplier within 8 tokens of a claim word (`save/savings`, `faster`, `speedup`, `reduc-`, `compress-`, `improvement`, `smaller`), outside code. Exempt when the skill ships `evals/evals.json` (inventory check) or the sentence contains `unverified`/`anecdotal` | SKILL.md + md siblings |

**HY03/HY04 interplay (by construction):** HY04 demands a last-reviewed marker; HY03's phrase-list-only detection never flags `last reviewed 2026-07-07` (as in `skills/using-shakespii/references/rule-remediations.md`). The rules compose; no exemption machinery needed.

**Sibling finding attribution:** findings on sibling files report `file: <relPath>` with the line in that file, exactly as PH01 does today.

## 6. Self-cleanliness: keystone and weld

- **Keystone (tests/cli/keystone.test.ts):** locks the exact raw-scaffold finding set — currently 20 errors (18 PH01, 1 FM04, 1 CT03). Expectation, verified rule-by-rule in §4–§5: the template was designed against the full catalog (real semver, all seven headings, no caps-MUST/NEVER, no `@`, no backslash paths, no stats, no bare commands), so the set stays **exactly 20 through all 17 rules**. Any delta is an adjudicated, plan-level change carrying its own justification — never a silent re-lock, never a weakened assertion.
- **Weld (tests/skill/using-shakespii.test.ts):** `using-shakespii` must stay at exit 0, `{errors: 0, warnings: 0}`, `findings: []` through every task. If a new rule fires on the skill, the same task fixes the skill content (the zero-findings gate is the companion skill's own bar, per the M2.5 spec). Worst known candidate: HY05 versus the Procedure's command lines — they are fenced/inline today; verified in the HY05 task.
- **Scaffold template (templates/skill/):** if any adjudicated keystone delta requires a template change, the template edit and the keystone re-lock land in the same task, and `shakespii init` byte-fidelity tests are updated together.

## 7. Calibration

Re-run `bun scripts/calibrate.ts` with all 23 rules live → `docs/CALIBRATION-M3.md`, following the M2 protocol exactly:

1. **Predictions table written before the sweep**, from audit + catalog evidence. Seed predictions: FM05 fires on every corpus skill (~27/27 — zero carry `version`); CT01 fires widely (audit S6); ST01 bites writing-skills (689 lines/3,807 words) and subagent-driven-development (419/3,085); ST04 bites writing-skills (`@`-links at 283–288); ST05 fires on discipline-furniture skills lacking the table/red-flags pair (e.g. brainstorming's `<HARD-GATE>`); HY04 bites find-skills ("185K installs"); HY06 bites caveman (~75%) and compress (~65%).
2. **Actual counts pasted verbatim** from the calibrate script.
3. **One adjudication row per deviation**, classified `rule-logic bug` (fix code) / `miscalibration` (edit profile options) / `audit-miss` (document only). Preference: documentation over churn unless evidence is unambiguous.
4. **Severity demotions only with documented evidence** (user decision, §0). The corpus stays strictly read-only.
5. CT02's prose-path coverage gap (§4) is documented here, mirroring the M2 compress adjudication.

## 8. Testing

- Per-rule fixture tests written RED first: at minimum fires-on-offender + passes-on-clean, plus the edge fixtures named in §3–§5 (I/O pronoun, quoted-example list item, reference-style link, CRLF fence, fragment link, single-backslash regex escape, inline-code command, provenance date, `<details>` exemption, evals-backed claim, per-finding severity overrides for FM03/ST01).
- `textOutsideFences` gets direct unit tests including line-position preservation.
- Engine untouched; its existing test already locks severity stamping, per-finding override, and unlisted-rule skip.
- Profile-consistency test extended: the anatomy table's `level` fields must mirror the corresponding CT-rule severities in the `rules` map.
- Verification discipline: unpiped `bun test`, exit status preserved (`echo "exit=$?"` after gating commands), STOP before any git command on nonzero. Full suite green on every commit.

## 9. Docs and close-out

- **docs/ROADMAP.md:** restructure M3 into M3a (ticked at close) and M3b (`--corpus` + XS01/XS02 + config-file overrides, pending); close the "Score model" open-decision row as **counts only** (decided 2026-07-08); the "Personal-skill migration" row stays open.
- **docs/LINT-RULES.md:** record the CT presence-only scope adjudication (§4) and the ST/HY heuristic narrowings (§5) inline so the catalog matches shipped semantics.
- **Dual-location sync:** this spec, CALIBRATION-M3.md, and the roadmap edits are mirrored to `~/.ai-pref-nsync/local-docs/ai-shakespii/` (canonical) with the repo `docs/` copy as the synced mirror, byte-identical (cmp-verified).

## 10. Exit criteria

- [ ] All 23 single-skill rules implemented, fixture-tested, and wired into `src/lib/rules/index.ts`
- [ ] Five backlog items (§3) landed with locking fixtures
- [ ] Full suite green (unpiped); keystone set verified unchanged or delta adjudicated in the plan; weld test at zero findings
- [ ] Calibration sweep run; CALIBRATION-M3.md written with predictions, verbatim counts, and adjudication rows
- [ ] ROADMAP restructured (M3a/M3b, score-model decision closed) and LINT-RULES updated to shipped semantics
- [ ] Docs dual-location synced (cmp-verified)
