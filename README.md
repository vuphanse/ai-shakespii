# ai-shakespii

Local-first workbench for crafting reusable AI agent skills — treating skills like software components: single responsibility, explicit contracts, versioned, linted, and tested.

Most prompt tools focus on writing better prompts. ai-shakespii focuses on designing better **capabilities**. If software engineering has APIs, libraries, and modules, AI-assisted engineering should have skills with the same level of discipline.

## Status

**Foundation phase — no code yet.** All strategic decisions, audit evidence, and the roadmap live in `docs/`. Read them before touching anything.

## What this will be

A CLI (`shakespii`) that operates on standard Agent Skills (`SKILL.md` format):

- `shakespii init <name>` — scaffold a well-formed skill
- `shakespii lint <path>` — validate a skill against the rule catalog
- `shakespii test <path>` — run a skill's eval cases against representative scenarios
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

## Guiding principle

> The goal is not to create clever prompts. The goal is to build reliable, reusable engineering skills that can be shared across projects and teams.

Quality over quantity: twenty excellent skills beat hundreds of mediocre ones.
