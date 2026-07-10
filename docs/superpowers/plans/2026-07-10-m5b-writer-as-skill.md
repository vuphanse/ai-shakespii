# M5b — Writer-as-skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `authoring-skills` writer skill plus the four carried M5a inputs (headless-aware evals, description re-scope against the 0.80 trigger baseline, a gated memory-file hermeticity spike, six review minors), closing milestone M5b per docs/specs/2026-07-10-m5b-writer-as-skill-design.md.

**Architecture:** The writer is a process skill (interview → draft → critique → refine → present) that delegates every CLI mechanic to using-shakespii; the harness is its objective critic. Code changes are confined to the six hygiene minors and one conditional runner change gated by a live hermeticity spike. Everything live (spike, calibration) is controller-executed; everything static ships as verbatim content in this plan.

**Tech Stack:** Bun + TypeScript, bun:test, the shakespii CLI itself (recursive dogfood), claude CLI headless sessions (controller-run tasks only).

## Global Constraints

Copied from the spec (§7) and the shipped M5a contracts. Every task's requirements implicitly include this section.

- Runner argv (M5a contract, baseline for every session): `claude -p <prompt> --output-format stream-json --verbose --dangerously-skip-permissions --model <model> --setting-sources project,local` plus `--include-partial-messages` iff detect mode. Task 4 may EXTEND the environment (never the argv order) and only if Task 3's verdict is GREEN.
- Frozen surfaces: lint CLI surface and lint JSON `version: 1`; flagless `test` output byte-identical; `benchmark.json` schema and `bench --json` stdout byte-purity (warnings → stderr); grading contract; trigger report key orders; `HARNESS_SCHEMA_VERSION = 1`.
- Frozen constants: `TRIGGER_REPS = 3`, `TRIGGER_PASS_THRESHOLD = 0.5`, `TRIGGER_ACCURACY_THRESHOLD = 0.8`, `BENCH_DEFAULT_RUNS = 3`, `DRAIN_GRACE_MS = 2000`, `SETTLE_OUTER_BOUND_MS = 10_000`, `RUN_TIMEOUT_MS = 300_000`.
- `RUN_CACHE_VERSION` moves 2 → 3 ONLY in Task 4, and Task 4 runs only on a GREEN Task 3 verdict. Otherwise it stays 2 and no key formula changes.
- Never weaken an assertion. Sanctioned re-pins, exhaustively: the Task 5 eval rewordings (spec §3.2), the Task 5 procedure qualifiers (spec §3.3), the Task 5 description rewrite (spec §4.1), the q2 label flip (spec §4.2), the using-shakespii version bump to 0.6.0, the tests/skill/using-shakespii.test.ts literals that pin those exact strings/counts (11/9 split, `version: 0.6.0`, test titles), and — Task 4 only, if dispatched — the run-dir key-formula literals moving `"2\n"` → `"3\n"`. Nothing else.
- TDD: unpiped `bun test` and `bun run typecheck` green at every commit. No test spawns the real `claude` binary. Every cache-touching test uses a temp cacheRoot (`mkdtempSync`).
- Dogfood corpus `~/.claude/skills/` and the superpowers plugin cache are READ-ONLY. Task 3's byte-restored canary edit to `~/.claude/CLAUDE.md` is the single sanctioned exception (spec §5.2); it never touches `~/.claude/skills/`. In-repo `skills/` is writable.
- Never point `--run`/`--triggers`/`bench` at untrusted third-party skills (`--dangerously-skip-permissions` is in the runner argv). Both skills under test here are first-party repo content.
- Docs are dual-location: canonical `~/.ai-pref-nsync/local-docs/ai-shakespii/` (subdirs `specs/`, `plans/`, `knowledge-references/`), repo `docs/` is the mirror; every doc task ends with `cp` + `cmp` verification.
- Commit messages, code, code comments, and all committed docs use normal prose (never caveman style).

## Model allocation

| Task | Executor | Model |
| --- | --- | --- |
| 1. Harness hygiene minors | subagent | haiku (verbatim code, transcription + tests) |
| 2. Docs minors | subagent | haiku |
| 3. Hermeticity spike | CONTROLLER (live claude sessions, user env) | — |
| 4. Hermetic runner + epoch 3 (conditional) | subagent | sonnet (integration, mechanism substitution) |
| 5. using-shakespii v0.6.0 | subagent | haiku (exact texts given) |
| 6. authoring-skills v0.1.0 | subagent | haiku (verbatim content given; mechanical lint loop) |
| 7. Calibration predictions | CONTROLLER | — |
| 8. Calibration sweep | CONTROLLER (live, detached sweeps) | — |
| 9. Docs closeout | subagent | sonnet (doc-code consistency judgment) |

Reviewer tier ≥ implementer tier, always; final whole-branch review on the strongest available model.

---

### Task 1: Harness hygiene minors (M5a final-review backlog, spec §6.1–6.4)

**Files:**
- Modify: `src/lib/harness/claude-runner.ts:48-80` (settleWithGrace)
- Modify: `src/lib/harness/contamination.ts:40-54` (readPersistedEvents)
- Test: `tests/harness/claude-runner.test.ts`
- Test: `tests/harness/contamination.test.ts`
- Test: `tests/harness/llm-stages.test.ts:166-186`
- Test: `tests/harness/trigger-stage.test.ts:185-206`

**Interfaces:**
- Consumes: existing exports `settleWithGrace`, `readPersistedEvents`, `scanContamination` (signatures unchanged).
- Produces: identical public API; behavior deltas are (a) outer-bound timer cleared on settle, (b) unreadable `events.jsonl` yields `[]` instead of throwing.

- [ ] **Step 1: Write the failing timer-clear test**

Append to `tests/harness/claude-runner.test.ts` next to the existing settleWithGrace tests (after the `outer bound — hung work + hung cancel returns fallback` test):

```ts
test('settleWithGrace: outer-bound timer is cleared once the sequence settles', async () => {
  const cleared: unknown[] = []
  const origClear = globalThis.clearTimeout
  globalThis.clearTimeout = ((handle: Parameters<typeof clearTimeout>[0]) => {
    cleared.push(handle)
    return origClear(handle)
  }) as typeof clearTimeout
  try {
    const reader = { cancel: async () => {} }
    await settleWithGrace(Promise.resolve('ok'), reader, 'fallback', 5, 60_000)
  } finally {
    globalThis.clearTimeout = origClear
  }
  expect(cleared.length).toBe(1)
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test tests/harness/claude-runner.test.ts`
Expected: the new test FAILS with `expect(cleared.length).toBe(1)` receiving `0` — the current implementation uses `Bun.sleep`, which never calls `clearTimeout`. The three existing settle tests stay green.

- [ ] **Step 3: Implement the cancellable outer bound**

Replace the whole `settleWithGrace` function in `src/lib/harness/claude-runner.ts` (keep the doc comment above it unchanged) with:

```ts
export async function settleWithGrace<T>(
  work: Promise<T>,
  reader: { cancel(): Promise<void> },
  fallback: T,
  graceMs = DRAIN_GRACE_MS,
  outerBoundMs = SETTLE_OUTER_BOUND_MS,
): Promise<T> {
  const sequence = async (): Promise<T> => {
    let settled = false
    work.then(
      () => {
        settled = true
      },
      () => {
        settled = true
      },
    )
    await Promise.race([work.then(() => {}, () => {}), Bun.sleep(graceMs)])
    if (!settled) {
      try {
        await reader.cancel()
      } catch {
        // reader may already be closed
      }
    }
    try {
      return await work
    } catch {
      return fallback
    }
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  const bound = new Promise<T>(resolve => {
    timer = setTimeout(() => resolve(fallback), outerBoundMs)
  })
  try {
    return await Promise.race([sequence(), bound])
  } finally {
    clearTimeout(timer)
  }
}
```

