# Executor prompt frame — scenario-stage semantics — Design

- **Date**: 2026-07-18
- **Status**: Approved (user adjudication 2026-07-18)
- **Scope**: resolves the M5d adjudication-6 backlog item (executor frame vs
  authoring guidance) as a guidance-and-suite change — zero harness code, zero
  cache-epoch change. Unblocks the 0.3.2 release scope parked by
  docs/specs/2026-07-12-trigger-cache-scope-tr03-design.md §6.
- **Origin**: brainstorm handoff (local-docs
  brainstorm/2026-07-17-executor-frame-brainstorm-handoff.md);
  docs/CALIBRATION-M5D.md "Follow-up loop", adjudication 6;
  ai-cortex mem-2026-07-11-scenario-stage-cannot-host-near-miss-dff19a.

## 1. Problem

Every scenario run is framed by `buildExecutorPrompt`
(`src/lib/harness/executor.ts:14`): "A skill named … is installed at …. Read
….SKILL.md first, then complete this task following the skill." The frame
pre-commits the executor to the skill lens, so a near-miss negative eval — a
prompt whose expectations assert the skill is NOT used — is structurally
unmeasurable in the scenario stage (measured M5d: the ai-whisper-workflow
bug-fix negative failed in scenario while the equivalent trigger query stayed
silent 3/3).

This contradicts the shipped authoring guidance: using-shakespii and
authoring-skills both instruct authors to include "one near-miss negative" in
`evals/evals.json`. Authors following the guidance write evals the harness
cannot honestly score.

Evidence verified during the brainstorm:

- Bench's `with_skill` arm shares the frame (`src/lib/harness/bench.ts:108`
  routes through `buildExecutorPrompt`); `without_skill` has no mount and no
  preamble. The trigger stage mounts with no preamble at all.
- docs/HARNESS.md (Executor section) already documents the frame as
  deliberate: "scenario evals measure capability with the skill; natural
  triggering is TR02's concern, measured separately by the trigger stage."
  The contradiction lives only in the authoring-guidance prose.
