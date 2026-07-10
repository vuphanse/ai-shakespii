# M5b — Writer-as-skill + carried M5a inputs (design)

Date: 2026-07-10. Status: approved for planning after user review.
Predecessor: docs/specs/2026-07-09-m5a-harness-hardening-design.md (M5a, shipped
166fcd7..246c054). Evidence base: docs/CALIBRATION-M5A.md adjudications 2, 6, 7;
.superpowers/sdd/progress.md M5a final-review minors.

## §0 Adjudications (user decisions, 2026-07-10 brainstorm)

1. **Scope: all five workstreams.** Writer skill, headless-aware eval design,
   description-optimization pass, memory-file hermeticity investigation, and the
   six M5a final-review minors are all in scope for M5b.
2. **ai-cortex promotion path: deferred post-dogfood.** The writer ships without
   memory→skill-draft promotion; the path is designed after the writer has been
   dogfooded on real authoring. This resolves the ROADMAP "Open decisions" row
   (was: writer-or-later).
3. **Writer form: separate skill, delegates CLI.** The writer is a new sibling
   skill that owns content craft and process; every CLI mechanic (lint loop,
   test, triggers, bench, init flags) is delegated to `using-shakespii` by
   reference. No duplicated CLI teaching. The rejected alternatives: extending
   using-shakespii (bloats a thin operational skill) and replacing its authoring
   branch (forces the writer to duplicate CLI teaching).
4. **Critique mechanism: rubric + harness-as-critic.** The critique step is a
   fresh-eyes pass against a rubric of unlintable qualities, then the harness is
   the objective pressure test — scenario evals + trigger evals executed
   headless are the mechanized fresh agent. No subagent pressure-testing (it
   duplicates what scenario evals measure, at extra cost, uncacheably).
5. **Name: `authoring-skills`** (user-adjudicated over `composing-skills` — the
   "combining skills" ambiguity — and `skill-writer` / `writing-agent-skills`).

## §1 Scope and non-goals

In scope: the `authoring-skills` skill; headless-aware eval rules plus the
rewording of using-shakespii's affected evals; using-shakespii description
re-scope + trigger-accuracy repair against the 0.80 un-primed baseline; a
gated hermeticity spike (adopt only on full control passes); the six M5a
minors; a calibration sweep (CALIBRATION-M5B.md) closing the milestone.

Non-goals (explicitly out):

- Install gate and npm publish (M5c).
- Personal-skill migration; `~/.claude/skills/` and the superpowers plugin
  cache stay **read-only** (M5d). In-repo `skills/` stays writable.
- ai-cortex promotion path (deferred post-dogfood, §0.2).
- Bench pipeline changes; no bench runs are part of M5b calibration.
- Hermeticity beyond the §5 spike outcome: if the spike is not green, the
  runner is untouched and the finding is documented, not fixed.

## §2 `authoring-skills` (skills/authoring-skills/, v0.1.0)

A process skill teaching an agent to author a new Agent Skill with the human
in the loop, on top of the shakespii toolchain. Standard SKILL.md format,
anatomy contract sections (Intent / Inputs / Preconditions / Procedure /
Output / Examples / Anti-patterns), recursive dogfood: it lints clean, ships
`evals/evals.json` and `evals/triggers.json`, and passes `test --run
--triggers` at calibration.

### §2.1 Files

- `SKILL.md` — the five-phase loop (§2.2).
- `README.md` — one-paragraph human orientation (init-scaffold convention).
- `references/critique-rubric.md` — the unlintable-qualities rubric (§2.3).
- `references/headless-eval-rules.md` — the eval-authoring rules (§3.1).
- `evals/evals.json` — ≥3 cases, one a near-miss negative, all headless-safe
  per §3.1.
- `evals/triggers.json` — ≥16 labeled queries incl. near-miss negatives,
  adversarial against using-shakespii (§2.4).

### §2.2 The five-phase loop (Procedure)

1. **Interview.** One question at a time, multiple-choice preferred, until
   every anatomy section has raw material: intent (what problem, for whom),
   trigger situations (the raw material for description + triggers.json),
   inputs and preconditions, the procedure's real steps, at least one real
   worked example (real input, real output — not synthetic), and known
   failure modes (raw material for Anti-patterns). The interview ends when
   the agent can state name, purpose, and triggers back and the human
   confirms them.
