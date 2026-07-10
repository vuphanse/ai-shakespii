# AGENTS

## Project Summary

- `shakespii` (repo `ai-shakespii`) is a workbench for Agent Skills — init / lint / test / bench / gate-checked install. Skills are treated as software components with explicit contracts, not prompt folders.
- Architecture is lib-first thin CLI: `src/lib` is pure (rules never touch disk — sibling file content rides on `FileEntry.text`), `src/cli` does all I/O. TypeScript on Bun; published to npm as `shakespii` with **no build step** — the tarball ships `src/` verbatim, so the tarball layout must equal the repo layout (`packageRoot` resolution depends on it).
- Build order (decided): linter → test harness → writer-as-skill → library. The writer (`skills/authoring-skills`) is a skill, not app code.

## Non-Negotiable Decisions

See `docs/STRATEGY.md` for rationale.

1. **Standard format only.** Skills produced or validated by this tool use the standard Agent Skills format (`SKILL.md`, YAML frontmatter with `name` + `description`, spec at agentskills.io). Never invent a parallel format. The shakespii skill anatomy (Intent / Inputs / Preconditions / Procedure / Output / Examples / Anti-patterns) is enforced as a **content contract** inside standard SKILL.md bodies.
2. **Reuse skill-creator eval schemas** (`evals.json` / `grading.json` / `benchmark.json` + the trigger-accuracy eval design). Wrap and enforce; do not reinvent.
3. **TDD for all code.** Every lint rule is a pure function over a parsed skill with fixture tests written first; the same discipline applies to harness and CLI code.
4. **Agent-first interface.** The CLI is the deterministic substrate (`--json`, exit codes, rule IDs); the bundled companion skills are the interface agents drive it through.

## Source Of Truth

- Tracked specs live in `docs/specs/`; implementation plans in `docs/superpowers/plans/`.
- **Dual-location rule:** canonical doc copies live in `~/.ai-pref-nsync/local-docs/ai-shakespii/` (subdirs `specs/`, `plans/`, `brainstorm/`, `knowledge-references/`; ROADMAP canonical at `plans/ROADMAP.md`). The in-repo `docs/` files are synced mirrors — update both, verify with `cp` + `cmp`. `README.md` is repo-only.
- `docs/ROADMAP.md` lists open decisions — **they are the user's to make; never pick one silently.**
- Lint rules cite their evidence (audit doc reference) in `docs/LINT-RULES.md` before implementation. The dogfood corpus is the user's installed skills at `~/.claude/skills/` plus the superpowers plugin — calibrate against it; synthetic fixtures are never enough.

## Repo Layout

- `src/cli/`: command entrypoints (`index.ts` dispatch; `lint`, `test`, `bench`, `init`, `install`; `format/` serializers).
- `src/lib/`: pure core — `engine.ts` (rule runner), `parser/`, `profile/`, `rules/` (one file per rule ID), `corpus/`, `install/` (registry + gate), `harness/` (deterministic + LLM stages, runner, cache, contamination scan).
- `profiles/default.yaml`: the lint profile — every threshold and alias lives in data, not code.
- `templates/skill/`: the literal `shakespii init` scaffold (RED-by-design placeholders).
- `skills/`: bundled companion skills (`using-shakespii`, `authoring-skills`) — linted, eval-tested, and trigger-measured by the tool itself; weld tests pin their contracts.
- `tests/`: fixture-driven bun tests; `tests/helpers/skill.ts` builders. `scripts/check-pack.ts`: npm tarball guard. `.github/workflows/`: `ci.yml` + `release.yml`.

## Memory Layer Self-Use

- This project uses ai-cortex. Consult before non-trivial edits (`recall_memory` with scoped files), and record scars, adjudications, and gotchas as memories — **not in this file**, so they surface only when relevant.
- Cardinal pattern: `recall_memory` is browse-only; `get_memory(id)` is the consult signal.

## Frozen Surfaces

Locked contracts — changing any of these requires an explicit user decision, never a drive-by edit:

- Lint CLI flags + JSON report v1; flagless `test` output byte-identical; bench schema and stdout purity; grading contract; trigger report key orders; INSTALL_REPORT v1 (including the three-valued `advisory`: findings array / `[]` ran-clean / `null` skipped).
- `HARNESS_SCHEMA_VERSION = 1`, `RUN_CACHE_VERSION = 2`, and the harness constants (trigger reps/thresholds, timeouts, drain/settle bounds).
- **Never weaken an existing test assertion.** Version re-pins for sanctioned skill bumps are the only allowed re-pins.
- using-shakespii's frontmatter `description` is byte-frozen at its measured wording (weld-test pinned); description changes require a fresh trigger-accuracy loop, not an edit.

## Live Corpus & Harness Safety

- The dogfood corpus (`~/.claude/skills/` and the superpowers plugin cache) is **read-only** until the M5d migration. Gate-installs of new skills at the user's request are the exception; never mutate existing installed skills.
- Tests never touch real provider directories (inject a temp `HOME` or explicit `--target`) and never spawn a real `claude`; the suite must stay hermetic (CI carries no API key).
- The LLM stages (`test --run`, `--triggers`, `bench`) spawn headless sessions with `--dangerously-skip-permissions` in disposable workspaces — trusted skills only. Containment is convention, not a sandbox (`docs/HARNESS.md`): run live sweeps on a clean tree and check `git status` plus both doc roots for strays afterward.
- Never point the LLM stages at untrusted third-party skills.

## Workflow Rules

- Non-trivial features follow brainstorming → spec → plan → implement. Specs are adjudicated with the user before planning; plans carry complete code and tests per task.
- Prefer subagent-driven execution for multi-task plans (fresh implementer per task, per-task spec + quality review, final whole-branch review), with the model allocation the plan specifies.
- Each milestone closes with a calibration or verification pass against the real corpus/pipelines, recorded in a `docs/CALIBRATION-*.md` or release-notes doc with predictions/adjudications where applicable.
- Small fixes can go directly on `master`; inside an ai-whisper workflow the mounted workspace is operator-provided consent.

## Verification Rules

Before claiming any work complete, run all of:

- `bun test` (unpiped — the full hermetic suite)
- `bun run typecheck`
- `bun run check-pack` (tarball content guard)

Green at every commit, not just at the end. If verification is not clean, the work is not complete — report real failures instead of hand-waving them.

## Release Process

- Tag-driven: bump `package.json` version in a release commit, `git tag vX.Y.Z`, push the tag → `release.yml` runs the full CI gates, a tag-vs-package.json version guard, then `npm publish --access public`.
- Auth is currently the `NPM_TOKEN` granular-token path (trusted publishing could not be configured pre-first-publish); migrating to OIDC trusted publishing + provenance is an open follow-up — when done, drop the `NODE_AUTH_TOKEN` env line.
- Do not add an npm self-upgrade step to the workflow (it corrupted the runner's npm tree once — see `docs/RELEASE-M5C.md`); both workflows pin `NO_COLOR=1` because Actions sets `CI=true`, which would flip picocolors into color mode and break the formatter byte-pins.
- The npm page (README + description) refreshes only on publish — a docs-only patch release is the lever for npm-facing doc changes.

## Documentation Policy

- Update tracked specs when decisions change; update `README.md` (user-facing, npm page) and the relevant `docs/` file for behavior changes; sync canonical mirrors per the dual-location rule.
- Commit messages: normal prose, `type(scope): summary` style, no AI attribution.
- Keep this file procedural and stable. Do not duplicate spec content here; refer to the tracked docs.
