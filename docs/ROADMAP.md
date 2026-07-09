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

## M3a — Single-skill rule catalog

- [x] Remaining 18 single-skill FM/CT/ST/HY rules from LINT-RULES.md (all 24 single-skill rules live)
- [x] Extraction hardening: reference-style links, CRLF normalization, CT03 quoted-example fix, FM04 I/O fix, ST02 fragment lock
- [x] Calibration sweep against the dogfood corpus (docs/CALIBRATION-M3.md)

## M3b — Corpus mode + config

- [x] Cross-skill rules XS01/XS02 (corpus-context mode: `shakespii lint --corpus ~/.claude/skills`)
- [x] Config file for profile overrides

## M4a — Test harness, static half (done 2026-07-08)

- [x] Adopt skill-creator schemas: TS types + validators for `evals.json` / `grading.json` / `benchmark.json` (the latter two are M4b's output contracts)
- [x] `shakespii test <path> [--json]`: stage pipeline with the deterministic stage live (schema validation, cross-document checks, fixture resolution); `scenario`/`grading` report unavailable until M4b
- [x] TR01 lint rule (warn, single-finding cap, delegates to the harness)
- [x] Run-dir/cache skeleton (byte-level content hash, per-eval runKey, XDG-aware cache root)
- [x] First fixture: the repaired compress benchmark (`tests/fixtures/harness/compress`)

## M4b-1 — Test harness, LLM half: executor + grader (done 2026-07-08)

- [x] `ClaudeRunner` boundary: headless `claude -p` scenario runs (stream-json, per-call timeout, CLAUDECODE strip); whole suite tokenless via injected fakes
- [x] LLM rubric grading writing `grading.json` (M4a validators + rubric-fidelity gate; summary recomputed, atomic write); cached per (skill content, eval, model), on-demand
- [x] `shakespii test --run [--fresh] [--model <name>]`: scenario/grading stages live, opt-in; cache replay deterministic at zero tokens
- [x] Calibration sweep (docs/CALIBRATION-M4B1.md): using-shakespii + compress fixture, 8/8 cache proof
- [x] using-shakespii v0.4.0 teaches the `--run` loop

## M4b-2 — Test harness, LLM half: trigger eval + benchmark (done 2026-07-09)

- [x] Trigger-accuracy eval (TR02): `evals/triggers.json` schema/validator, TR02 lint rule, runner detect mode (streaming early-kill), and the `trigger` stage behind `shakespii test --run --triggers` (3 reps/query majority rule, 0.8 accuracy threshold — measure-only; the earlier "threshold on held-out split" wording described the retired optimizer design) (8d90dd3..5488cd5)
- [x] Benchmark stats: `shakespii bench <path>` producing a validated `benchmark.json` (with/without skill, runs-per-configuration default 3, mean/stddev/min/max + signed deltas) (8d90dd3..5488cd5)
- [x] Calibration sweep (docs/CALIBRATION-M4B2.md) (a6e8a49, 60de666)
- [x] using-shakespii v0.5.0 teaches the bench and trigger-accuracy loops (8ed0767)

(Live-compress evals sync moved to M5 with the personal-skill migration — decided 2026-07-09.)

## M5 — Writer + publishing

- [ ] Writer implemented as a skill (interview → draft → critique → refine loop), itself linted and tested by shakespii
- [ ] Install gate: lint must pass before a skill lands in `~/.claude/skills/`
- [ ] ai-cortex promotion path: recurring pattern/gotcha memories surfaced as candidate skill drafts
- [ ] Personal-skill migration (decided 2026-07-09): run the 13 personal skills through the audit loop, collapse the 5 kickoff clones into one parameterized skill (triggers validated with TR02), and sync the repaired compress evals into the live skill (after the CALIBRATION-M4B1 eval rewordings are adjudicated). The dogfood corpus at `~/.claude/skills/` stays read-only until this lands.

## M6 — Curated library

Author the missing engineering skills through shakespii's own pipeline (dogfood): repository inspection, architecture review, performance profiling, dependency audit, migration planning, API design review, codebase onboarding. Twenty excellent skills, not hundreds of mediocre ones.

---

## Open decisions (user's to make — do not pick silently)

| Decision | Options on the table | Notes |
|---|---|---|
| Runtime language | ~~TypeScript/Node (or Bun), Python, Go~~ | **Decided 2026-07-07: TypeScript on Bun** (M2 spec) |
| Distribution | ~~npm package, Homebrew, plain git clone~~ | **Decided 2026-07-07: local link (`bun link`) for the MVP; npm publish graduates at M5** |
| CLI name | `shakespii` | **Confirmed 2026-07-07** |
| Score model | ~~Severity counts only vs 0–100 aggregate score~~ | **Decided 2026-07-08: severity counts only** — no research-backed weighting exists; revisit condition: M6 library ranking (M3a spec §0) |
| Personal-skill migration | ~~Now, after M4b-2, or at M5~~ | **Decided 2026-07-09: defer to M5** — writer + install gate are the migration tooling; the kickoff-clone collapse is validated with TR02; the live-compress evals sync travels with it (live corpus stays read-only until then) |
| XS02 similarity threshold | ~~0.55, 0.65, keep 0.8~~ | **Decided 2026-07-09: 0.65** — forms the 4-skill kickoff cluster (all edges ≥0.6607, CALIBRATION-M3B); quick-task (best edge 0.5547) stays out; 0.55 rejected as untested corpus-wide precision risk. Implementation: standalone TDD change before M4b-2 |
