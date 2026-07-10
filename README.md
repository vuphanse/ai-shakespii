# shakespii

[![CI](https://github.com/vuphanse/ai-shakespii/actions/workflows/ci.yml/badge.svg)](https://github.com/vuphanse/ai-shakespii/actions/workflows/ci.yml) [![npm](https://img.shields.io/npm/v/shakespii)](https://www.npmjs.com/package/shakespii) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

shakespii is a workbench for [Agent Skills](https://agentskills.io) — the `SKILL.md` folders that Claude Code, Codex, Gemini CLI, Cursor, and a growing list of coding agents all load. It treats skills like software components instead of prompt folders you copy around and hope: linted against an evidence-backed rule catalog, tested by actually running their evals, benchmarked for measured impact, and installed through a quality gate into every agent you use.

## Magic moment

Point the linter at a skill you already have:

```bash
bun add -g shakespii
shakespii lint ~/.claude/skills/my-skill
```

```text
~/.claude/skills/my-skill/SKILL.md
     1:1  error  version field missing — skills are versioned components (semver)  FM05
     3:1  error  description must begin with a trigger phrase (one of: use when, use for, use if, use this, invoke when, when the user)  FM04
          warn   no evals/triggers.json — add a trigger-accuracy query set (16+ labeled queries incl. negatives)  TR02

✖ 3 problems (2 errors, 1 warnings)
```

It reads like ESLint because it works like ESLint: every finding carries a rule ID, a location, and an actionable message. Fix, re-lint until clean, then land the skill in every agent on your machine through the gate:

```bash
shakespii install ~/.claude/skills/my-skill --provider all
```

From there the workbench covers the whole life of a skill:

- **Lint** — 28 rules covering the frontmatter contract, section anatomy, content hygiene, and (with `--corpus`) cross-skill duplication across your whole installed collection. Every rule is backed by evidence from a real skill-corpus audit, not taste.
- **Test** — `shakespii test` validates a skill's eval suite for free; add `--run` and a headless agent actually executes every eval while an LLM grader scores each expectation with cited evidence. Add `--triggers` to measure whether the skill fires on the right requests — and stays quiet on the wrong ones.
- **Bench** — `shakespii bench` runs the evals with and without the skill mounted and reports the delta in pass rate, time, and tokens. Whether your skill actually helps stops being a feeling.
- **Gate install** — `shakespii install` refuses to land a broken skill: lint errors block, eval-suite defects block, and near-duplicates of skills you already have are called out before they pile up. One artifact installs to Claude, Codex, Cursor, Antigravity, Gemini, the tool-agnostic `~/.agents/skills`, or any directory you point it at.
- **Agent-first** — two bundled skills teach your agent to drive all of the above, so you ask in plain language and the agent runs the loops.

## Who this is for

shakespii is for engineers who already use agent skills and want discipline around them:

- your `~/.claude/skills` (or `~/.codex/skills`) folder has grown past the point where you remember what's in it.
- you share skills across several tools and want one artifact that installs everywhere, gate-checked each time.
- you'd rather measure a skill's trigger accuracy and capability delta than eyeball its description.
- you want your agent to do the auditing and authoring, with a deterministic CLI underneath it.

It is **not** for:

- one-off prompting — if you don't keep reusable skills, there's nothing here to lint.
- discovering skills — shakespii ships tooling plus its two companion skills, not a skill marketplace.
- writing prompts for you from nothing — the authoring loop interviews *you*; the substance stays yours.

## Prerequisites

- **[Bun](https://bun.sh) 1.3+** — the CLI runs on Bun (`npm i -g shakespii` works too, as long as `bun` is on your PATH).
- **[Claude Code CLI](https://claude.com/claude-code)**, signed in — only for the LLM stages (`test --run`, `--triggers`, `bench`). Everything else — `init`, `lint`, plain `test`, `install` — is deterministic, offline, and free.

Developed on macOS, CI on Linux.

## Safety & cost

The LLM stages (`test --run`, `--triggers`, `bench`) spawn real headless `claude` sessions with `--dangerously-skip-permissions` inside disposable per-run workspaces. Sessions are isolated from your user-level skills and memory files, and a contamination scanner flags anything that leaks through — but the workspace is containment by convention, not a sandbox. **Only point the LLM stages at your own or trusted skills.** They also spend real tokens; results are cached by content, so re-runs without changes are free. The full model and rationale live in [docs/HARNESS.md](docs/HARNESS.md).

`shakespii install` writes into live agent config directories. An occupied destination is never overwritten without `--force`, and a symlink's target is never touched.

## Quickstart

```bash
bun add -g shakespii

# onboard the companion skills through the gate (agents pick them up immediately)
shakespii install using-shakespii
shakespii install authoring-skills

# audit one skill, or your whole collection
shakespii lint ~/.claude/skills/my-skill
shakespii lint ~/.claude/skills --corpus

# author a new one: scaffold → fill it in → lint until clean
shakespii init my-new-skill
shakespii lint my-new-skill

# check the eval suite (free), then actually run it (spends tokens)
shakespii test my-new-skill
shakespii test my-new-skill --run

# measure trigger accuracy and capability impact
shakespii test my-new-skill --run --triggers
shakespii bench my-new-skill

# ship it everywhere
shakespii install my-new-skill --provider all
```

Every command takes `--json` for machine-readable output with stable schemas and exit codes (`0` clean, `1` findings, `2` couldn't run) — built for agents and CI as much as for you.

## Agent-first by design

Humans don't compose skills by typing CLI flags; agents do the work under human instruction. The CLI is the deterministic substrate — rule IDs, versioned JSON, exit codes — and the bundled skills are the interface:

- **using-shakespii** teaches an agent the audit loop (lint → fix → re-lint), the eval and bench loops, and the gate-install flow. After installing it, "audit all my installed skills for duplication" just works.
- **authoring-skills** turns an idea, some notes, or a repeated workflow into a new skill through an interview → draft → critique → refine loop — with eval cases and a measured trigger set, not just prose.

Both skills are themselves linted, eval-tested, and trigger-measured by shakespii — the tooling eats its own cooking.

## Core concepts

**Standard format only.** shakespii produces and validates plain [Agent Skills](https://agentskills.io) — no custom format, no lock-in. That's why one artifact can gate-install into seven different tools' skill directories.

**Enforcement over guidance.** The ecosystem has plenty of skill-writing advice; what's been missing is a tool that *checks*. A July 2026 audit of 30 installed skills found zero versioned skills, zero working test harnesses, and large-scale copy-paste duplication — that audit seeded the rule catalog, and every rule cites its evidence.

**Free by default, paid by choice.** The deterministic layer (lint, schema checks, install gate) costs nothing and runs anywhere. The LLM layer (eval runs, grading, trigger measurement, benchmarks) is opt-in per command, cached by content, and never runs behind your back.

## Learn more

- [docs/LINT-RULES.md](docs/LINT-RULES.md) — the rule catalog, each rule with its audit evidence.
- [docs/HARNESS.md](docs/HARNESS.md) — how the LLM stages execute, isolation, caching, and the safety model.
- [docs/STRATEGY.md](docs/STRATEGY.md) — the strategic decisions and their rationale.
- [docs/ROADMAP.md](docs/ROADMAP.md) — milestones shipped and next.
- [docs/VISION.md](docs/VISION.md) — where this is going: a curated library of excellent skills, not hundreds of mediocre ones.

## Workspace commands

```bash
bun install
bun test              # hermetic — no network, no agent sessions
bun run typecheck
bun run check-pack    # npm tarball content guard
```

Repo layout: `src/` (CLI + pure lib), `skills/` (the bundled companion skills), `templates/` (the `init` scaffold), `profiles/` (the lint profile — every threshold lives in data, not code), `tests/` (fixture-driven, 530+ tests).

## License

[MIT](./LICENSE).

> The goal is not to create clever prompts. The goal is to build reliable, reusable engineering skills that can be shared across projects and teams.