The `sequence` body is byte-identical to today; only the outer race changes — `Bun.sleep` becomes a `setTimeout` whose handle is cleared in `finally`, so an early settle no longer leaves a ref'd 10 s timer (real for library embedders; the CLI's `process.exit` masked it).

- [ ] **Step 4: Run the settle tests to verify all pass**

Run: `bun test tests/harness/claude-runner.test.ts`
Expected: PASS, including the three pre-existing settleWithGrace tests (settled-inside-bound, grace path, outer-bound fallback) and the new timer-clear test.

- [ ] **Step 5: Write the failing tolerant-reader test**

In `tests/harness/contamination.test.ts`, extend the fs import to `import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'` and append:

```ts
test('readPersistedEvents: unreadable events.jsonl (a directory) yields [] instead of throwing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-contamination-'))
  mkdirSync(join(dir, 'events.jsonl'))
  expect(readPersistedEvents(dir)).toEqual([])
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `bun test tests/harness/contamination.test.ts`
Expected: the new test FAILS — `readFileSync` on a directory throws `EISDIR` out of `readPersistedEvents`.

- [ ] **Step 7: Implement the tolerant read**

In `src/lib/harness/contamination.ts`, replace the body of `readPersistedEvents` with:

```ts
export function readPersistedEvents(dir: string): unknown[] {
  const p = join(dir, 'events.jsonl')
  if (!existsSync(p)) return []
  let raw: string
  try {
    raw = readFileSync(p, 'utf8')
  } catch {
    // unreadable events.jsonl (permissions, directory-shaped): nothing to scan
    return []
  }
  const events: unknown[] = []
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t) continue
    try {
      events.push(JSON.parse(t))
    } catch {
      // tolerant reader: non-JSON lines are skipped
    }
  }
  return events
}
```

- [ ] **Step 8: Add the two-blocks-count test (covers an existing behavior — expected to pass immediately)**

Append to `tests/harness/contamination.test.ts`:

```ts
test('two Skill blocks in one assistant message count 2', () => {
  const event = {
    type: 'assistant',
    message: {
      content: [
        { type: 'tool_use', name: 'Skill', input: { skill: 'compress' } },
        { type: 'tool_use', name: 'Skill', input: { skill: 'compress' } },
      ],
    },
  }
  expect(scanContamination([event], [])).toEqual([{ skill: 'compress', count: 2 }])
})
```

Run: `bun test tests/harness/contamination.test.ts`
Expected: PASS (this pins per-block counting that `scanContamination` already implements; it closes the M5a review's coverage gap, so no RED phase exists for it).

- [ ] **Step 9: Decouple the scenario contamination replay test**

In `tests/harness/llm-stages.test.ts`, delete the module-level shared fixture (lines 166–168):

```ts
// Shared skill + cacheRoot across the next two tests: the second test asserts that a
// cached replay recomputes contamination from the events.jsonl this test persists.
const contamFixture = freshSkillAndCache()
```

and replace the two tests that used it with self-contained versions:

```ts
test('scenario contamination: warn finding with contractual message, status stays pass', async () => {
  const { skill, cacheRoot } = freshSkillAndCache()
  const runner = fakeRunner([contaminatedExecutor(), graderOkAllPass()])
  const { scenario, grading } = await runLlmStages(skill, opts(runner, cacheRoot))
  expect(scenario.status).toBe('pass')
  expect(grading.status).toBe('pass')
  const warns = scenario.findings.filter(f => f.severity === 'warn')
  expect(warns).toEqual([
    { severity: 'warn', message: 'contamination: session invoked non-target skill "compress" (1 invocation(s)) [eval 1]', file: 'evals/evals.json', line: null },
  ])
})

test('scenario contamination recomputes from persisted events.jsonl on cached replay', async () => {
  const { skill, cacheRoot } = freshSkillAndCache()
  await runLlmStages(skill, opts(fakeRunner([contaminatedExecutor(), graderOkAllPass()]), cacheRoot))
  const replayRunner = fakeRunner([])
  const { scenario } = await runLlmStages(skill, opts(replayRunner, cacheRoot))
  expect(replayRunner.requests).toHaveLength(0)
  expect(scenario.runs[0].cached).toBe(true)
  expect(scenario.findings.some(f => f.message.startsWith('contamination:'))).toBe(true)
})
```

Every assertion the old pair carried survives; the replay test now populates its own cache and additionally pins zero replay runner calls (a strengthening — `fakeRunner([])` previously enforced this only by throwing).

- [ ] **Step 10: Decouple the trigger contamination replay test**

In `tests/harness/trigger-stage.test.ts`, delete the module-level shared fixture (lines 185–187):

```ts
// Shared skill + cacheRoot across the next two tests: the second test asserts that a
// cached replay recomputes contamination from the events.jsonl this test persists.
const contamFixture = makeSkill(queries([{ t: true }]))
```

and replace the two tests that used it with:

```ts
test('trigger contamination: warn finding with query/rep context, stage still passes', async () => {
  const { skill, cacheRoot } = makeSkill(queries([{ t: true }]))
  const contaminatedDetected = detected(true, {
    events: [{ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'compress' } }] } }],
  })
  const runner = fakeRunner([contaminatedDetected, detected(true), detected(true)])
  const report = await runTriggerStage(skill, opts(runner, cacheRoot))
  expect(report.status).toBe('pass')
  expect(report.queries).toEqual({ passed: 1, total: 1 })
  expect(report.findings).toEqual([
    { severity: 'warn', message: 'contamination: session invoked non-target skill "compress" (1 invocation(s)) [query 0 rep 1]', file: 'evals/triggers.json', line: null },
  ])
})