2. **Draft.** `shakespii init <name>` in the agreed parent directory, then
   fill every scaffold section applying the craft rules lint cannot check:
   freedom calibration (prescribe exactly where deviation breaks things,
   leave open where judgment beats prescription), progressive disclosure
   (SKILL.md stays lean; depth goes to `references/`), examples transcribed
   from the interview's real case, description written trigger-first.
3. **Critique.** A fresh-eyes pass against `references/critique-rubric.md`,
   fixing what it catches; then delegate to using-shakespii's fix loop
   (`lint --json` → remediation reference → re-lint until exit 0, warnings
   handled explicitly). The rubric governs content quality; the CLI governs
   contract compliance.
4. **Refine.** Author `evals/evals.json` and `evals/triggers.json` per the
   headless rules (§3.1); gate on `shakespii test <dir> --run --triggers`
   (token spend confirmed with the human first). On trigger misses, iterate
   the description wording and re-run with `--fresh`; stop when accuracy
   holds ≥ 0.8 without regressing passing queries.
5. **Present.** Hand the human the skill, its lint output, and its eval and
   trigger results. Never install — installation is a separate, explicitly
   approved act (and the M5c gate's job).

### §2.3 Critique rubric (references/critique-rubric.md)

Checkable-by-reading qualities that no lint rule covers, harvested from the
validated parts of the reference-skill critique (docs/REFERENCE-SKILL-CRITIQUE.md
— evidence source, not authority):

- Freedom calibration: each Procedure step is exactly as prescriptive as its
  fragility demands; no step prescribes what judgment should decide, none
  leaves open what must be exact.
- Executable procedure: a reader could follow the steps without asking a
  question the skill doesn't answer.
- Real examples: the Examples section shows a genuine input→output pair, not
  a placeholder-shaped invention.
- Progressive disclosure: SKILL.md carries the loop; reference depth lives in
  `references/` and is linked at point of use.
- Trigger-first description that names the situations from the interview, not
  the skill's implementation.
- Anti-patterns derived from real failure modes named in the interview.
- Headless-safe evals (delegates to references/headless-eval-rules.md).

### §2.4 Trigger boundary vs using-shakespii

The current using-shakespii description opens "Use when creating a new agent
skill or auditing…" — with authoring-skills in the corpus that guarantees
dual-fire on creation intents. Boundary policy:

- **authoring-skills owns creation intent**: "write/create/design a (new)
  skill for X", idea-to-skill requests, "turn this workflow into a skill".
- **using-shakespii owns CLI-operation intent**: lint/audit/validate/test/
  benchmark/fix requests, and remains the CLI-mechanics delegate the writer
  references.
- Adversarial trigger sets: authoring-skills' near-miss negatives include
  using-shakespii core intents ("Lint the skill I just wrote and fix the
  findings"); using-shakespii's near-miss negatives gain a pure creation
  intent ("Write a new skill that teaches agents to review Dockerfiles")
  (§4.2).
- Measurement limitation, stated honestly: the trigger stage mounts only the
  target skill, so true dual-fire cannot be measured directly; adversarial
  negatives on both sides approximate it, and the contamination scanner
  (M5a) flags any non-target invocation it can see.
- XS02 check: `shakespii lint skills/ --corpus` at calibration must not flag
  the pair at the 0.65 threshold — the delegation design (no duplicated CLI
  teaching) is what keeps content similarity low.

Description starting candidate (final wording is a §4 calibration output):

> Use when the user asks to create, write, or design a new agent skill from
> an idea, requirement, or repeated workflow — runs an interview → draft →
> critique → refine loop on the shakespii toolchain, producing a skill that
> lints clean and passes its scenario and trigger evals.

## §3 Headless-aware eval design

### §3.1 Rules (references/headless-eval-rules.md, authoritative list)

Evidence: CALIBRATION-M5A adjudication 7 — scenario executors run single-turn
and headless; an eval that expects interactive back-and-forth stalls at the
question and fails its grading.

1. Every expectation must be observable in a single-turn headless transcript
   (tool calls made, files written, final message content).
2. The prompt carries every input the procedure would elicit from the human;
   if the skill says "confirm X with the human", the eval prompt pre-supplies
   X and states that approval is granted.
3. No expectation may require asking or waiting: reword "asks approval before
   Y" to the observable form — "does not do Y" plus, where applicable,
   "presents Y for approval in its final message".
4. Token-spend confirmations are pre-granted in the prompt for any eval whose
   procedure requires them.
5. A near-miss negative case stays mandatory (unchanged from the existing
   authoring guidance).

### §3.2 using-shakespii rewording (sanctioned re-pins, enumerated)

The affected set is exactly the adjudication-7 failure classes (evals 1, 2,
6). `expected_output` prose is adjusted only where an expectation changes.
These are the only eval-content edits sanctioned by this spec:

- **Eval 1 prompt**: append " Apply the fixes directly — you have my
  approval; don't pause to ask."
  Expectations unchanged (all four are transcript-observable).
- **Eval 2 prompt**: replace with "Create a new skill that teaches agents to
  review Dockerfiles. Use the name dockerfile-review; its purpose is catching
  common Dockerfile mistakes; it should trigger when the user asks for a
  Dockerfile review or audit. You have my approval to scaffold — proceed
  without further questions."
  Expectation "Confirms kebab-case name, purpose, and trigger situations
  before scaffolding" → "Adopts the supplied name, purpose, and trigger
  situations without stalling to re-confirm them".
  Expectation "Presents the skill with clean lint output and asks approval
  before any install" → "Presents the skill with clean lint output and does
  not install it anywhere".
- **Eval 6 prompt**: append " You have my approval for the token spend of
  --run."
  Expectation "Confirms with the human before the first token-spending
  --run" → "Proceeds with --run under the prompt's explicit token approval
  without stalling for further confirmation".

Evals 3, 4, 5 are untouched. The reworded evals change content hashes, so
their calibration runs are cache misses by design.

### §3.3 Skill-body guidance

using-shakespii's Procedure lines that mandate confirming with the human
("confirm with the human before the first run on a suite", authoring step 5)
gain the qualifier "when a human is present to answer; in a non-interactive
run, an explicit approval already given in the task prompt satisfies this".
One sentence per site, no new sections. authoring-skills carries the same
convention from birth (its Procedure phrases every confirmation as
"confirmed with the human, or pre-granted in the task prompt").

## §4 Description-optimization pass (using-shakespii → v0.6.0)

Baseline: 0.80 un-primed trigger accuracy (CALIBRATION-M5A adjudication 6);
all four failures are under-firing positives, zero negatives over-fire.
Failed queries (0-indexed in evals/triggers.json): q1 "Run shakespii lint on
./skills/pdf-tools and explain the findings" (0/3), q3 "Scaffold a skill for
summarizing meeting notes and make it pass lint" (1/3), q4 "Audit all my
installed skills for duplication" (0/3), q8 "Validate the frontmatter of
SKILL.md in ./skills/note-taker" (0/3).

### §4.1 Description re-scope (boundary, §2.4) + under-fire repair

One rewrite serves both: creation intent moves out, and the vocabulary of the
under-firing queries moves in (lint, audit, validate, frontmatter, evals,
trigger accuracy, benchmark, fix findings). Starting candidate (final wording
is the measured loop's output, not this spec's):

> Use when linting, auditing, testing, or benchmarking an agent skill — or
> scaffolding one with the shakespii CLI — validates standard SKILL.md
> skills (frontmatter, structure, evals, trigger accuracy) and fixes
> findings until clean, driving shakespii (init, lint --json, test --run,
> bench).

Loop protocol: edit description → `shakespii test skills/using-shakespii
--run --triggers --fresh` → hold accuracy ≥ 0.8 with **no regressions on
currently-passing queries**; target is all positives at majority, but the
gate is the 0.8 threshold plus no-regression. TRIGGER_* constants are frozen
(§7); only wording changes.

### §4.2 triggers.json label re-pins (sanctioned, enumerated)

- q2 "Create a new skill called changelog-writer": **flips to
  `should_trigger: false`** — pure creation intent now routes to
  authoring-skills. It simultaneously seeds authoring-skills' positive set.
- q3 "Scaffold a skill for summarizing meeting notes and make it pass lint":
  **stays positive** — mixed intent with explicit lint-loop operation;
  the description repair targets its under-fire.
- No other label changes. Query count stays ≥ 16 with negatives present
  (the q2 flip adds a negative; the set keeps 20 queries).

authoring-skills' triggers.json is authored fresh under §2.4's adversarial
policy; its accuracy gate is the same ≥ 0.8.

## §5 Memory-file hermeticity spike (gated, adopt-only-on-green)

Problem (CALIBRATION-M5A adjudication 2): `--setting-sources project,local`
excludes user skills and plugins but NOT `~/.claude/CLAUDE.md`; the user
memory file perturbs scenario behavior and adds first-action noise.

### §5.1 Candidates, tested in order, stop at first green

1. `CLAUDE_CONFIG_DIR` pointed at a scratch config dir (credentials
   preserved or symlinked as required) combined with the existing
   `--setting-sources project,local` argv.
2. Explicit `--settings <file>` behavior with respect to memory loading.
3. CLI surface scan: any current `claude` flag or setting that scopes memory
   sources (`claude --help`, settings schema) — adopt the supported switch
   if one exists.

### §5.2 Controls (all must pass; any failure ⇒ candidate rejected)

- **Negative control**: a canary line temporarily appended to
  `~/.claude/CLAUDE.md` (file backed up first, byte-restored after — this is
  the one sanctioned write near the read-only corpus, it touches only the
  memory file, never `~/.claude/skills/`) must NOT be observable in the
  candidate session: the init event's memory-path listing excludes the user
  memory file AND the canary instruction produces no behavioral echo.
- **Positive control (paired, M5a spike rule)**: an unmodified-argv session
  run in the same pass MUST show the canary/memory path — proving the probe
  detects what it claims to exclude.
- **Mount control**: the staged project skill still loads (init event
  `skills` includes the mount).
- **Auth control**: the session completes authenticated (OAuth survives the
  config-dir/flag change).

### §5.3 Outcomes

- **Green**: implement in `claude-runner.ts` (env or argv, uniformly across
  scenario/trigger/bench/grader sessions, mirroring M5a's uniform-argv rule),
  bump `RUN_CACHE_VERSION` 2 → 3 (comparability epoch rule: any change to
  session environment invalidates cross-version comparisons), TDD the runner
  change with injected fakes, and record the evidence.
- **Not green**: no runner change, no epoch bump; the evidence and the
  rejection reasons are recorded and the ROADMAP carries the finding forward.
- Either way the deliverable is `docs/HERMETICITY.md` (knowledge reference,
  dual-location) with verbatim probe evidence, plus a summary line in
  CALIBRATION-M5B.md.

## §6 Six M5a final-review minors (one hygiene task)

Source: M5a final review (progress ledger). TDD where behavior is testable.

1. **settleWithGrace outer-bound timer leak**: the `Bun.sleep(outerBoundMs)`
   race arm stays ref'd after early settle (today neutralized by CLI
   process.exit / bun test force-exit; real for library embedders). Fix:
   cancellable timer cleared when the sequence settles first. Existing settle
   tests pin behavior; add a fast-settle assertion that the early path
   resolves without waiting on the bound.
2. **readPersistedEvents uncaught readFileSync**: unreadable or
   directory-shaped `events.jsonl` currently throws out of the retro-scan
   path. Fix: catch → return the no-events result. Test: fixture with
   `events.jsonl` as a directory.
3. **Two-blocks-count gap**: add the missing contamination test — two Skill
   invocations of the same non-target skill in one assistant message count 2.
4. **Replay-test order coupling**: cached-replay tests currently depend on a
   prior test populating the cache; each populates its own temp cacheRoot.
5. **ROADMAP commit-range self-reference**: the M5a section's "Commit range:
   166fcd7..6079505" predates the docs commits; reword so the range does not
   understate the milestone (name the full range or drop the tail hash).
6. **M5a spec §6.2 no-reply wording**: docs-only clarification of the grader
   no-reply path in the M5a spec (both locations).

## §7 Frozen surfaces (unchanged from M5a unless stated)

- Lint CLI surface and lint JSON v1; flagless `test` output byte-identical;
  `benchmark.json` schema and `bench --json` stdout byte-purity; grading
  contract; trigger report key orders; `HARNESS_SCHEMA_VERSION = 1`.
- `TRIGGER_REPS = 3`, `TRIGGER_PASS_THRESHOLD = 0.5`,
  `TRIGGER_ACCURACY_THRESHOLD = 0.8`, `BENCH_DEFAULT_RUNS = 3`.
- `RUN_CACHE_VERSION` moves 2 → 3 **only** via §5.3 green adoption; otherwise
  it stays 2.
- Never weaken an assertion. Sanctioned re-pins in this spec: §3.2 (eval
  rewordings), §3.3 (procedure qualifiers), §4.1 (description), §4.2 (q2
  label flip), the using-shakespii version bump to 0.6.0, and any test
  literal that pins those exact strings. Nothing else.
- TDD: unpiped `bun test` and `bun run typecheck` green at every commit; no
  test spawns real claude; every cache-touching test uses a temp cacheRoot.
- Dogfood corpus `~/.claude/skills/` + superpowers plugin cache read-only
  (§5.2's memory-file canary is the sole, byte-restored exception, and it
  does not touch the skills directory).
- Never point `--run`/`--triggers`/`bench` at untrusted third-party skills.

## §8 Testing strategy

- Code changes (§6 minors 1–4, §5 runner change if adopted): fixture-first
  TDD against injected fakes, zero live sessions in the suite.
- Skill content (authoring-skills, using-shakespii edits): gated by
  `shakespii lint` exit 0 (single-skill and `--corpus` over `skills/`), then
  by the live harness at calibration (§9). Static schema validity of the new
  evals/triggers files is covered by the existing deterministic stage — no
  new test code needed for content.
- Docs-only changes (§6 minors 5–6): cmp-verified dual-location, no tests.

## §9 Execution order and calibration

Order (rationale: hermeticity outcome must precede live runs so every M5b
measurement shares one environment and one cache epoch):

1. §6 minors (code hygiene first, clean base).
2. §5 hermeticity spike (controller-executed live) → adopt or defer; runner
   change + epoch bump land here if green.
3. §3 using-shakespii rewording + §3.3 qualifiers + §4 description re-scope +
   q2 label flip (static edits, lint clean, version 0.6.0).
4. §2 authoring-skills authored complete (static content, lint clean incl.
   corpus pass over `skills/`).
5. Calibration sweep — predictions committed pre-sweep, then live:
   - using-shakespii: `test --run --triggers --fresh` — scenario suite exit 0
     (reworded evals pass), trigger accuracy ≥ 0.8 held via the §4.1 loop
     with no regressions.
   - authoring-skills: `test --run --triggers` — scenario suite exit 0,
     trigger accuracy ≥ 0.8 via the writer's own refine loop (§2.2.4),
     description iterations allowed and recorded.
   - Zero contamination warnings expected; any warning is adjudicated in the
     doc, not silenced.
   - Cache proof (replay byte-identity) re-run only if the epoch bumped.
   - Verbatim actuals + predictions-vs-actuals table + adjudications in
     `docs/CALIBRATION-M5B.md`.
6. Docs closeout (§10) + ROADMAP + memory records.

Live-run rule from M5a stands: sweeps run detached with exit-code capture;
actuals recorded verbatim; rewordings discovered mid-sweep are recorded,
never applied in-phase (the §3.2/§4 edits are pre-sweep, spec-mandated).

## §10 Documentation

Dual-location (canonical `~/.ai-pref-nsync/local-docs/ai-shakespii/`, repo
`docs/` mirror, cp + cmp verified):

- This spec → `specs/`.
- `docs/CALIBRATION-M5B.md` → `knowledge-references/`.
- `docs/HERMETICITY.md` (spike evidence, either outcome) →
  `knowledge-references/`.
- ROADMAP: M5b checkboxes with commit ranges; Open-decisions row for the
  promotion path updated to "deferred post-dogfood (2026-07-10)"; M5c/M5d
  untouched.
- README: authoring-skills added to the skills inventory; the M5a
  memory-file caveat updated to reflect the §5 outcome.
- using-shakespii `version: 0.6.0`; authoring-skills `version: 0.1.0`.
- HARNESS.md: only if §5 adopts (runner env/argv + epoch section), kept
  honest to shipped behavior.
