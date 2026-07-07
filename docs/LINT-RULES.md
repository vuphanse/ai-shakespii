# Lint rule catalog — v0

Every rule cites evidence from AUDIT-2026-07-07.md. Severity model is ESLint-style: `error` (fails the gate), `warn` (reported, doesn't fail). All thresholds live in the default profile and are overridable per project (see STRATEGY.md D4).

Rules are pure functions over a parsed skill: `(frontmatter, section AST, sibling files, corpus context) → findings[]`. Each rule ships with fixture tests before implementation (TDD).

## FM — Frontmatter

| ID | Severity | Rule | Evidence |
|---|---|---|---|
| FM01 | error | Frontmatter present with non-empty `name` and `description`; unknown fields warned (allowed extras: `version`, `compatibility`, `license`, `allowed-tools`) | 14/14 superpowers use exactly name+description; spec limits frontmatter ≤1024 chars |
| FM02 | error | `name` matches `^[a-z0-9]+(-[a-z0-9]+)*$`, ≤64 chars, equals the directory name | Ecosystem spec + plugin auto-discovery matches dir name |
| FM03 | warn | `description` ≤1024 chars hard (error), warn >500 | Corpus max is 234 chars — headroom confirms threshold |
| FM04 | error | `description` is third person and trigger-phrased (starts "Use when…" or equivalent, contains concrete searchable keywords); first-person is an error | 13/14 superpowers begin "Use when"; a workflow-summarizing description demonstrably caused wrong agent behavior (writing-skills:154-156) |
| FM05 | error | `version` field present, semver | **0/30 corpus compliance** — shakespii's flagship requirement; skills are components, components are versioned |

## CT — Content contract (the ai-shakespii anatomy)

| ID | Severity | Rule | Evidence |
|---|---|---|---|
| CT01 | error | Preconditions/Requirements section enumerates every external dependency: binaries, env vars, network, path-layout assumptions | Audit S6: `whisper` CLI, `~/.ai-whisper/auth.json`, `claude` binary, `npx skills`, `AI14ALL_*` env vars, `docs/superpowers/deliberations/` — all undeclared |
| CT02 | error | Output contract present and resolvable from files inside the skill directory — no "obey the handoff format" pointing at unshipped documents | Audit S5: ai-whisper-code-review, deliberation-craft |
| CT03 | error | At least one concrete input→output worked example (trigger-phrase lists don't count) | Audit S4: 10/13 personal skills lack one |
| CT04 | warn | Inputs declared (what the skill consumes, which are optional) | No skill in either corpus declares inputs |
| CT05 | warn | Anti-patterns / failure-modes section present | Strongest skills have it; weakest don't |

## ST — Structure

| ID | Severity | Rule | Evidence |
|---|---|---|---|
| ST01 | warn/error | H1 title present; body ≤2,000 words or ≤500 lines (warn), error >3,000 words | writing-skills at 689 lines / 3,807 words and subagent-driven-development at 419/3,085 breach the ecosystem's own cap — rule bites even reference skills |
| ST02 | error | Every referenced sibling file exists; references one level deep; no `../` escapes | Ecosystem rule; compress's benchmark globs a nonexistent dir |
| ST03 | warn | Reference files >100 lines carry a table of contents | Anthropic best-practices |
| ST04 | error | No `@`-prefixed force-load links; cross-skill deps as `REQUIRED SUB-SKILL:` / bare skill names | `@` force-loads and burns context (writing-skills:283-288) |
| ST05 | warn | Discipline furniture: if the body contains an Iron-Law/MUST/NEVER block, require a `| Excuse | Reality |` rationalization table and a Red Flags list | Pattern proven in TDD / systematic-debugging / verification-before-completion |

## HY — Hygiene

| ID | Severity | Rule | Evidence |
|---|---|---|---|
| HY01 | error | Forward-slash paths only | Ecosystem rule |
| HY02 | error | No machine-specific absolute paths (`/Users/...`, `/home/...`) | None found in personal corpus SKILL.md files — keep it that way; compress's Python globs a source-repo layout that doesn't survive installation |
| HY03 | warn | No time-sensitive phrasing ("currently", "as of", dates) outside an "Old patterns" / `<details>` block | Anthropic best-practices |
| HY04 | warn | Rot-prone embedded facts (external counts, leaderboards, product stats) flagged unless the skill carries `version` + a last-reviewed marker | find-skills: "185K installs", org leaderboards |
| HY05 | warn | Commands intended for execution are inside code fences | compress SKILL.md step 2 ships an unfenced run command |
| HY06 | warn | Quantitative claims (token savings, speedups) must be backed by a shipped eval or marked unverified | caveman claims ~75%, compress README says ~65% — inconsistent, neither verified |

## XS — Cross-skill (needs corpus context)

| ID | Severity | Rule | Evidence |
|---|---|---|---|
| XS01 | warn | Duplicate-block detection: >15 identical lines shared across ≥2 skills → extract to a shared reference | ~70-line collab-readiness block × 5 ai-whisper skills |
| XS02 | warn | Near-clone detection: body similarity above threshold → suggest parameterizing into one skill | The 5 kickoff skills share ~80% of their bodies |

## TR — Trigger & eval (harness-backed, not static)

| ID | Severity | Rule | Evidence |
|---|---|---|---|
| TR01 | warn | Skill ships `evals/evals.json` with ≥3 cases (skill-creator schema), fixtures resolving relative to the skill dir | Anthropic "minimum three evaluations"; compress's fixtures break because they don't resolve relative to the skill |
| TR02 | warn | Trigger-accuracy eval: ≥16 labeled queries incl. near-miss negatives, pass threshold on held-out split | skill-creator's ready-made design (60/40 split, 3 reps, select by test score) |

## Seed set for MVP

FM01, FM02, FM04, CT03, ST02 — highest signal, fully static, real offenders in the dogfood corpus to test against.
