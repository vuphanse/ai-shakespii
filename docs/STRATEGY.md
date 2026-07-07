# ai-shakespii — Strategy

Decisions made 2026-07-07, informed by the corpus audit (see AUDIT-2026-07-07.md). Each decision lists its rationale so future sessions don't re-litigate.

## D1 — Adopt the Agent Skills standard; do not invent a format

**Decision:** Skills use standard `SKILL.md` (YAML frontmatter `name` + `description`, spec at agentskills.io). The ai-shakespii anatomy — Intent, Inputs, Preconditions, Procedure, Output contract, Examples, Anti-patterns — becomes a **content contract**: required body sections inside a standard SKILL.md, checked by the linter.

**Rationale:** Claude Code, superpowers, and plugin marketplaces already standardized on SKILL.md. A custom format would require an adapter before any real agent could run a shakespii skill — dead on arrival. With the standard format, every skill shakespii produces drops straight into `~/.claude/skills/` and runs today. Format is theirs; discipline is ours.

## D2 — Build order: linter → test harness → writer → library

**Decision:** Reorder the vision's phases. Phase 1 spec stays first, then MVP = `init` + `lint`, then the test harness, then the writer (implemented as a skill itself), then the curated library.

**Rationale:**
- The writer already exists in the ecosystem (superpowers `writing-skills`, Anthropic `skill-creator` with interview/draft/critique flows). Building another is low-value.
- Enforcement does not exist anywhere. The audit proved it: 0/30 skills versioned, 0 working test harnesses, the one attempted harness (compress `benchmark.py`) ships broken, and even the flagship `writing-skills` violates its own ecosystem's size rule (689 lines vs a stated <500 cap).
- The linter is deterministic pure code — no LLM calls, cheap, fast, and a perfect fit for TDD.
- The writer-as-a-skill is a recursive dogfood: shakespii lints and tests the skill that writes skills.

## D3 — Reuse skill-creator's eval schemas for the test harness

**Decision:** The harness adopts the JSON schemas already defined at
`~/.claude/plugins/marketplaces/claude-plugins-official/plugins/skill-creator/skills/skill-creator/references/schemas.md`:
`evals.json` (prompt / expected_output / files / expectations[]), `grading.json`, `benchmark.json` (with_skill vs without_skill, mean±stddev), plus the **trigger-accuracy eval** design (~20 labeled queries including near-miss negatives, train/held-out split, ≥3 reps).

**Rationale:** The ecosystem defined these schemas and even ships runner scripts (`run_eval.py`, `run_loop.py`, grader/comparator agents) but never enforces their presence — skill-creator's own `evals/` directory doesn't exist. Shakespii's job is to wrap and enforce, not reinvent. Scenario runs execute headless via `claude -p` / the Agent SDK; deterministic checks (required sections present, output shape) run before any LLM-judge grading. Eval runs are expensive: on-demand and cached, never per-commit.

## D4 — The lint profile is opinionated and must adjudicate ecosystem contradictions

The reference authorities contradict each other. The linter cannot enforce both, so shakespii ships a default profile with explicit choices (each overridable per-project):

| Conflict | Authorities | Default profile choice |
|---|---|---|
| Description style | superpowers: state WHEN only, never summarize workflow. Anthropic/skill-creator: state both what AND when | Trigger-first ("Use when…"), third person, concrete keywords; a short "what" clause allowed but the workflow itself must not be summarized |
| Body size budget | <500 words (writing-skills) vs <500 lines (Anthropic) vs 1500–2000 words (skill-development) | Warn > 2,000 words or > 500 lines; error > 3,000 words. Calibrated so it flags real offenders (writing-skills at 3,807 words) without punishing rich skills |
| Version field | Nobody requires it; only 1/30 skills has one | Required. Skills are components; components are versioned |

## D5 — Ecosystem integration points

- **Lint gate:** a skill must pass `shakespii lint` before being installed into `~/.claude/skills/`.
- **Dogfood corpus:** the user's installed skills (13 personal + superpowers) are the calibration set for every rule. A rule that flags nothing real or flags everything is miscalibrated.
- **Memory → skill promotion path (with ai-cortex):** recurring `pattern`/`gotcha` memories in ai-cortex are candidate skill drafts. Memory says "this keeps happening"; shakespii turns it into a designed capability. Unique to this setup — design the pipeline early, build it after MVP.
- **Cross-skill analysis is in scope:** the audit found a ~70-line block copy-pasted verbatim across 5 skills. Nothing in the ecosystem detects this. Duplicate-block detection and near-clone similarity are shakespii lint rules, not afterthoughts.

## MVP definition

`shakespii init <name>` — scaffold: `SKILL.md` (standard frontmatter + content-contract sections), `evals/evals.json` stub, `README.md`.
`shakespii lint <path>` — run ~5 seed rules with ESLint-style severities and cited evidence.

Seed rules (from LINT-RULES.md): FM01 frontmatter well-formed, FM02 name/dir discipline, FM04 description trigger-quality, CT03 worked example required, ST02 referenced files exist.

First harness fixture is free: fixing compress's broken `benchmark.py` fixtures path is a real-world RED test.