- All 11 derived suites in ~/Dev/ai-skills already conform — the M5d
  sweep-ready repairs (ai-skills `7ea05e5`) moved every doomed scenario
  negative into in-skill branches. The remaining non-conforming artifacts
  are all in the two bundled suites: using-shakespii eval 3 ("Fix the
  ESLint errors in src/.") and authoring-skills evals 3 AND 4 — eval 4 is
  the obvious blog-post negative, and eval 3 ("Lint my skill at
  ./skills/note-taker and fix the findings") is a disguised one: its
  expected output is "The authoring loop does not engage" with
  does-not-engage expectations (found at phase review; the prompt reads
  like a lint task, but for this skill it is a scope negative). Both
  bundled skills already carry ample trigger-stage negatives (9 and 8
  `should_trigger: false` queries respectively), so scope-discrimination
  coverage does not depend on the scenario cases.
- No lint rule enforces the evals.json near-miss mandate (TR01 checks only
  ≥3 cases; the negatives requirement is TR02's, on triggers.json) — the
  mandate exists purely in guidance prose.

## 2. Decision — Direction B: scenario stage measures skill-loaded capability

User adjudications (2026-07-18, this brainstorm):

1. **Direction B.** The scenario stage officially measures skill-loaded
   capability — "does the skill work once loaded" — not natural behavior.
   `buildExecutorPrompt` stays byte-identical; bench `with_skill` keeps
   sharing it (deliberate: guarantees skill engagement so the with/without
   delta measures the effect of using the skill, not routing). The trigger
   stage remains the sole owner of scope discrimination. `RUN_CACHE_VERSION`
   stays 2; `HARNESS_SCHEMA_VERSION` stays 1; no cache invalidation.
2. **Remove every bundled scenario negative; keep suites at the TR01
   floor.** As adjudicated: delete using-shakespii eval 3 and
   authoring-skills eval 4. Phase-review amendment (2026-07-18): review
   found a third, disguised negative — authoring-skills eval 3 (see §1).
   Deleting it too would leave 2 cases, below the TR01 ≥3 floor the
   adjudication requires, so it is REPLACED with an in-skill behavior
   branch (§3.5) — the only resolution consistent with both adjudicated
   constraints (no scenario negatives; suites stay ≥3). Final counts: 5
   and 3 cases.
3. **Guidance-only enforcement** — no new lint rule; a scenario-negative
   heuristic rule is parked as a backlog candidate (fragile: "Does not …"
   expectations are also legitimate in refusal-branch evals).
4. **0.3.2 cuts after this loop lands** — one release carrying the
   trigger-cache/TR03 work already on master plus these edits.

Consequences for the handoff's open questions: "how is a never-loaded run
scored" and "must bench change in lockstep" are moot (frame unchanged); the
cache re-buy question is moot (no epoch bump); the guidance and the two
bundled suites change as specified in §3.

Rationale: the harness contract already claims exactly these semantics
(docs/HARNESS.md), the live corpus already conforms, and stage separation
stays clean — the frame's "measurement bias" is the stage's documented
purpose, not a defect. Choosing B resolves the contradiction in favor of the
implemented-and-documented behavior at zero token cost, and gives M6 clean
authoring semantics before ~20 new suites are written.

## 3. Design — artifact changes

All changes live in this repo. `src/` is untouched; no lint rule changes; no
schema changes; historical specs and plans are point-in-time records and are
not rewritten.

### 3.1 docs/HARNESS.md — make the contract explicit

Extend the Executor section's existing frame sentence with the adjudicated
contract (wording final at implementation, content fixed): the scenario stage
is a skill-loaded capability test; a near-miss negative ("the skill should
not be used") is structurally unmeasurable under the frame because the
preamble has already committed the executor to the skill lens
(docs/CALIBRATION-M5D.md adjudication 6, decided 2026-07-18); scope negatives
are authored in `evals/triggers.json` only; bench's `with_skill` arm shares
the frame deliberately so the with/without delta measures skill usage.

### 3.2 skills/authoring-skills/SKILL.md — Phase 4 step 1

Replace "(at least three cases, one a near-miss negative)" with: at least
three cases, each an in-skill behavior branch — happy path, refusal or error
branches the skill itself defines, variants (e.g. resume) — with scope
negatives directed to `evals/triggers.json` (step 2, unchanged).

### 3.3 skills/authoring-skills/references/headless-eval-rules.md — rule 5

Replace the "Keep at least one near-miss negative case" rule with its
inversion: author only in-skill behavior branches; do not author near-miss
negatives in evals.json — the executor frame force-loads the skill, so a
don't-use-the-skill case is structurally unmeasurable; scope discrimination
belongs to `evals/triggers.json`, measured by the trigger stage.

### 3.4 skills/using-shakespii/SKILL.md — authoring step 8

Replace "one of them a near-miss negative that must not trigger the skill"
with the same in-skill-branch wording plus the triggers.json pointer. Body
edit only — the description is byte-frozen (frozen surface) and the name is
untouched, so `skillRoutingHash` is unchanged and all trigger caches replay.

### 3.5 Eval-suite changes

- `skills/using-shakespii/evals/evals.json`: delete case id 3; renumber 4→3,
  5→4, 6→5 (contiguity is part of the contract — §3.7 pins the exact id
  sequence; cost-free, since any evals.json edit rotates `skillContentHash`
  and re-buys the scenario cache regardless). Exactly five cases remain,
  ids 1–5.
- `skills/authoring-skills/evals/evals.json`: delete case id 4; REPLACE case
  id 3 (the disguised negative) with an in-skill behavior branch exercising
  the critique/refine phase, which evals 1–2 leave uncovered (eval 1 =
  scaffold + lint loop, eval 2 = interview-only). Content contract for the
  replacement (exact JSON lands in the implementation plan):
  - Prompt supplies a draft SKILL.md via the harness `files` fixture
    contract — the fixture path is pinned:
    `evals/fixtures/draft-skill/SKILL.md`, and eval 3's `files` is exactly
    that one entry. The prompt asks for a critique-and-refine pass against
    the skill's own rubric (`references/critique-rubric.md`), with approval
    to proceed pre-granted (headless-safe, no CLI dependency).
  - The fixture is a deliberately critiqueable draft: a parseable SKILL.md
    (frontmatter + body) planting at least two rubric violations, each
    marked by a distinctive substring the weld test pins verbatim (the
    plan enumerates the violations and their marker substrings).
  - Expectations assert in-skill behavior: applies the critique rubric to
    the supplied draft, names concrete weaknesses, produces a refined
    draft, and does not restart the interview or re-scaffold from scratch.
  - The prompt carries a distinctive anchor substring for the weld test
    (e.g. "Critique my draft skill" — final wording in the plan).
  Exactly three cases remain, ids 1–3.

The two deleted cases stage no fixture `files`; the replacement case adds
its own fixture. `evals/triggers.json` is untouched in both skills.

### 3.6 Skill version bumps

Guidance-body and eval-suite changes are component changes: using-shakespii
`0.7.0 → 0.8.0`, authoring-skills `0.1.0 → 0.2.0` (FM05 discipline).
`version` is not a routing input, so trigger caches still replay.

### 3.7 Test updates — deliberate pin changes, not weakenings

`tests/skill/using-shakespii.test.ts` and
`tests/skill/authoring-skills.test.ts` pin the current suite contents and
skill versions. This spec sanctions updating those pins to the new contract
(the frozen-surface rule forbids weakening assertions to make failing code
pass; it does not forbid re-pinning a deliberately changed artifact under an
approved spec):

- using-shakespii: drop the `'Fix the ESLint errors'` prompt anchor (five
  anchors remain — the test title "five anchored cases" becomes literally
  accurate again); replace the `>= 6` count floor with an exact pin —
  `toHaveLength(5)` and ids exactly `[1, 2, 3, 4, 5]` (the renumbering in
  §3.5 is contract, so the test asserts it; a floor would silently admit
  extra cases or gaps); version pin `0.7.0` → `0.8.0`.
- authoring-skills: drop the `'blog post'` anchor; replace the `'Lint my
  skill'` anchor with the new eval-3 anchor from §3.5 (three anchors
  total); title "four anchored cases" → "three"; exact pins
  `toHaveLength(3)` and ids exactly `[1, 2, 3]`; version pin `0.1.0` →
  `0.2.0`.
- authoring-skills, fixture guard: the weld test's parsed eval type gains
  `files`, and a targeted assertion pins the eval-3 fixture contract
  exactly — not merely "non-empty and exists" (which `["SKILL.md"]` or
  `["references/critique-rubric.md"]` would satisfy while violating the
  contract):
  - eval 3's `files` equals exactly
    `["evals/fixtures/draft-skill/SKILL.md"]`;
  - that fixture file exists, is non-empty, and parses as a draft skill
    (content pins: YAML frontmatter delimiters plus the planted-defect
    marker substrings from §3.5, asserted verbatim).
  This pin is load-bearing: deterministic validation accepts an omitted
  `files` field (`src/lib/harness/deterministic.ts` validates fixture
  paths only when declared), so only the weld test guards the fixture's
  presence, path, and critiqueable content.

Assertion forms end up strictly stronger than before (exact counts and id
sequences instead of floors + uniqueness; same shape checks, same anchor
mechanism, same exact-count trigger pins). Tests stay hermetic — no live
`claude` is spawned anywhere in this change.

## 4. Verification and closure

**Binary discipline for every step below:** all shakespii commands run
through the checkout entrypoint — `bun src/cli/index.ts <cmd> …` — never
the bare `shakespii` binary. `command -v shakespii` resolves to the
npm-installed global 0.3.1, which predates the routing-scoped trigger key
(its trigger stage hashes full content under the legacy `trigger`
keyspace), so it would re-buy the trigger matrices, fail step 6's replay
expectation, and verify the wrong code entirely.

Hermetic verification (AGENTS.md Verification Rules — all three, green at
every commit, not just at the end):

1. `bun test` (unpiped, full suite) — green with the updated pins.
2. `bun run typecheck` — clean.
3. `bun run check-pack` — tarball guard clean (the bundled skills ship in
   the tarball; the eval/fixture changes must not break the layout pins).
4. `bun src/cli/index.ts lint` on both bundled skills — exit 0, zero
   findings.

Live verification (harness safety per AGENTS.md: live sweeps run on a clean
tree; containment is convention, not a sandbox):

5. Precondition: `git status` clean (work committed) before any live run.
6. `bun src/cli/index.ts test <skill-dir> --run --triggers` on both
   bundled skills — expected:
   trigger stage fully cached replay (routing hash untouched — this run
   doubles as live confirmation of the routing-scoped trigger key), scenario
   stage re-buys ~16 LLM calls (5 + 3 evals × executor + grader), exit 0.
7. Post-run stray check: `git status` again, plus both doc roots (repo
   `docs/` and `~/.ai-pref-nsync/local-docs/ai-shakespii/`) inspected for
   files a live session may have written outside its workspace
   (mem-2026-07-10: live sessions have escaped confinement before).

Closure:

8. Install-gate resync of the two bundled live copies — both installed
   targets are occupied, and the installer refuses occupied targets without
   `--force`, so the commands are:
   `bun src/cli/index.ts install skills/using-shakespii --force` and
   `bun src/cli/index.ts install skills/authoring-skills --force` (rc=0
   each — the checkout's installer, so the gate and the installed copies
   reflect this change, not global 0.3.1), then a
   recursive diff of each installed copy against `skills/` — clean. An edit
   loop is not closed until this resync
   (mem-2026-07-12-calibration-loops-must-end-with-re-6af190).
9. Documentation mirror sync (dual-location rule): copy the edited
   `docs/HARNESS.md` to
   `~/.ai-pref-nsync/local-docs/ai-shakespii/knowledge-references/HARNESS.md`
   and this spec to
   `~/.ai-pref-nsync/local-docs/ai-shakespii/specs/`, verifying each with
   `cmp` after `cp`.
10. ai-cortex: update the adjudication-6 gotcha (its "until the tool
    changes" clause resolves to the permanent rule: scenario evals are
    skill-loaded capability tests; negatives live in triggers.json) and
    keep the Direction-B decision memory current with the §2 phase-review
    amendment.

## 5. Release — 0.3.2

Cut after §3–§4 land: the unreleased master work (routing-scoped trigger
cache key, TR03, deterministic-gate enforcement) plus this change (HARNESS.md
contract wording; bundled skill guidance, suites, and version bumps — the
skills ship in the npm tarball). Tag-driven publish per the M5c release
mechanics. No cache-epoch bump rides along.

## 6. Alternatives considered (recorded, not built)

- **A′ — neutralize the frame with a stage-scoped cache-key tag.** "Use it
  only if applicable" wording, plus a `frame:` tag segment in
  `runKey`/`benchKey` only (precedent: the `trigger:nd` tag swap shipped
  without a global epoch bump), preserving all trigger matrices. Rejected
  now: it mixes did-it-trigger into did-it-work (grading noise, duplicates
  the trigger stage's responsibility), requires a policy for scoring
  never-loaded runs, weakens bench delta semantics, and re-buys every
  scenario/bench cache. Recorded as the known cheap path if a future
  decision ever wants an unframed scenario mode.
- **C — per-eval frame mode field in evals.json.** Most flexibility, most
  machinery (schema versioning, grader/scoring split, guidance rewrite
  anyway) in service of an eval type the corpus no longer uses. Rejected —
  YAGNI.
- **Scenario-negative lint heuristic.** Parked as a backlog candidate (see
  adjudication 3).

## 7. Frozen-surface compliance

- `RUN_CACHE_VERSION = 2` and `HARNESS_SCHEMA_VERSION = 1` — untouched.
- using-shakespii `description` — byte-frozen wording untouched (body-only
  edits); the description-freeze test continues to pass unmodified.
- Test assertions — no weakenings; §3.7 pin updates are deliberate contract
  changes sanctioned by this spec.
- Live corpus governance — live copies change only through the install gate
  (§4 step 4); ~/Dev/ai-skills is untouched (no derived skill changes).

## 8. Out of scope

- Any change to `buildExecutorPrompt`, the runner, stages, keys, or schemas.
- Derived-skill suites in ~/Dev/ai-skills (already conforming).
- The parked lint-guard rule; the trigger transcript header collision and
  other RELEASE-M5C backlog items.
- M6 curated-library authoring (unblocked by, not part of, this change).