test('trigger contamination recomputes from disk on cached reps (empty-script runner)', async () => {
  const { skill, cacheRoot } = makeSkill(queries([{ t: true }]))
  const contaminatedDetected = detected(true, {
    events: [{ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'compress' } }] } }],
  })
  await runTriggerStage(skill, opts(fakeRunner([contaminatedDetected, detected(true), detected(true)]), cacheRoot))
  const replay = await runTriggerStage(skill, opts(fakeRunner([]), cacheRoot))
  expect(replay.runs[0].cached).toBe(TRIGGER_REPS)
  expect(replay.findings.filter(f => f.severity === 'warn')).toHaveLength(1)
})
```

- [ ] **Step 11: Run the full gates**

Run: `bun test`
Expected: PASS, 0 fail (count grows by the new tests).
Run: `bun run typecheck`
Expected: exit 0.

- [ ] **Step 12: Commit**

```bash
git add src/lib/harness/claude-runner.ts src/lib/harness/contamination.ts tests/harness/claude-runner.test.ts tests/harness/contamination.test.ts tests/harness/llm-stages.test.ts tests/harness/trigger-stage.test.ts
git commit -m "fix(harness): M5a review minors — cancellable settle bound, tolerant event reader, decoupled replay tests, two-block count pin"
```

---

### Task 2: Docs minors (spec §6.5–6.6)

**Files:**
- Modify: `docs/ROADMAP.md:81`
- Modify: `docs/specs/2026-07-09-m5a-harness-hardening-design.md` (§6.2)
- Modify: `~/.ai-pref-nsync/local-docs/ai-shakespii/specs/2026-07-09-m5a-harness-hardening-design.md` (same edit, canonical)

**Interfaces:**
- Consumes / Produces: none (docs only).

- [ ] **Step 1: Fix the M5a commit range**

In `docs/ROADMAP.md`, replace the line

```
Commit range: 166fcd7..6079505.
```

with

```
Commit range: 166fcd7..246c054.
```

(The old tail predates the M5a docs-closeout commits; `246c054` is the milestone's true last commit and already exists, so the line no longer understates the range and cannot self-reference.)

- [ ] **Step 2: Clarify the §6.2 no-reply wording (both spec copies)**

In `docs/specs/2026-07-09-m5a-harness-hardening-design.md`, section "### 6.2 Failed-reply persistence", append this sentence to the end of the paragraph (after "Observability only — no behavior change."):

```
An attempt that produces no reply at all (a runner-level failure) writes no fail file — persistence applies only to attempts that returned a reply which then failed extraction or gating.
```

Apply the identical edit to the canonical copy at `~/.ai-pref-nsync/local-docs/ai-shakespii/specs/2026-07-09-m5a-harness-hardening-design.md`, then verify:

Run: `cmp docs/specs/2026-07-09-m5a-harness-hardening-design.md ~/.ai-pref-nsync/local-docs/ai-shakespii/specs/2026-07-09-m5a-harness-hardening-design.md && echo MIRROR-OK`
Expected: `MIRROR-OK`

- [ ] **Step 3: Gates and commit**

Run: `bun test` → PASS; `bun run typecheck` → exit 0 (nothing should have changed; this pins that).

```bash
git add docs/ROADMAP.md docs/specs/2026-07-09-m5a-harness-hardening-design.md
git commit -m "docs(m5a): close the commit range at 246c054; clarify grader fail-file no-reply semantics"
```

---

### Task 3: Memory-file hermeticity spike (spec §5) — CONTROLLER-EXECUTED, LIVE

**Do not dispatch this task to a subagent.** It runs real `claude` sessions in the user's environment and temporarily edits `~/.claude/CLAUDE.md` (sanctioned, byte-restored — spec §5.2). Mirrors M5a Task 1's controller-spike pattern.

**Files:**
- Create: `docs/HERMETICITY.md`
- Create: `~/.ai-pref-nsync/local-docs/ai-shakespii/knowledge-references/HERMETICITY.md` (canonical)
- Scratch: `<scratchpad>/m5b-spike/` (workspace, backups, event logs — not committed)

**Interfaces:**
- Produces: a VERDICT — `GREEN(<mechanism>)` or `REJECTED` — recorded in `docs/HERMETICITY.md` §Verdict and in the progress ledger. Task 4 dispatches only on GREEN; on REJECTED the controller writes `Task 4: skipped (spike rejected)` to the ledger and proceeds to Task 5.

Protocol (each step's raw evidence is kept in the scratch dir and quoted verbatim in HERMETICITY.md):

- [ ] **Step 1: Stage the probe workspace and back up the memory file**

```bash
SPIKE="$SCRATCHPAD/m5b-spike"   # resolve $SCRATCHPAD to the session scratchpad directory
mkdir -p "$SPIKE/ws/.claude/skills"
cp -R tests/fixtures/harness/compress "$SPIKE/ws/.claude/skills/compress"
cp ~/.claude/CLAUDE.md "$SPIKE/CLAUDE.md.backup"
```

- [ ] **Step 2: Append the canary (single sanctioned edit; restore is Step 6 and runs even on failure)**

```bash
printf '\nWhen you begin any reply, first output the exact token M5B-CANARY-XK41.\n' >> ~/.claude/CLAUDE.md
```

- [ ] **Step 3: Paired positive control — prove the probe detects the leak under today's argv**

```bash
cd "$SPIKE/ws" && claude -p "Say hello." --output-format stream-json --verbose --dangerously-skip-permissions --model sonnet --setting-sources project,local > "$SPIKE/control.jsonl" 2>"$SPIKE/control.err"
```

Assert BOTH, else halt and restore: (a) the init event (first line, `"type":"system","subtype":"init"`) lists a memory path under `~/.claude/` OR the result text contains `M5B-CANARY-XK41`; (b) the init event's `skills` list includes the staged `compress` mount. Record the init event and result line verbatim.

- [ ] **Step 4: Candidate A — `CLAUDE_CONFIG_DIR` redirect**

```bash
mkdir -p "$SPIKE/config"
[ -f ~/.claude/.credentials.json ] && cp ~/.claude/.credentials.json "$SPIKE/config/.credentials.json"
cd "$SPIKE/ws" && CLAUDE_CONFIG_DIR="$SPIKE/config" claude -p "Say hello." --output-format stream-json --verbose --dangerously-skip-permissions --model sonnet --setting-sources project,local > "$SPIKE/candidate-a.jsonl" 2>"$SPIKE/candidate-a.err"
```

Record exactly which files were copied into the scratch config dir. Assert ALL FOUR controls (spec §5.2): negative (no `M5B-CANARY-XK41` anywhere in events; no `~/.claude/` memory path in the init event), positive (Step 3 already proved probe sensitivity), mount (init `skills` still lists `compress`), auth (a `result` event with a successful subtype — no auth/login error). Any failure ⇒ Candidate A rejected; record why and proceed to Step 5.

- [ ] **Step 5: Candidate B/C — only if Candidate A failed**

B: inspect `claude --help` and the settings JSON schema for any switch that scopes memory/CLAUDE.md loading (e.g. a `--settings <file>` override); test the most promising switch with the same four controls and the same probe commands. C: if nothing exists, the spike is REJECTED. Record the `--help` output section scanned and the candidate outputs verbatim.

- [ ] **Step 6: Restore the memory file (ALWAYS, even on failure or interrupt)**

```bash
cp "$SPIKE/CLAUDE.md.backup" ~/.claude/CLAUDE.md
cmp ~/.claude/CLAUDE.md "$SPIKE/CLAUDE.md.backup" && echo RESTORE-OK
```

Expected: `RESTORE-OK`. If this step cannot verify, stop everything and repair before any other work.

- [ ] **Step 7: Write `docs/HERMETICITY.md` and commit**

Structure: `## Problem` (one paragraph, cite CALIBRATION-M5A adjudication 2), `## Protocol` (the steps above as run), `## Evidence` (verbatim init events / result lines / file-copy list per candidate), `## Verdict` (`GREEN(<mechanism>)` with the exact env/flag delta, or `REJECTED` with per-candidate reasons), `## Consequences` (GREEN → Task 4 implements + epoch 3; REJECTED → runner untouched, finding carried forward on the ROADMAP). Copy to the canonical location and verify:

```bash
cp docs/HERMETICITY.md ~/.ai-pref-nsync/local-docs/ai-shakespii/knowledge-references/HERMETICITY.md
cmp docs/HERMETICITY.md ~/.ai-pref-nsync/local-docs/ai-shakespii/knowledge-references/HERMETICITY.md && echo MIRROR-OK
git add docs/HERMETICITY.md
git commit -m "docs(m5b): hermeticity spike evidence and verdict"
```

---

### Task 4: Hermetic runner + `RUN_CACHE_VERSION = 3` — CONDITIONAL on Task 3 GREEN

**Dispatch only if Task 3's verdict is GREEN.** The code below implements the Candidate-A (`CLAUDE_CONFIG_DIR`) variant; if Task 3 adjudicated a different mechanism, the controller amends this brief with the recorded delta before dispatch — the test structure is identical, only the env/flag constant changes.

**Files:**
- Modify: `src/lib/harness/claude-runner.ts` (spawn env)
- Modify: `src/lib/harness/run-dir.ts` (epoch constant)
- Test: `tests/harness/claude-runner.test.ts`
- Test: `tests/harness/run-dir.test.ts`

