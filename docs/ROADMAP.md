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

(Live-compress evals sync moved to M5d with the personal-skill migration — decided 2026-07-09.)

## M5a — Harness hardening + executor isolation (done 2026-07-10)

- [x] Isolation spike: 3-workspace positive-control probe proving `--setting-sources project,local` excludes user-global skills while project mounts and OAuth survive — gated all Task 2+ work (166fcd7)
- [x] `RUN_CACHE_VERSION = 2` comparability epoch across all four run keys (`runKey`, `triggerKey`, `benchKey`, `suiteKey`); `HARNESS_SCHEMA_VERSION` stays 1 for output documents (c4cbcca)
- [x] Executor isolation: `--setting-sources project,local` appended uniformly to every runner session (scenario, trigger, bench both configurations, grader) (4b91722)
- [x] `settleWithGrace` outer bound (`SETTLE_OUTER_BOUND_MS`): bounds the stdout/stderr drain-then-cancel sequence so a runner session can never hang the harness indefinitely (a582709)
- [x] Detector exact-match semantics (`Read` fires only on an exact `.claude/skills/<name>/SKILL.md` suffix, not a substring) (b4e0eef)
- [x] Contamination scanner + warnings: pure post-hoc scan over persisted/live events, `severity: 'warn'` findings for scenario/trigger, a plain-string warning list for bench (warnings never flip stage status, `bench --json` stdout stays byte-pure) (d41d13b..6597f75)
- [x] Grader prose-tolerance fix (fenced/prose-wrapped JSON replies parsed via outermost-brace fallback) and `grader-fail-<attempt>.md` persistence for gate-failed replies (32c52db..984f837)
- [x] Hygiene minors: shared bench fixture builder, invariant throws, tightened test pins, injected-fake gate proofs (82d0f9e)
- [x] Eval-5 corpus-audit prompt reworded to bound session length — adjudicated application of the CALIBRATION-M4B2 candidate, applied here by user decision rather than parked with the M5d migration (5cbde39)
- [x] Calibration sweep (docs/CALIBRATION-M5A.md): spike evidence, predictions committed pre-sweep, bench + trigger + scenario actuals, adjudicated findings, retro-scan of the M4b-2 corpus, both cache proofs green (a396274, 6079505)

Commit range: 166fcd7..246c054.

## M5b — Writer-as-skill (done 2026-07-10)

- [x] Writer implemented as a skill (interview → draft → critique → refine loop), itself linted and tested by shakespii (272602b)
- [x] Description optimization: use the M5a clean trigger-accuracy baseline (0.80, un-primed) to improve `name`/`description` trigger phrasing — using-shakespii reached 0.90, authoring-skills reached 0.85, each after two loop iterations (docs/CALIBRATION-M5B.md) (df3d0cc, d0ee935)
- [x] ai-cortex promotion path: recurring pattern/gotcha memories surfaced as candidate skill drafts — **decided 2026-07-10: deferred post-dogfood** (see Open decisions)
- [x] Full memory-file hermeticity: spike found `--setting-sources project,local` already excludes `~/.claude/CLAUDE.md` on claude CLI 2.1.202, proven with a paired positive/negative-control probe — **verdict RESOLVED-UPSTREAM**, no runner change needed, `RUN_CACHE_VERSION` stays 2 (docs/HERMETICITY.md) (a11021f)
- [x] Headless-aware eval design: reworded the ask-and-stall scenario expectations for single-turn headless execution and carried the same headless-execution guidance into the authoring-skills skill body (4b4cb68, 272602b)

Commit range: 5c5c711..d0ee935 (docs closeout follows).

## M5c — Install gate + npm publish (done 2026-07-10)

- [x] Install gate: `shakespii install <path-or-name>` — lint errors + deterministic eval failures block, warnings advise, per-target XS duplication advisory (three-valued contract), 7-provider registry (claude default, codex, cursor, antigravity, gemini, agents, ezio), `--force` staged swap, INSTALL_REPORT v1 (30ee457..5295625)
- [x] using-shakespii v0.7.0 teaches the install loop, description byte-frozen at the M5b-measured wording (00561a7)
- [x] CI + release pipelines: `ci.yml` gates (typecheck, hermetic suite, self-lint, deterministic eval checks, tarball guard) green on ubuntu-latest after the NO_COLOR fix (a7694c1, fa7650b, 1a23420); repo public; MIT; package renamed `shakespii` (dda62e3..30ee457)
- [x] npm publish graduation — **`shakespii@0.3.0` live on npm 2026-07-10** (token bootstrap path; first release-run failure from an npm self-upgrade corrupting the runner's npm tree, fixed by dropping the upgrade step, 271220c). Onboarding verified end to end: global install from the registry, gate-installs of both bundled skills into `~/.claude/skills` (using-shakespii v0.7.0 replacing the dev symlink) plus a codex-provider install, and the installed CLI linting the live copy clean from the tarball layout (docs/RELEASE-M5C.md)

Commit range: dda62e3..271220c (specs/plan + 9 task commits + 2 CI fixes + release staging + closeout). M5c heading status: **done 2026-07-10**.

## M5d — Personal-skill migration

- [ ] Personal-skill migration (decided 2026-07-09): run the 13 personal skills through the audit loop, collapse the 5 kickoff clones into one parameterized skill (triggers validated with TR02), and sync the repaired compress evals into the live skill (after the CALIBRATION-M4B1 eval rewordings are adjudicated). The dogfood corpus at `~/.claude/skills/` stays read-only until this lands.

## M6 — Curated library

Author the missing engineering skills through shakespii's own pipeline (dogfood): repository inspection, architecture review, performance profiling, dependency audit, migration planning, API design review, codebase onboarding. Twenty excellent skills, not hundreds of mediocre ones.

---

## Open decisions (user's to make — do not pick silently)

| Decision | Options on the table | Notes |
|---|---|---|
| Runtime language | ~~TypeScript/Node (or Bun), Python, Go~~ | **Decided 2026-07-07: TypeScript on Bun** (M2 spec) |
| Distribution | ~~npm package, Homebrew, plain git clone~~ | **Decided 2026-07-07: local link for MVP; npm at M5c.** M5c executed 2026-07-10: package `shakespii`, public repo, tag-driven publish — release-ready, tag fires once an npm credential exists (docs/RELEASE-M5C.md) |
| CLI name | `shakespii` | **Confirmed 2026-07-07** |
| Score model | ~~Severity counts only vs 0–100 aggregate score~~ | **Decided 2026-07-08: severity counts only** — no research-backed weighting exists; revisit condition: M6 library ranking (M3a spec §0) |
| Personal-skill migration | ~~Now, after M4b-2, or at M5~~ | **Decided 2026-07-09: defer to M5d** — writer + install gate are the migration tooling; the kickoff-clone collapse is validated with TR02; the live-compress evals sync travels with it (live corpus stays read-only until then) |
| XS02 similarity threshold | ~~0.55, 0.65, keep 0.8~~ | **Decided 2026-07-09: 0.65** — forms the 4-skill kickoff cluster (all edges ≥0.6607, CALIBRATION-M3B); quick-task (best edge 0.5547) stays out; 0.55 rejected as untested corpus-wide precision risk. Implementation: standalone TDD change before M4b-2 |
| ai-cortex promotion path | ~~Ship with M5b writer, or later once the writer's dogfooded~~ | **Decided 2026-07-10: deferred post-dogfood** — the writer ships without it; design the memory→skill-draft path after real authoring use (M5b spec §0.2) |
