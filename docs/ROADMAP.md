# Roadmap

Milestones are sequential; each ends with something runnable or decided. TDD throughout: no lint rule or harness feature without fixture tests first.

## M0 — Ecosystem quick wins (outside this repo, optional but recommended)

- [ ] Delete empty `~/.claude/skills/personal-preferences/`
- [ ] Fix compress `benchmark.py` fixtures path → becomes shakespii's first real-world harness fixture
- [ ] Extract the ai-whisper collab-readiness block into a shared reference used by all 5 kickoff skills

## M1 — Phase-1 specification

- [x] Skill anatomy spec: map Intent / Inputs / Preconditions / Procedure / Output / Examples / Anti-patterns onto standard SKILL.md section conventions (exact heading names, required vs optional)
- [x] Default lint profile: finalize the adjudications in STRATEGY.md D4 (description style, size budget, version requirement) as concrete config
- [x] Scaffold template design for `shakespii init` (SKILL.md skeleton + `evals/evals.json` stub + README)

## M2 — MVP CLI

- [x] Resolve open decisions: runtime language (TypeScript on Bun), distribution (local link at MVP), CLI name (`shakespii` confirmed) — see the M2 spec
- [x] Parser: frontmatter + markdown section AST + sibling-file inventory
- [x] `shakespii init <name>` generating the M1 scaffold
- [x] `shakespii lint <path>` with seed rules FM01, FM02, FM04, CT03, ST02, PH01 — ESLint-style output plus `--json` (pulled forward from M3 as the M2.5 contract), each finding cites its rule ID
- [x] Calibration run against the dogfood corpus (`~/.claude/skills/` + superpowers 6.1.1); tune until findings match the audit

## M2.5 — `using-shakespii` companion skill

Agent-first interface decision (docs/REFERENCE-SKILL-CRITIQUE.md): humans instruct agents; agents drive the CLI. The thin operational skill ships with the MVP, not at M5.

- [x] Companion skill teaching agents the audit loop (`shakespii lint` per skill → interpret findings → fix → re-lint) and the authoring loop (init → draft → lint-loop until clean → evals → present) — corpus-wide lint arrives with `--corpus` in M3
- [x] Dogfood: the companion skill itself passes `shakespii lint` (zero findings, weld-tested) and ships its own evals

## M3 — Full rule catalog

- [ ] Remaining FM/CT/ST/HY rules from LINT-RULES.md
- [ ] Cross-skill rules XS01/XS02 (corpus-context mode: `shakespii lint --corpus ~/.claude/skills`)
- [ ] Score model, config file for profile overrides (`--json` moved to M2)

## M4 — Test harness

- [ ] Adopt skill-creator schemas (`evals.json` / `grading.json` / `benchmark.json`)
- [ ] `shakespii test <path>`: deterministic checks first, then headless scenario runs via `claude -p` / Agent SDK, then LLM rubric grading; cached, on-demand
- [ ] Trigger-accuracy eval (TR02) per skill-creator's design
- [ ] First fixture: the repaired compress benchmark

## M5 — Writer + publishing

- [ ] Writer implemented as a skill (interview → draft → critique → refine loop), itself linted and tested by shakespii
- [ ] Install gate: lint must pass before a skill lands in `~/.claude/skills/`
- [ ] ai-cortex promotion path: recurring pattern/gotcha memories surfaced as candidate skill drafts

## M6 — Curated library

Author the missing engineering skills through shakespii's own pipeline (dogfood): repository inspection, architecture review, performance profiling, dependency audit, migration planning, API design review, codebase onboarding. Twenty excellent skills, not hundreds of mediocre ones.

---

## Open decisions (user's to make — do not pick silently)

| Decision | Options on the table | Notes |
|---|---|---|
| Runtime language | ~~TypeScript/Node (or Bun), Python, Go~~ | **Decided 2026-07-07: TypeScript on Bun** (M2 spec) |
| Distribution | ~~npm package, Homebrew, plain git clone~~ | **Decided 2026-07-07: local link (`bun link`) for the MVP; npm publish graduates at M5** |
| CLI name | `shakespii` | **Confirmed 2026-07-07** |
| Score model | Severity counts only vs 0–100 aggregate score | Vision doc shows "82/100"; ESLint-style may be enough |
| Personal-skill migration | Whether the 13 existing personal skills get refactored through shakespii once M2 lands (incl. collapsing the 5 kickoff clones) | Big win, but touches live workflow — sequence carefully |