**Interfaces:**
- Consumes: Task 3's verdict mechanism (HERMETICITY.md §Verdict).
- Produces: exported `prepareHermeticConfigDir(home?: string, scratchParent?: string): string` from `claude-runner.ts`; `RUN_CACHE_VERSION = 3` from `run-dir.ts`. All four key formulas (`runKey`, `triggerKey`, `benchKey`, `suiteKey`) lead with `"3\n"`.

- [ ] **Step 1: Write the failing config-dir tests**

Append to `tests/harness/claude-runner.test.ts`:

```ts
test('prepareHermeticConfigDir: creates a scratch config dir and copies credentials when present', () => {
  const home = mkdtempSync(join(tmpdir(), 'shakespii-home-'))
  const scratch = mkdtempSync(join(tmpdir(), 'shakespii-scratch-'))
  mkdirSync(join(home, '.claude'), { recursive: true })
  writeFileSync(join(home, '.claude', '.credentials.json'), '{"token":"t"}')
  const dir = prepareHermeticConfigDir(home, scratch)
  expect(existsSync(dir)).toBe(true)
  expect(readFileSync(join(dir, '.credentials.json'), 'utf8')).toBe('{"token":"t"}')
})

test('prepareHermeticConfigDir: no credentials file — dir still created, nothing copied', () => {
  const home = mkdtempSync(join(tmpdir(), 'shakespii-home-'))
  const scratch = mkdtempSync(join(tmpdir(), 'shakespii-scratch-'))
  const dir = prepareHermeticConfigDir(home, scratch)
  expect(existsSync(dir)).toBe(true)
  expect(existsSync(join(dir, '.credentials.json'))).toBe(false)
})

test('prepareHermeticConfigDir: memoized per (home, scratchParent) — same dir on repeat calls', () => {
  const home = mkdtempSync(join(tmpdir(), 'shakespii-home-'))
  const scratch = mkdtempSync(join(tmpdir(), 'shakespii-scratch-'))
  expect(prepareHermeticConfigDir(home, scratch)).toBe(prepareHermeticConfigDir(home, scratch))
})
```

