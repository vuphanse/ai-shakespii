# Trigger cache key scoping + TR03 unmeasurable-query lint — Design

- **Date**: 2026-07-12
- **Status**: Approved
- **Scope**: two backlog items from the M5d calibration campaign, implemented together as one release unit (item 2 then item 3, separate commits)

## 1. Problem

**Item 2 — trigger cache key over-scoping.** `triggerKey` consumes
`skillContentHash` (`src/lib/harness/run-dir.ts`), which hashes SKILL.md plus
every file in the skill directory (the inventory walk excludes only `.git`).
The trigger stage (`src/lib/harness/trigger-stage.ts:88`) therefore re-buys the
full live trigger matrix (3 reps × every query) after ANY file edit — including
eval-case wording tweaks, fixture additions, and version bumps that cannot
influence trigger routing. M5d paid this tax repeatedly (~1,460 sessions across
the campaign, a substantial fraction of them re-bought trigger reps).

The trigger verdict is purely "did the model invoke the skill" — the runner
detects Skill-tool invocation (`detect: { skillName }`) and majority-votes over
3 reps. Before invocation the model sees only the skill picker entry, which is
built from frontmatter `name` and `description`. Body content, `version`,
evals, triggers.json expectations, and fixtures cannot influence the measured
bit. (triggers.json's per-query expectation is applied at verdict time, and
each query is already independently keyed via its own hash inside
`triggerKey`.)

**Item 3 — unmeasurable leading-slash queries.** Measured M5d gotcha
(mem-2026-07-11 …-55ef4f): a trigger query beginning with `/` is intercepted by
the Claude Code CLI as a slash command before it ever reaches the model, so its
trigger measurements are meaningless; `$`-prefixed forms (e.g. `$aiw-sdd`) and
prose phrasings measure fine. Nothing warns statically today — the cost is
discovered only after spending live sessions.

## 2. Design — routing-scoped trigger cache key

New function in `src/lib/harness/run-dir.ts`:

- `skillRoutingHash(skill)` — sha256 over parsed frontmatter `name`, a `\0`
  separator, and parsed frontmatter `description`. These are the only inputs
  that influence skill routing in a trigger session.

Changes:

- `runTriggerStage` uses `skillRoutingHash(skill)` where it currently computes
  `skillContentHash(skill)`. No other stage changes: `runKey` (scenario evals)
  and `benchKey`/`suiteKey` (bench) keep the full-content hash — their sessions
  read the whole mounted skill, so full-content scoping is correct there.
- The stage tag inside `triggerKey` changes from `'trigger'` to
  `'trigger:nd'`, making old and new keyspaces disjoint by construction.
- **No `RUN_CACHE_VERSION` bump.** Executor session semantics are unchanged;
  scenario/bench caches stay valid. Orphaned old trigger run dirs stay on disk,
  ignored — the documented behavior for superseded cache entries.
- The `stageTriggerRunDir` docstring currently claims the mount has "no eval
  files"; the loop mounts every inventory file. The comment is corrected to
  match reality (the mount itself is unchanged).

Consequences:

- Free (trigger cache preserved): body edits, `version` bumps, evals.json /
  fixture / triggers-expectation edits. In particular the parked
  deliberation-craft anti-pattern body edit and all version-continuity bumps
  from the skill-ownership migration no longer re-buy trigger matrices.
- Expensive (trigger cache invalidated — correctly): `name` or `description`
  edits, the inputs trigger accuracy actually measures.
- One-time cost: every skill re-buys its trigger matrix on its next
  `--triggers` run, since all keys change scheme.

Alternative rejected: hashing the whole SKILL.md. Simpler, but the
skill-ownership migration's version-continuity rule puts a `version` bump in
SKILL.md frontmatter on every content release, so whole-file scoping re-buys
the matrix on every release even for body-only changes — most of the tax would
remain.

Safety argument: the trigger stage's documented precondition is a
deterministic-clean skill, which guarantees `name` and `description` exist and
are non-empty before any key is computed. If a future harness change surfaces
additional frontmatter to routing, that is an executor-semantics change and
takes the existing `RUN_CACHE_VERSION` bump path.

## 3. Design — TR03 lint rule (unmeasurable trigger queries)

New rule `src/lib/rules/TR03.ts`, registered in `src/lib/rules/index.ts` and
the default profile with severity **warn**:

- Gates: fires only when `evals/triggers.json` exists, parses as JSON, and
  passes `validateTriggersJson` — otherwise silent (missing/invalid suites are
  TR02's findings; no duplicates).
- Check: flag every query whose `query.trimStart()` starts with `/`.
- Output: at most one finding per skill (TR01/TR02 cap precedent) enumerating
  the offending query indices. Message states that leading-`/` queries are
  intercepted by the Claude Code CLI before reaching the model and are
  unmeasurable (measured, M5d), and suggests `$`-prefixed or prose phrasings.
- Both positive and negative queries are flagged — the interception happens
  either way.
- Boundary: only the harness measurement path is blind to `/`-forms; they work
  in real interactive use, so a skill's *description* may legitimately document
  them. TR03 inspects queries only and must never be extended to descriptions.

## 4. Testing (TDD, tests first in each commit)

Item 2 (`test` coverage for run-dir + trigger-stage):

- `skillRoutingHash` stability: edits to body, `version`, evals.json,
  fixtures, and triggers.json leave the hash unchanged; edits to `name` or
  `description` change it.
- Keyspace disjointness: `triggerKey` output under the new scheme never equals
  the old scheme's output for identical inputs (the `'trigger:nd'` tag).
- Trigger-stage cache behavior: a cached `trigger.json` written under the new
  key is reused after an eval-file edit (the previously re-buying case), and
  is not reused after a description edit.

Item 3 (rule tests following the existing per-rule test pattern):

- Clean suite (prose + `$`-prefixed queries) produces no findings.
- Suite with leading-`/` queries produces one warn finding enumerating the
  right indices (including a whitespace-prefixed `/` case).
- Missing or invalid triggers.json produces no TR03 findings.

## 5. Documentation

- `docs/HARNESS.md`: cache-key section updated — trigger stage keys on routing
  inputs (name + description), scenario/bench stages key on full content;
  note the no-version-bump migration and one-time re-buy.
- `docs/LINT-RULES.md`: TR03 entry with the measured rationale.

## 6. Out of scope

- Scenario executor prompt-frame fix (next backlog item, separate design).
- Any npm release mechanics — a 0.3.2 release is cut after the executor-frame
  decision determines what rides along.
- Harness-side runtime skipping of leading-`/` queries (lint catches them
  before spend; the harness keeps measuring whatever it is given).
- Trigger transcript header collision and other RELEASE-M5C backlog items.
