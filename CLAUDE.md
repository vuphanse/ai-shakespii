# ai-shakespii — project instructions

Workbench (init / lint / test / publish) for AI agent skills. Skills are treated as software components with explicit contracts.

## Non-negotiable decisions (see docs/STRATEGY.md for rationale)

1. **Standard format only.** Skills produced or validated by this tool use the standard Agent Skills format (`SKILL.md`, YAML frontmatter with `name` + `description`, spec at agentskills.io). Never invent a parallel format. The ai-shakespii skill anatomy (Intent / Inputs / Preconditions / Procedure / Output / Examples / Anti-patterns) is enforced as a **content contract** inside standard SKILL.md bodies.
2. **Build order: linter → test harness → writer → library.** The writer is implemented as a skill itself, not as app code.
3. **Reuse skill-creator eval schemas** (`evals.json` / `grading.json` / `benchmark.json` + the trigger-accuracy eval design) for the test harness. Wrap and enforce; do not reinvent.
4. **TDD for all code.** Every lint rule is a pure function over a parsed skill (frontmatter + section AST) with fixture tests written first.

## Documentation workflow

Canonical doc copies live in `~/.ai-pref-nsync/local-docs/ai-shakespii/` (subdirs: `specs/`, `plans/`, `brainstorm/`, `knowledge-references/`). The in-repo `docs/` directory is the synced mirror. When updating a doc, update both locations.

## Before implementing anything

- Read `docs/ROADMAP.md` — it lists open decisions (runtime language, distribution, lint profile defaults). Do not pick these silently; they are the user's to make.
- Lint rules must cite their evidence (audit doc reference) in the rule catalog before implementation.
- The dogfood corpus is the user's own installed skills at `~/.claude/skills/` and the superpowers plugin — calibrate rules against it, never assume synthetic fixtures are enough.
