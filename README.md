# ai-shakespii

Local-first workbench for crafting reusable AI agent skills — treating skills like software components: single responsibility, explicit contracts, versioned, linted, and tested.

Most prompt tools focus on writing better prompts. ai-shakespii focuses on designing better **capabilities**. If software engineering has APIs, libraries, and modules, AI-assisted engineering should have skills with the same level of discipline.

## Status

**M4a shipped — the test harness's static half is live.** `git clone` + `bun install` + `bun link` gives you `shakespii init`, `shakespii lint` (full single-skill rule catalog, pretty + `--json` output, plus `--corpus` for cross-skill XS01/XS02 checks and `--config` for profile overrides), and `shakespii test` (skill-creator eval-suite validation, TR01, run-dir/cache skeleton), and `skills/using-shakespii/` teaches agents to drive them (see the install section below). Strategy, audit evidence, and the roadmap live in `docs/`; next up is M4b (the harness's LLM half — scenario runs and grading).

## Install the companion skill

`skills/using-shakespii/` teaches agents to drive this CLI — the audit loop and the
authoring loop. Install it by symlinking into your live skills directory:

    ln -s "$(pwd)/skills/using-shakespii" ~/.claude/skills/using-shakespii

Run it from the repo root. Uninstall by removing the link:
`rm ~/.claude/skills/using-shakespii`. The repo copy stays the source of truth.

## What this will be

A CLI (`shakespii`) that operates on standard Agent Skills (`SKILL.md` format):

- `shakespii init <name>` — scaffold a well-formed skill
- `shakespii lint <path>` — validate a skill against the rule catalog; `--corpus`
  lints a whole directory of skills (cross-skill XS rules included) and `--config`
  applies profile overrides
- `shakespii test <path> [--json] [--run] [--fresh] [--model <name>] [--triggers]` — static checks on a skill's eval suite for free; `--run` executes the evals headlessly and LLM-grades every expectation, cached per (skill content, eval, model); `--triggers` (requires `--run`) additionally measures trigger accuracy against `evals/triggers.json`
- `shakespii bench <path> [--json] [--runs <n>] [--model <name>] [--fresh]` — benchmark a skill with vs without the skill mounted, producing `benchmark.json` with pass-rate/time/token deltas over `--runs` (default 3) repetitions per configuration
- Writer and publishing workflows come later (see roadmap)

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