(Extend the test file's `node:fs` import with whichever of `mkdirSync`, `writeFileSync`, `readFileSync`, `existsSync`, `mkdtempSync` it does not already import, plus `tmpdir` from `node:os` and `join` from `node:path` if absent.)

Run: `bun test tests/harness/claude-runner.test.ts`
Expected: FAIL — `prepareHermeticConfigDir` is not exported.

- [ ] **Step 2: Implement**

In `src/lib/harness/claude-runner.ts`, add (near the top, after the constants; extend the file's `node:fs`/`node:os`/`node:path` imports as needed):

```ts
const hermeticDirs = new Map<string, string>()

/**
 * Scratch CLAUDE_CONFIG_DIR for hermetic sessions (spec §5, HERMETICITY.md):
 * contains only what authentication needs, so the user memory file at
 * ~/.claude/CLAUDE.md never enters a harness session. Memoized per
 * (home, scratchParent) so one process reuses one dir.
 */
export function prepareHermeticConfigDir(home = homedir(), scratchParent = tmpdir()): string {
  const key = `${home}\n${scratchParent}`
  const existing = hermeticDirs.get(key)
  if (existing) return existing
  const dir = mkdtempSync(join(scratchParent, 'shakespii-claude-config-'))
  const creds = join(home, '.claude', '.credentials.json')
  if (existsSync(creds)) copyFileSync(creds, join(dir, '.credentials.json'))
  hermeticDirs.set(key, dir)
  return dir
}
```

and in `spawnClaudeRunner`'s `run()` set the env before spawn:

```ts
const env = { ...process.env }
delete env.CLAUDECODE
env.CLAUDE_CONFIG_DIR = prepareHermeticConfigDir()
```

Run: `bun test tests/harness/claude-runner.test.ts` → PASS.

- [ ] **Step 3: Write the failing epoch tests**

In `tests/harness/run-dir.test.ts`, the key-formula tests recompute expected keys with `createHash` literals leading `"2\n"`. Update every such literal to `"3\n"` and the pinned `RUN_CACHE_VERSION` expectation to `3` (sanctioned re-pin, Global Constraints). Run: `bun test tests/harness/run-dir.test.ts` → FAIL (constant still 2).

- [ ] **Step 4: Bump the epoch**

In `src/lib/harness/run-dir.ts`: `export const RUN_CACHE_VERSION = 3` (comment: hermetic env is a new comparability epoch — cached artifacts from epoch 2 measured a different session environment). `HARNESS_SCHEMA_VERSION` stays 1.

Run: `bun test tests/harness/run-dir.test.ts` → PASS.

- [ ] **Step 5: Full gates and commit**

Run: `bun test` → PASS; `bun run typecheck` → exit 0.

```bash
git add src/lib/harness/claude-runner.ts src/lib/harness/run-dir.ts tests/harness/claude-runner.test.ts tests/harness/run-dir.test.ts
git commit -m "feat(harness): hermetic session config dir (spike-adjudicated); RUN_CACHE_VERSION 3"
```

---

### Task 5: using-shakespii v0.6.0 — headless-safe evals, re-scoped description, q2 re-pin (spec §3.2, §3.3, §4)

**Files:**
- Modify: `skills/using-shakespii/SKILL.md` (description, version, three qualifier sites)
- Modify: `skills/using-shakespii/evals/evals.json` (evals 1, 2, 6)
- Modify: `skills/using-shakespii/evals/triggers.json` (q2 label)
- Test: `tests/skill/using-shakespii.test.ts` (sanctioned re-pins)

**Interfaces:**
- Consumes: nothing from other tasks (static content edits; independent of Tasks 1–4).
- Produces: the v0.6.0 skill content that Task 8 measures live. The exact strings below are contractual — transcribe byte-for-byte.

- [ ] **Step 1: Re-pin the weld tests first (RED)**

In `tests/skill/using-shakespii.test.ts`:

Replace the triggers test with:

```ts
test('triggers.json carries 20 labeled queries: 11 positive, 9 near-miss negatives', async () => {
  const raw = await Bun.file(join(SKILL_DIR, 'evals/triggers.json')).text()
  const doc = JSON.parse(raw) as { skill_name: string; queries: Array<{ query: string; should_trigger: boolean }> }
  expect(doc.skill_name).toBe('using-shakespii')
  expect(doc.queries).toHaveLength(20)
  expect(doc.queries.filter(q => q.should_trigger).length).toBe(11)
  expect(doc.queries.filter(q => !q.should_trigger).length).toBe(9)
  for (const q of doc.queries) expect(q.query.length).toBeGreaterThan(0)
})
```

Replace the version test with:

```ts
test('v0.6.0 teaches the bench and trigger loops', async () => {
  const raw = await Bun.file(join(SKILL_DIR, 'SKILL.md')).text()
  expect(raw).toContain('version: 0.6.0')
  expect(raw).toContain('shakespii bench')
  expect(raw).toContain('--triggers')
})
```

`REQUIRED_PROMPT_ANCHORS` stays byte-identical — all six anchors still occur in the reworded prompts.

Run: `bun test tests/skill/using-shakespii.test.ts`
Expected: FAIL on both re-pinned tests (content not yet edited).

- [ ] **Step 2: Edit SKILL.md**

Frontmatter — replace the description (line 3) with exactly:

```
description: "Use when linting, auditing, testing, or benchmarking an agent skill — or scaffolding one with the shakespii CLI — validates standard SKILL.md skills (frontmatter, structure, evals, trigger accuracy) and fixes findings until clean, driving shakespii (init, lint --json, test --run, bench)."
```

and the version (line 4) with `version: 0.6.0`.

Qualifier site 1 — in the "Testing a skill's evals" section, replace:

```
`--run` spends real tokens (one executor and one grader session per eval
case), so confirm with the human before the first run on a suite.
```

with:

```
`--run` spends real tokens (one executor and one grader session per eval
case), so confirm with the human before the first run on a suite (when a
human is present to answer; in a non-interactive run, an explicit approval
already given in the task prompt satisfies this).
```

Qualifier site 2 — in the "Benchmarking a skill" section, replace:

```
spends real tokens per run — confirm with the human before the first run
on a suite, and never point it at an untrusted third-party skill
```

with:

```
spends real tokens per run — confirm with the human before the first run
on a suite (or accept an approval the task prompt already grants), and
never point it at an untrusted third-party skill
```

Qualifier site 3 — in the Authoring branch, replace step 5's opening:

```
5. Confirm name, purpose, and trigger situations with the human, then run
```

with:

```
5. Confirm name, purpose, and trigger situations with the human (or adopt
   them from the task prompt when it already supplies and approves them), then run
```

(If the surrounding line wrapping differs from the fragments above, keep the file's wrapping and change only the words shown; the prose content is the contract, reflow is free.)

- [ ] **Step 3: Edit evals.json (spec §3.2 — exact texts)**

Eval 1 `prompt` becomes:

```
Lint my skill at ~/.claude/skills/caveman and fix what it finds. Apply the fixes directly — you have my approval; don't pause to ask.
```

(Expectations unchanged.)

Eval 2 `prompt` becomes:

```
Create a new skill that teaches agents to review Dockerfiles. Use the name dockerfile-review; its purpose is catching common Dockerfile mistakes; it should trigger when the user asks for a Dockerfile review or audit. You have my approval to scaffold — proceed without further questions.
```

Eval 2 expectations — replace

```
Confirms kebab-case name, purpose, and trigger situations before scaffolding
```

with

```
Adopts the supplied name, purpose, and trigger situations without stalling to re-confirm them
```

and replace

```
Presents the skill with clean lint output and asks approval before any install
```

with

```
Presents the skill with clean lint output and does not install it anywhere
```

Eval 6 `prompt` becomes:

```
Run the evals for ~/.claude/skills/compress and tell me which expectations fail. You have my approval for the token spend of --run.
```

Eval 6 expectations — replace

```
Confirms with the human before the first token-spending --run
```

with

```
Proceeds with --run under the prompt's explicit token approval without stalling for further confirmation
```

Evals 3, 4, 5 are untouched. Update each edited eval's `expected_output` only where it still says the agent confirms/asks first: eval 2's becomes

```
The agent adopts the supplied name, purpose, and triggers, scaffolds with shakespii init, fills every section and the evals stub, lint-loops to a clean run, and presents the result without installing it.
```

and eval 6's becomes

```
The agent notes the pre-granted token approval, runs shakespii test with --run and --json, reads the scenario and grading findings, and reports each failed expectation with the grader's evidence — re-running from cache when nothing changed.
```

Eval 1's `expected_output` is unchanged.

- [ ] **Step 4: Flip q2 in triggers.json (spec §4.2 — the only label change)**

```
{ "query": "Create a new skill called changelog-writer", "should_trigger": false },
```

- [ ] **Step 5: Verify gates**

Run: `bun test tests/skill/using-shakespii.test.ts`
Expected: PASS — including the lint-to-zero-findings weld test (the new description satisfies FM04's trigger-first requirement and stays under FM03's length thresholds).
Run: `bun test` → PASS; `bun run typecheck` → exit 0.

- [ ] **Step 6: Commit**

```bash
git add skills/using-shakespii tests/skill/using-shakespii.test.ts
git commit -m "feat(skill): using-shakespii v0.6.0 — headless-safe evals, re-scoped description, creation intent routed to authoring-skills"
```

---

### Task 6: authoring-skills v0.1.0 (spec §2)

**Files:**
- Create: `skills/authoring-skills/SKILL.md`
- Create: `skills/authoring-skills/README.md`
- Create: `skills/authoring-skills/references/critique-rubric.md`
- Create: `skills/authoring-skills/references/headless-eval-rules.md`
- Create: `skills/authoring-skills/evals/evals.json`
- Create: `skills/authoring-skills/evals/triggers.json`
- Test: `tests/skill/authoring-skills.test.ts`

**Interfaces:**
- Consumes: using-shakespii v0.6.0 (Task 5) — the delegation target named in the Procedure; the corpus lint step below assumes Task 5 already landed.
- Produces: the writer skill Task 8 measures live. All file contents below are verbatim — transcribe exactly.

- [ ] **Step 1: Write the failing weld test**

Create `tests/skill/authoring-skills.test.ts`:

```ts
import { expect, test } from 'bun:test'
import { join } from 'node:path'

const CLI = join(import.meta.dir, '../../src/cli/index.ts')
const SKILL_DIR = join(import.meta.dir, '../../skills/authoring-skills')
const SKILLS_ROOT = join(import.meta.dir, '../../skills')

const REQUIRED_PROMPT_ANCHORS = [
  'Create a new skill called retry-taxonomy',
  'authoring interview',
  'Lint my skill',
  'blog post',
]

test('authoring-skills lints to zero findings through the real CLI', () => {
  const lint = Bun.spawnSync(['bun', CLI, 'lint', SKILL_DIR, '--json'])
  expect(lint.exitCode).toBe(0)
  const report = JSON.parse(lint.stdout.toString())
  expect(report.summary).toEqual({ errors: 0, warnings: 0 })
  expect(report.findings).toEqual([])
})

test('the skills corpus carries no cross-skill findings at the 0.65 threshold', () => {
  const lint = Bun.spawnSync(['bun', CLI, 'lint', SKILLS_ROOT, '--corpus', '--json'])
  expect(lint.exitCode).toBe(0)
  const report = JSON.parse(lint.stdout.toString())
  expect(report.corpusFindings).toEqual([])
})

test('evals.json carries the skill-creator shape with the four anchored cases', async () => {
  const raw = await Bun.file(join(SKILL_DIR, 'evals/evals.json')).text()
  const evals = JSON.parse(raw) as {
    skill_name: string
    evals: Array<{ id: number; prompt: string; expected_output: string; expectations: string[] }>
  }
  expect(evals.skill_name).toBe('authoring-skills')
  expect(evals.evals.length).toBeGreaterThanOrEqual(4)
  const ids = evals.evals.map(c => c.id)
  expect(new Set(ids).size).toBe(ids.length)
  for (const c of evals.evals) {
    expect(Number.isInteger(c.id)).toBe(true)
    for (const field of [c.prompt, c.expected_output] as const) {
      expect(typeof field).toBe('string')
      expect(field.length).toBeGreaterThan(0)
    }
    expect(Array.isArray(c.expectations)).toBe(true)
    expect(c.expectations.length).toBeGreaterThan(0)
  }
  for (const anchor of REQUIRED_PROMPT_ANCHORS) {
    expect(evals.evals.some(c => c.prompt.includes(anchor))).toBe(true)
  }
})

test('shakespii test passes on the weld skill', () => {
  const r = Bun.spawnSync(['bun', CLI, 'test', SKILL_DIR, '--json'])
  expect(r.exitCode).toBe(0)
  const rep = JSON.parse(r.stdout.toString())
  expect(rep.summary).toEqual({ errors: 0, warnings: 0 })
  expect(rep.stages[0]).toEqual({ stage: 'deterministic', status: 'pass', findings: [] })
})

test('triggers.json carries 20 labeled queries: 12 positive, 8 near-miss negatives', async () => {
  const raw = await Bun.file(join(SKILL_DIR, 'evals/triggers.json')).text()
  const doc = JSON.parse(raw) as { skill_name: string; queries: Array<{ query: string; should_trigger: boolean }> }
  expect(doc.skill_name).toBe('authoring-skills')
  expect(doc.queries).toHaveLength(20)
  expect(doc.queries.filter(q => q.should_trigger).length).toBe(12)
  expect(doc.queries.filter(q => !q.should_trigger).length).toBe(8)
  for (const q of doc.queries) expect(q.query.length).toBeGreaterThan(0)
})

test('v0.1.0 delegates CLI mechanics to using-shakespii', async () => {
  const raw = await Bun.file(join(SKILL_DIR, 'SKILL.md')).text()
  expect(raw).toContain('version: 0.1.0')
  expect(raw).toContain('using-shakespii')
  expect(raw).toContain('references/critique-rubric.md')
  expect(raw).toContain('references/headless-eval-rules.md')
})
```

Run: `bun test tests/skill/authoring-skills.test.ts`
Expected: FAIL — the skill directory does not exist yet.

- [ ] **Step 2: Create `skills/authoring-skills/SKILL.md`**

````markdown
---
name: authoring-skills
description: "Use when the user asks to create, write, or design a new agent skill from an idea, requirement, or repeated workflow — runs an interview → draft → critique → refine loop on the shakespii toolchain, producing a skill that lints clean and passes its scenario and trigger evals."
version: 0.1.0
---

# authoring-skills

## Intent

Turn a human's idea into a finished Agent Skill through a structured loop:
interview the human for the raw material, draft against the anatomy contract,
critique with a rubric of qualities no linter can check, and refine until the
harness — not taste — says the skill works. The using-shakespii skill teaches
how to drive the CLI; this skill decides what the new skill should say.

## Inputs

- The idea: a problem statement, requirement, or repeated workflow the human
  wants captured as a skill.
- A writable parent directory for the new skill.
- Optional: raw material the human already has — notes, transcripts, a real
  worked example, memory excerpts.

## Preconditions

- The shakespii CLI resolves (`shakespii --version` succeeds); setup lives in
  the using-shakespii skill's Preconditions.
- The using-shakespii skill is available — every CLI mechanic here (fix loop,
  eval runs, trigger measurement) delegates to it.
- A human is reachable for the interview, or the task prompt already supplies
  and approves the interview's answers.

## Procedure

Phase 1 — Interview. Ask one question at a time, multiple-choice where the
options are enumerable, until every anatomy section has raw material:

1. Intent: what problem, for whom, and what does a successful use look like?
2. Triggers: at least five real requests that should fire the skill, and at
   least three lookalikes that must not.
3. Inputs and preconditions: what the skill consumes; binaries, paths, and
   environment it assumes.
4. Procedure: walk one real occurrence of the workflow end to end.
5. Example: one real input with its real output — not an invented pair.
6. Failure modes: what has gone wrong when this was done by hand.

The interview ends when you can state the kebab-case name, the purpose, and
the trigger list back and the human confirms them — or when the task prompt
already supplied and approved all three. In a non-interactive run where the
prompt leaves questions open, ask them all in one batch as your final output
instead of guessing.

Phase 2 — Draft. Scaffold, then fill from the interview:

```bash
shakespii init <name>
```

Fill every scaffold section, replacing each placeholder token. Craft rules
the linter cannot enforce:

- Freedom calibration: prescribe exactly where deviation breaks things (exact
  commands, exact formats); leave open where judgment beats prescription. A
  step that says "run these five commands in order" and a step that says
  "choose an appropriate threshold" should both survive the question "why
  this tight, why this loose?".
- Progressive disclosure: SKILL.md carries the loop; depth (rubrics, rule
  lists, long references) moves to `references/` files linked where used.
- The description leads with its trigger situations — the ones the interview
  named — not with the skill's implementation.
- The Examples section transcribes the interview's real input→output pair.
- Anti-patterns come from the interview's failure modes.

Phase 3 — Critique. Two layers, in order:

1. A fresh-eyes pass against [references/critique-rubric.md](references/critique-rubric.md),
   fixing what it catches.
2. The lint fix loop, delegated to using-shakespii: `shakespii lint <dir>
   --json`, apply remediations, re-lint until exit 0, handle warnings
   explicitly.

Phase 4 — Refine. Author the eval suite, then let the harness judge:

1. Write `evals/evals.json` (at least three cases, one a near-miss negative)
   following [references/headless-eval-rules.md](references/headless-eval-rules.md).
2. Write `evals/triggers.json` (at least sixteen labeled queries, with
   near-miss negatives on the boundary of any neighboring skill).
3. Gate with the harness — token spend confirmed with the human, or already
   approved in the task prompt:

```bash
shakespii test <dir> --run --triggers
```

4. On trigger misses, reword the description and re-measure with `--fresh`;
   stop once accuracy holds at or above 0.8 without regressing queries that
   already passed. The using-shakespii skill documents the loop's CLI
   semantics.

Phase 5 — Present. Hand the human the skill directory, its lint output, and
its scenario and trigger results, plus any open questions. Do not install
the skill anywhere; installation is a separate, explicitly approved act.

## Output

- A new skill directory (`SKILL.md`, `README.md`, `evals/evals.json`,
  `evals/triggers.json`, optional `references/`) that lints clean, with
  recorded scenario and trigger results.
- A presentation of that evidence to the human. The skill is not installed.

## Examples

The human says: "I want a skill that helps agents write good commit
messages."

Interview (excerpt). Q: "What does a bad commit message look like in your
repos — what specifically goes wrong?" A: "They describe the diff instead of
the why; bodies restate the subject." Q: "Name three requests that should
trigger this skill." A: "Write the commit message for this change; clean up
my commit history wording; draft a PR-merge commit."

Draft (excerpt). The interview's answers become the description —

```yaml
description: "Use when the user asks to write or improve a commit message or
commit-history wording — leads with the change's why, keeps the subject
imperative and under fifty characters, and never restates the subject in the
body."
```

— and the bad-message example from the interview becomes the worked example:
input, a diff adding a retry wrapper around one HTTP call; output, subject
"retry transient checkout-service timeouts" with a body explaining the
incident that motivated it.

## Anti-patterns

- Inventing interview answers instead of asking the human — or instead of
  reading them from a task prompt that already supplies them.
- Pasting the raw idea into every section; each anatomy section answers its
  own question.
- Stopping at lint exit 0: lint checks the contract, while the rubric and
  the eval runs check whether the content is any good.
- Eval expectations that need a mid-run human reply — the headless rules
  file shows how to reword them.
- Re-teaching CLI mechanics inline instead of delegating to using-shakespii.
- Installing the finished skill without an explicit approval.
````

- [ ] **Step 3: Create `skills/authoring-skills/README.md`**

```markdown
# authoring-skills

Turns an idea into a finished Agent Skill through an interview → draft →
critique → refine loop. The using-shakespii skill drives the CLI mechanics;
this skill owns the content craft: what to ask, what to write, and when the
result is good enough to present. Source of truth is
`skills/authoring-skills/` in the ai-shakespii repo.

## Develop

    shakespii lint .
```

- [ ] **Step 4: Create `skills/authoring-skills/references/critique-rubric.md`**

```markdown
# Critique rubric — qualities lint cannot check

Run this pass with fresh eyes after the draft is complete and before the
lint loop. For each item: read the named section, apply the check, fix what
fails, and re-read once more after fixing.

## Freedom calibration

- Pick any Procedure step. Can you answer "why this tight?" for prescriptive
  steps and "why this loose?" for open ones? A fragile operation (exact
  command, exact format, ordering that matters) must be prescribed; a
  judgment call (thresholds, phrasing, scope) must not pretend to be exact.
- Look for disguised judgment: a step that gives a precise-looking number
  nobody measured. Either cite where the number comes from or open it up.

## Executable procedure

- Walk the Procedure as a reader who knows the domain but not this workflow.
  At every step, ask: could I act right now without asking a question the
  skill does not answer? Each unanswerable question is a defect.
- Check every command, path, and file the steps mention: does the skill
  declare it (Inputs, Preconditions) or ship it (references/)?

## Real examples

- The Examples section must show a genuine input→output pair — concrete
  values a reader could compare their own run against. A restated trigger
  list or a placeholder-shaped invention fails this check.

## Progressive disclosure

- SKILL.md carries the loop a reader follows; depth lives in `references/`
  files linked at the point of use. If a section reads as a reference table
  or a long rule list, move it and link it.

## Description quality

- The description leads with trigger situations the interview actually
  named, phrased the way a requester would phrase them, in third person.
- It names concrete, searchable things (formats, tools, activities) rather
  than abstractions.

## Anti-patterns are earned

- Each anti-pattern traces to a failure mode the interview surfaced or a
  defect the critique found — not generic advice.

## Headless-safe evals

- Apply [headless-eval-rules.md](headless-eval-rules.md) to every eval case
  before running the harness.
```

- [ ] **Step 5: Create `skills/authoring-skills/references/headless-eval-rules.md`**

```markdown
# Headless eval rules

Scenario evals run in single-turn, non-interactive sessions: the executor
gets one prompt, produces one transcript, and the session ends. An eval that
expects a mid-run conversation stalls at its first question and fails its
grading. Author every case against these rules.

1. Every expectation must be observable in a single-turn transcript: a tool
   call made, a file written, or content of the final message.
2. The prompt carries every input the skill's procedure would elicit from a
   human. If the procedure says "confirm X with the human", the prompt
   supplies X and states that approval is granted.
3. No expectation may require asking and waiting. Reword "asks approval
   before Y" to the observable form: "does not do Y", plus — where the
   presentation itself is the deliverable — "presents Y in its final
   message".
4. Token-spend confirmations are pre-granted in the prompt for any eval
   whose procedure requires them.
5. Keep at least one near-miss negative case: a prompt that resembles the
   skill's triggers but must not engage it, with expectations asserting the
   skill's behavior is absent.

Example rewording. Before: "Confirms the plan with the user before editing."
After (prompt gains: "The plan is approved — proceed without checking in.")
the expectation becomes: "Proceeds under the prompt's approval without
stalling for further confirmation."
```

- [ ] **Step 6: Create `skills/authoring-skills/evals/evals.json`**

```json
{
  "skill_name": "authoring-skills",
  "evals": [
    {
      "id": 1,
      "prompt": "Create a new skill called retry-taxonomy that teaches agents to classify flaky test failures before retrying. Purpose: stop blind retries by classifying the failure first. Triggers: the user asks why CI is flaky or wants a failed run diagnosed before rerunning. Worked example you can use: input — a Jest log ending in ECONNRESET from a service call; output — classification \"infrastructure flake: retry with backoff\", not a code fix. Keep every section brief. You have my approval to scaffold and run the lint loop; proceed without questions.",
      "expected_output": "The agent scaffolds with shakespii init, fills every section from the supplied material, works the lint loop to a clean exit, and presents the result without installing it.",
      "files": [],
      "expectations": [
        "Runs shakespii init rather than hand-rolling the directory layout",
        "Adopts the supplied name, purpose, and triggers without stalling to re-confirm them",
        "Leaves no scaffold placeholder token in the finished files",
        "Runs the lint fix loop until it exits clean",
        "Does not install the skill anywhere"
      ]
    },
    {
      "id": 2,
      "prompt": "I want a skill that helps agents write good commit messages, but I have not thought through the details. Run the authoring interview: ask me everything you need in one batch, since I cannot reply again this session.",
      "expected_output": "The agent runs the interview phase only: a single batch of questions covering intent, triggers, inputs, a worked example, and failure modes, with no files written.",
      "files": [],
      "expectations": [
        "Asks interview questions covering intent, trigger situations, inputs, a real worked example, and failure modes",
        "Does not scaffold or write any skill files before requirements exist",
        "Addresses the questions to the human rather than inventing answers"
      ]
    },
    {
      "id": 3,
      "prompt": "Lint my skill at ./skills/note-taker and fix the findings.",
      "expected_output": "The authoring loop does not engage; this is an audit of an existing skill, so the agent fixes findings without starting an interview or creating anything new.",
      "files": [],
      "expectations": [
        "Does not start the authoring interview",
        "Does not scaffold a new skill directory"
      ]
    },
    {
      "id": 4,
      "prompt": "Write a blog post explaining what agent skills are and why they matter.",
      "expected_output": "The authoring loop does not engage; the agent writes the requested prose as an ordinary writing task.",
      "files": [],
      "expectations": [
        "Does not run the authoring interview or create any skill directory",
        "Handles the request as an ordinary writing task"
      ]
    }
  ]
}
```

- [ ] **Step 7: Create `skills/authoring-skills/evals/triggers.json`**

```json
{
  "skill_name": "authoring-skills",
  "queries": [
    { "query": "Write a new skill that teaches agents to review Dockerfiles", "should_trigger": true },
    { "query": "Create a new skill called changelog-writer", "should_trigger": true },
    { "query": "I have an idea for a skill — help me turn it into a SKILL.md", "should_trigger": true },
    { "query": "Turn my release-notes checklist into a reusable agent skill", "should_trigger": true },
    { "query": "Design an agent skill that summarizes meeting transcripts", "should_trigger": true },
    { "query": "Help me author a skill for triaging flaky CI failures", "should_trigger": true },
    { "query": "Draft a SKILL.md for a code-review helper and interview me for the details", "should_trigger": true },
    { "query": "Build a skill that teaches agents our deploy runbook", "should_trigger": true },
    { "query": "I keep re-explaining our API conventions to agents — make it a skill", "should_trigger": true },
    { "query": "Compose a new agent skill from these notes about our review process", "should_trigger": true },
    { "query": "Write the evals and trigger set for the new skill we are creating", "should_trigger": true },
    { "query": "Start the skill-authoring interview for a database-migration helper", "should_trigger": true },
    { "query": "Lint the skill I just wrote and fix the findings", "should_trigger": false },
    { "query": "Run the evals for my compress skill and tell me what failed", "should_trigger": false },
    { "query": "Audit all my installed skills for duplication", "should_trigger": false },
    { "query": "Benchmark my skill with and without the skill mounted", "should_trigger": false },
    { "query": "Write a blog post explaining what agent skills are", "should_trigger": false },
    { "query": "Create a new React component for the settings page", "should_trigger": false },
    { "query": "Write documentation for my REST API", "should_trigger": false },
    { "query": "Improve my prompt for the customer-support chatbot", "should_trigger": false }
  ]
}
```

- [ ] **Step 8: Run the weld tests**

Run: `bun test tests/skill/authoring-skills.test.ts`
Expected: PASS — all six tests, including lint-to-zero-findings and the corpus pass. If lint reports findings, fix the flagged content per the finding message (the remediation loop is the product working as designed), re-run, and record each fix in the task report; do not weaken the test.

- [ ] **Step 9: Full gates and commit**

Run: `bun test` → PASS; `bun run typecheck` → exit 0.

```bash
git add skills/authoring-skills tests/skill/authoring-skills.test.ts
git commit -m "feat(skill): authoring-skills v0.1.0 — interview, draft, critique, refine writer loop"
```

---

### Task 7: Calibration predictions (spec §9) — CONTROLLER-EXECUTED

**Files:**
- Create: `docs/CALIBRATION-M5B.md` (skeleton + predictions)
- Create: `~/.ai-pref-nsync/local-docs/ai-shakespii/knowledge-references/CALIBRATION-M5B.md`

Predictions are committed BEFORE any live run (M5a rule). Write ranges, not points, each with a mechanism sentence, covering at least:

1. using-shakespii scenario suite exit code after the Task 5 rewording (predict 0; mechanism: the ask-and-stall class is removed; note the residual memory-file risk if Task 3 was REJECTED, or its removal if Task 4 landed).
2. using-shakespii trigger accuracy on the first post-re-scope measurement (range; mechanism: q2 flip plus under-fire vocabulary repair).
3. Number of description-loop iterations needed to hold ≥ 0.8 without regressions (range).
4. authoring-skills scenario suite exit code (predict 0 within N fix iterations; the eval-1 session-length risk is the stated mechanism to watch).
5. authoring-skills trigger accuracy on first measurement (range).
6. Contamination warnings across all M5b runs (predict 0).
7. Grader retries (predict 0 — M5a tolerance held).
8. If Task 4 landed: cache replay proofs both green at epoch 3.

Structure the doc like CALIBRATION-M5A.md: `## Predictions` now; `## Actuals`, `## Predictions vs actuals`, `## Adjudication`, `## Cache proofs` land in Task 8. Mirror with `cp` + `cmp`, then:

```bash
git add docs/CALIBRATION-M5B.md
git commit -m "docs(m5b): calibration predictions committed before the sweep"
```

---

### Task 8: Calibration sweep (spec §9) — CONTROLLER-EXECUTED, LIVE

Live tokens; first-party skills only. Every sweep runs detached with exit capture (M5a protocol): `nohup bash -c '<command>; echo "SWEEP-EXIT=$?" >> <log>' &`, then Monitor until the marker appears. Record actuals VERBATIM; adjudicate misses; never apply mid-sweep rewordings in-phase (the Task 5/6 texts are the pre-sweep, spec-mandated edits — anything discovered now is recorded for M5c+).

- [ ] **Step 1: using-shakespii sweep**

```bash
bun src/cli/index.ts test skills/using-shakespii --run --triggers --fresh --json
```

Gates: scenario + grading stages exit-0 clean (the reworded evals pass); trigger accuracy ≥ 0.8. If a positive query still under-fires, run the §4.1 description loop: edit the description wording only, re-run with `--fresh`, record every iteration (wording diff + resulting accuracy) in CALIBRATION-M5B.md; stop when ≥ 0.8 holds with no regressions on previously passing queries. Re-run `bun test` after any description edit (the weld test lints the edited file) and re-pin nothing — the description is not pinned by tests.

- [ ] **Step 2: authoring-skills sweep**

```bash
bun src/cli/index.ts test skills/authoring-skills --run --triggers --json
```

Gates: scenario suite exit 0 (fix skill content per grader evidence if an expectation fails, re-run — record each fix); trigger accuracy ≥ 0.8 via the same description loop. Watch eval 1's duration against the 300 s budget; if it times out, tighten the eval-1 prompt's brevity instruction, record the change as an adjudicated eval edit, and re-run.

- [ ] **Step 3: Contamination check**

Scan both stage reports for `contamination:` warnings. Expected: zero. Any warning is adjudicated in CALIBRATION-M5B.md (which skill fired, why), never silenced.

- [ ] **Step 4: Cache proofs (only if Task 4 landed)**

Re-run Step 1's command without `--fresh` and diff the trigger/scenario stage objects for replay identity (cache metadata excepted); record `TRIGGER-REPLAY-OK`. Byte-compare a repeated `--json` run for the report. If Task 4 was skipped, note "epoch unchanged — M5a proofs remain authoritative" instead.

- [ ] **Step 5: Write actuals + adjudications, mirror, commit**

Complete CALIBRATION-M5B.md: verbatim stage objects for both skills, predictions-vs-actuals table, adjudications (each miss classified: harness bug / environment / eval-authoring / miscalibration), description-loop iteration log, contamination result, cache-proof result. `cp` + `cmp` to the canonical location.

```bash
git add docs/CALIBRATION-M5B.md skills/
git commit -m "docs(m5b): calibration actuals and adjudications"
```

(`skills/` is included because description-loop iterations may have edited the two descriptions; if no edits happened the path adds nothing.)

---

### Task 9: Docs closeout (spec §10)

**Files:**
- Modify: `docs/ROADMAP.md` (M5b section + Open decisions row)
- Modify: `README.md` (skills inventory, memory-file caveat)
- Modify: `docs/HARNESS.md` (ONLY if Task 4 landed)
- Mirror: canonical copies for every touched doc that has one

**Interfaces:**
- Consumes: the ledger's per-task commit ranges; Task 3's verdict; Task 8's calibration headlines.

- [ ] **Step 1: ROADMAP**

Check off all five M5b bullets with the per-task commit hashes from the ledger (follow the M5a section's format), and rewrite the "ai-cortex promotion path" row of Open decisions to:

```
| ai-cortex promotion path | ~~Ship with M5b writer, or later once the writer's dogfooded~~ | **Decided 2026-07-10: deferred post-dogfood** — the writer ships without it; design the memory→skill-draft path after real authoring use (M5b spec §0.2) |
```

Do not write a commit range line for M5b that includes the closeout commit itself; name the range up to the calibration commit and add "docs closeout follows" (the M5a self-reference lesson, Task 2).

- [ ] **Step 2: README**

Add authoring-skills beside using-shakespii in the skills inventory (one line: the interview → draft → critique → refine writer; delegates CLI mechanics to using-shakespii). Update the M5a memory-file caveat: if Task 4 landed, state that harness sessions now run with a hermetic config scope and cite docs/HERMETICITY.md; if Task 3 was REJECTED, keep the caveat and cite docs/HERMETICITY.md as the investigation record.

- [ ] **Step 3: HARNESS.md (conditional)**

Only if Task 4 landed: update the runner section with the hermetic mechanism exactly as HERMETICITY.md's verdict states it (env delta, what the scratch config dir contains) and the cache section with `RUN_CACHE_VERSION = 3` and the epoch rationale. Keep every description honest to shipped behavior — quote constants from the source, not from memory.

- [ ] **Step 4: Mirrors, gates, commit**

`cp` + `cmp` every touched doc that has a canonical copy (ROADMAP and README are repo-only; HARNESS.md and CALIBRATION-M5B.md live in `knowledge-references/`). Run `bun test` → PASS and `bun run typecheck` → exit 0.

```bash
git add docs/ROADMAP.md README.md docs/HARNESS.md
git commit -m "docs(m5b): close out M5b — roadmap, README, harness docs"
```

---

## Final verification (whole milestone)

- [ ] `bun test` — 0 fail, unpiped.
- [ ] `bun run typecheck` — exit 0.
- [ ] `git status --short` — clean tree.
- [ ] `bun src/cli/index.ts lint skills --corpus --json` — exit 0, `corpusFindings: []`.
- [ ] CALIBRATION-M5B.md gates all green: both scenario suites exit 0, both trigger accuracies ≥ 0.8 held, zero unadjudicated contamination warnings.
- [ ] Every dual-location doc `cmp`-verified.
- [ ] Ledger complete through Task 9; final whole-branch review dispatched on the strongest available model with `scripts/review-package <merge-base> HEAD`.
