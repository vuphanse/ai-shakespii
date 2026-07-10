# ai-shakespii

[![CI](https://github.com/vuphanse/ai-shakespii/actions/workflows/ci.yml/badge.svg)](https://github.com/vuphanse/ai-shakespii/actions/workflows/ci.yml) [![npm](https://img.shields.io/npm/v/shakespii)](https://www.npmjs.com/package/shakespii)

Local-first workbench for crafting reusable AI agent skills — treating skills like software components: single responsibility, explicit contracts, versioned, linted, and tested.

Most prompt tools focus on writing better prompts. ai-shakespii focuses on designing better **capabilities**. If software engineering has APIs, libraries, and modules, AI-assisted engineering should have skills with the same level of discipline.

## Status

**M5c shipped — `shakespii` is on npm.** `bun add -g shakespii` (or `npm i -g shakespii`; the CLI runs on Bun, so Bun must be on PATH) gives you `shakespii init`, `shakespii lint` (full single-skill rule catalog, pretty + `--json` output, `--corpus` for cross-skill XS01/XS02 checks, `--config` for profile overrides), `shakespii test` (scenario runs and rubric grading via `--run`, trigger accuracy via `--run --triggers`), `shakespii bench` (pass-rate/time/token deltas with vs without the skill mounted), and `shakespii install` (gate-checked install into any well-known agent skills directory — claude, codex, cursor, antigravity, gemini, the tool-agnostic `~/.agents/skills`, or ezio). Lint errors block an install; warnings advise; cross-skill duplication against the target corpus is reported as advisory. `skills/using-shakespii/` teaches agents to drive all of it, and `skills/authoring-skills/` is the interview → draft → critique → refine writer. Strategy, audit evidence, and the roadmap live in `docs/`; next up is dogfooding the writer, then M5d (personal-skill migration).

## Install

    bun add -g shakespii    # or: npm i -g shakespii — either way Bun must be on PATH

Then onboard the companion skills through the gate:

    shakespii install using-shakespii
    shakespii install authoring-skills

`using-shakespii` teaches agents to drive this CLI — the audit, testing,
bench, trigger, and install loops. `authoring-skills` turns an idea into a
new skill through an interview → draft → critique → refine loop, delegating
CLI mechanics to using-shakespii. The default install target is
`~/.claude/skills`; add `--provider codex|cursor|antigravity|gemini|agents|ezio`
(repeatable, or `--provider all`) for other agents, `--target <dir>` for
anywhere else, and `--force` to replace an existing copy. Working on this
repo itself? Symlinks still work for live-editing:
`ln -s "$(pwd)/skills/using-shakespii" ~/.claude/skills/using-shakespii`.

## What it does

A CLI (`shakespii`) that operates on standard Agent Skills (`SKILL.md` format):

- `shakespii init <name>` — scaffold a well-formed skill
- `shakespii lint <path>` — validate a skill against the rule catalog; `--corpus`
  lints a whole directory of skills (cross-skill XS rules included) and `--config`
  applies profile overrides
- `shakespii test <path> [--json] [--run] [--fresh] [--model <name>] [--triggers]` — static checks on a skill's eval suite for free; `--run` executes the evals headlessly and LLM-grades every expectation, cached per (skill content, eval, model); `--triggers` (requires `--run`) additionally measures trigger accuracy against `evals/triggers.json`
- `shakespii bench <path> [--json] [--runs <n>] [--model <name>] [--fresh]` — benchmark a skill with vs without the skill mounted, producing `benchmark.json` with pass-rate/time/token deltas over `--runs` (default 3) repetitions per configuration
- `shakespii install <path-or-name> [--provider <name>]... [--target <dir>] [--force] [--json]` —
  gate-checked install: lint errors and deterministic eval failures block, warnings
  advise, cross-skill duplication (XS rules) against the target corpus is reported
  per target as advisory; resolves bundled skill names (`using-shakespii`,
  `authoring-skills`) as well as paths

**Bench caveat.** `shakespii test --run`, `--triggers`, and `bench` all spawn
headless `claude` sessions with `--dangerously-skip-permissions` inside a
disposable per-run workspace — this is opt-in and intended for your own
trusted skills; the workspace is containment by convention, not a sandbox.
**Do not point them at untrusted third-party skills.** Separately, `bench`'s
`without_skill` baseline used to be contaminated by same-named skills already
installed globally (a skill named `compress` in your bare-agent baseline
answering for the `compress` skill under test, inflating its own delta to
zero or negative). As of M5a every session is isolated
(`--setting-sources project,local`), which excludes user-level skills and
plugins — the baseline-contamination class is mitigated — and a post-hoc
contamination scanner flags any non-target skill invocation that still slips
through as a `warn`-severity finding (`bench --json`'s stdout stays
byte-pure; warnings go to stderr). Through M5a, isolation was known to still
admit your `~/.claude/CLAUDE.md` user memory file into every session, able to
perturb scenario/trigger behavior identically across both bench configurations
(docs/CALIBRATION-M5A.md). An M5b spike re-tested this with a paired
positive/negative-control probe and found the leak no longer reproduces on
claude CLI 2.1.202 — `--setting-sources project,local` already excludes the
memory file on this CLI version, with no runner change required (see
`docs/HERMETICITY.md`). This is a version-scoped result, not a guarantee:
re-verify after major CLI upgrades.

The differentiator is **enforcement**: the ecosystem already has skill-writing guidance (superpowers `writing-skills`, Anthropic's `skill-creator`), but nothing lints skills and nothing runs their evals. Our July 2026 audit of 30 installed skills found zero versioned skills, zero working test harnesses, and large-scale copy-paste duplication — see the audit doc.

## Documentation map

| Doc | Purpose |
|---|---|
| [docs/VISION.md](docs/VISION.md) | Founding vision (seeded from the original braindump) |
| [docs/STRATEGY.md](docs/STRATEGY.md) | Strategic decisions and their rationale |
| [docs/AUDIT-2026-07-07.md](docs/AUDIT-2026-07-07.md) | Audit of the full installed-skill corpus (13 personal + 17 reference) |
| [docs/LINT-RULES.md](docs/LINT-RULES.md) | Lint rule catalog v0, every rule backed by audit evidence |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Milestones M0–M6 and open decisions |

Canonical copies of these documents live in `~/.ai-pref-nsync/local-docs/ai-shakespii/`; the in-repo `docs/` files are synced mirrors.

## Machine-readable artifacts (spec-as-data)

- `profiles/default.yaml` — the default lint profile: anatomy alias table, rule severities and options, provenance vintages. Loaded verbatim by the CLI from M2 on; no threshold or alias lives in code.
- `templates/skill/` — the literal scaffold `shakespii init` copies (RED-by-design `TODO(shakespii):` placeholders).

## Guiding principle

> The goal is not to create clever prompts. The goal is to build reliable, reusable engineering skills that can be shared across projects and teams.

Quality over quantity: twenty excellent skills beat hundreds of mediocre ones.
