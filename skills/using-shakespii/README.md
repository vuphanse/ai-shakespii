# using-shakespii

Teaches an agent to drive the shakespii CLI: audit an existing skill (lint → fix →
re-lint until clean) or author a new one (init → fill → lint-loop → evals → present).
The CLI is the deterministic arbiter; this skill is the thin operational layer around
it. Source of truth is `skills/using-shakespii/` in the ai-shakespii repo — the copy
under `~/.claude/skills/` is a symlink, so fix findings at the source.

## Develop

    shakespii lint .
