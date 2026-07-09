# M5a — Harness Hardening + Executor Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Executor sessions stop inheriting the user's global claude environment (`--setting-sources project,local`), residual contamination is detected and reported as warn-only findings, and the six M4b-2 backlog items land — closed out by a calibration re-sweep proving the decontaminated bench baseline.

**Architecture:** One argv append in `ClaudeRunner` (uniform across scenario/trigger/bench/grader), gated by a live feasibility spike (Task 1). Contamination detection is a pure function over stream events (`src/lib/harness/contamination.ts`), wired at stage/report assembly so it recomputes from persisted `events.jsonl` on cached replays. A new `RUN_CACHE_VERSION = 2` epoch in the four run keys retires pre-isolation caches while `HARNESS_SCHEMA_VERSION` stays 1 for output documents.

**Tech Stack:** Bun + TypeScript, bun:test, no new dependencies.

**Spec:** `docs/specs/2026-07-09-m5a-harness-hardening-design.md` (§ references below point there).

## Global Constraints

Copied verbatim from the spec; every task's requirements include this section.

- **Runner argv (contractual, spec §3.1):** `claude -p <prompt> --output-format stream-json --verbose --dangerously-skip-permissions --model <model> --setting-sources project,local [--include-partial-messages]` — the `--setting-sources project,local` pair sits after the `--model` pair and before the conditional `--include-partial-messages`. Uniform policy: every runner session (scenario, trigger, bench both configs, grader) gets it.
- **Key formulas (spec §5):** `runKey = sha256("2\n<skillHash>\n<evalId>\n<model>")[:16]`; `triggerKey = sha256("2\n<skillHash>\ntrigger\n<sha256hex(query)>\n<rep>\n<model>")[:16]`; `benchKey = sha256("2\n<skillHash>\n<evalId>\n<config>\n<runNumber>\n<model>")[:16]`; `suiteKey = sha256("2\n<skillHash>\nbench-suite\n<model>\n<runs>")[:16]`. The leading `2` is `RUN_CACHE_VERSION`. `HARNESS_SCHEMA_VERSION` stays `1` and stays in `benchmark.json` metadata.
- **Contamination finding messages (contractual, spec §4.3):**
  - scenario: `contamination: session invoked non-target skill "<skill>" (<count> invocation(s)) [eval <id>]` — HarnessFinding severity `'warn'`, `file: 'evals/evals.json'`, `line: null`.
  - trigger: `contamination: session invoked non-target skill "<skill>" (<count> invocation(s)) [query <n> rep <r>]` — severity `'warn'`, `file: 'evals/triggers.json'`, `line: null`.
  - bench (a plain string, not a HarnessFinding): `warn contamination: <config> eval <id> run <n> invoked non-target skill "<skill>" (<count> invocation(s))`.
- **Warnings never flip status (spec §4.3):** scenario/trigger stage `status` derives from `severity === 'error'` findings only. Clean runs produce reports byte-identical to M4b-2 output.
- **Allowed sets (spec §4.2):** scenario / trigger / bench `with_skill` → `[<target skill name>]`; bench `without_skill` → `[]`. Grader sessions are isolated but never scanned.
- **Frozen surfaces (spec §11):** lint CLI + lint JSON v1; flagless `test` output (JSON + pretty); `benchmark.json` schema and `bench --json` stdout byte-purity (warnings go to stderr); grading.json contract; trigger report key orders; `TRIGGER_REPS = 3`, `TRIGGER_PASS_THRESHOLD = 0.5`, `TRIGGER_ACCURACY_THRESHOLD = 0.8`, `BENCH_DEFAULT_RUNS = 3` unchanged; live corpus `~/.claude/skills/` and the superpowers plugin cache strictly READ-ONLY (the in-repo `skills/using-shakespii/` is writable).
- **TDD + gates:** every code task writes the failing test first; unpiped `bun test` and `bun run typecheck` green at every commit. No test spawns real `claude`; every cache-touching test uses a temp cacheRoot.
- **Never weaken an assertion to absorb a new finding.** Sanctioned re-pins in this plan, exhaustively: the two argv arrays in `tests/harness/claude-runner.test.ts` (lines ~45 and ~98) gain `'--setting-sources', 'project,local'` (Task 3); any `detect.test.ts` assertion that pins substring Skill-matching semantics moves to exact-match semantics (Task 5 — verify with the grep step there); any test pinning the live-path `'internal: grading document missing derivable metrics'` bench failure message follows the Task 11 change (grep step there; none known).
- **Docs dual-location:** canonical `~/.ai-pref-nsync/local-docs/ai-shakespii/` (knowledge-references/ for HARNESS + CALIBRATION, specs/ for spec, plans/ for this plan and ROADMAP), repo `docs/` mirror; every doc commit ends with `cp` + `cmp` (expect silent) both ways.
- **Safety posture:** never point `--run`/`--triggers`/`bench` at untrusted third-party skills (`--dangerously-skip-permissions` stays in the argv).
- **No `using-shakespii` SKILL.md changes** — the eval-5 edit (Task 12) touches only `evals/evals.json`; no version bump (the skill body is untouched; the skillHash rotation it causes is absorbed by the epoch bump).
- **Controller-executed tasks:** Task 1 (spike) and Task 13 (calibration) run live claude sessions and are executed by the controller directly, not by implementer subagents (subagent background shells die at turn end; live sweeps need detached shells + Monitor).

## Model allocation (subagent dispatch)

| Task | Implementer | Rationale |
|---|---|---|
| 1 spike | — (controller, live) | live claude probes, halt gate |
| 2 epoch, 3 argv, 9 grader-extract | haiku | complete code in plan, 1–2 files each |
| 4 settle, 5 detector, 6 scanner, 10 fail-files | sonnet | runner/detector/grader nuance |
| 7 scenario+trigger wiring, 8 bench wiring, 11 hygiene, 14 docs | sonnet | multi-file integration |
| 12 eval-5 + calibration scaffold | haiku | precise transcription edit |
| 13 calibration | — (controller, live) | sweeps, proofs, adjudication |
| Task reviewers | opus | every task |
| Final whole-branch review | strongest available | per SDD skill |

---

### Task 1: Isolation feasibility spike (controller-executed, live)

**Files:**
- Create: `docs/CALIBRATION-M5A.md` (skeleton: spike evidence section only)
- Create (canonical): `~/.ai-pref-nsync/local-docs/ai-shakespii/knowledge-references/CALIBRATION-M5A.md`
- Scratch: `/tmp/m5a-spike/` (probe workspaces + captured events)

**Interfaces:**
- Produces: PASS/FAIL verdict for spec §3.2 assertions (a1), (a2), (b), (c). PASS unblocks Tasks 2–14. FAIL **halts the milestone** — hand back CANNOT PROCEED per the workflow escalation path (spec: contingencies are recorded, not built).

No code changes in this task. The probe prompt reuses the compress fixture's eval-1 prompt, which reliably invoked the user-global `compress` skill in the M4b-2 sweep (CALIBRATION-M4B2 adjudication 1).

- [ ] **Step 1: Prepare workspaces**

```bash
rm -rf /tmp/m5a-spike && mkdir -p /tmp/m5a-spike/control /tmp/m5a-spike/flagged /tmp/m5a-spike/staged
PROBE="$(python3 -c "import json; print(json.load(open('tests/fixtures/harness/compress/evals/evals.json'))['evals'][0]['prompt'])")"
echo "$PROBE" > /tmp/m5a-spike/probe.txt
# copy the fixture's eval-1 input files into each workspace the way stageBareRunDir would
python3 - <<'EOF'
import json, shutil, os
doc = json.load(open('tests/fixtures/harness/compress/evals/evals.json'))
files = doc['evals'][0].get('files', [])
for ws in ('control', 'flagged', 'staged'):
    for rel in files:
        dest = os.path.join('/tmp/m5a-spike', ws, rel)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        shutil.copy(os.path.join('tests/fixtures/harness/compress', rel), dest)
print('staged inputs:', files)
EOF
# staged workspace additionally gets the fixture skill as a PROJECT-level mount
mkdir -p /tmp/m5a-spike/staged/.claude/skills/compress
cp -R tests/fixtures/harness/compress/SKILL.md /tmp/m5a-spike/staged/.claude/skills/compress/SKILL.md
[ -z "$ANTHROPIC_API_KEY" ] && echo "AUTH-PRECONDITION-OK (no ANTHROPIC_API_KEY; OAuth in play)"
```

Expected: `AUTH-PRECONDITION-OK` printed (assertion (c) precondition — the spike must run on OAuth).

- [ ] **Step 2: (a1) unflagged positive control**

```bash
cd /tmp/m5a-spike/control && env -u CLAUDECODE claude -p "$(cat /tmp/m5a-spike/probe.txt)" \
  --output-format stream-json --verbose --dangerously-skip-permissions --model sonnet \
  > /tmp/m5a-spike/control.jsonl 2>/tmp/m5a-spike/control.err
grep -c '"name":"Skill"' /tmp/m5a-spike/control.jsonl
grep -o '"skill":"compress"' /tmp/m5a-spike/control.jsonl | head -1
```

Expected: Skill tool_use count ≥ 1 AND `"skill":"compress"` present. If absent, the probe no longer triggers the global skill: pick another prompt that does (try the compress fixture eval-2 prompt, then a direct "compress this markdown file" phrasing) and re-run the PAIR from Step 2 — never proceed on a probe that fails (a1) (spec §3.2: replaced and re-run, never waived).

- [ ] **Step 3: (a2) flagged exclusion run, same prompt**

```bash
cd /tmp/m5a-spike/flagged && env -u CLAUDECODE claude -p "$(cat /tmp/m5a-spike/probe.txt)" \
  --output-format stream-json --verbose --dangerously-skip-permissions --model sonnet \
  --setting-sources project,local \
  > /tmp/m5a-spike/flagged.jsonl 2>/tmp/m5a-spike/flagged.err
grep -c '"skill":"compress"' /tmp/m5a-spike/flagged.jsonl || echo ZERO-COMPRESS-INVOCATIONS
grep -c '"type":"result"' /tmp/m5a-spike/flagged.jsonl
```

Expected: `ZERO-COMPRESS-INVOCATIONS` (grep exits 1 on no match) AND result-event count ≥ 1 (session completed on OAuth — assertion (c) for the flagged config).

- [ ] **Step 4: (b) staged project-level skill still loads under the flag**

```bash
cd /tmp/m5a-spike/staged && env -u CLAUDECODE claude -p "$(cat /tmp/m5a-spike/probe.txt)" \
  --output-format stream-json --verbose --dangerously-skip-permissions --model sonnet \
  --setting-sources project,local \
  > /tmp/m5a-spike/staged.jsonl 2>/tmp/m5a-spike/staged.err
grep -o '"skill":"compress"' /tmp/m5a-spike/staged.jsonl | head -1 || grep -o '\.claude/skills/compress/SKILL\.md' /tmp/m5a-spike/staged.jsonl | head -1
```

Expected: a Skill invocation of `compress` OR a Read of the mounted `.claude/skills/compress/SKILL.md` (either satisfies the detector's trigger definition). Empty output = assertion (b) FAIL → halt.

- [ ] **Step 5: Record spike evidence and commit**

Write `docs/CALIBRATION-M5A.md` with this skeleton (verbatim grep outputs pasted in):

```markdown
# CALIBRATION-M5A — harness hardening + executor isolation

## Spike evidence (spec §3.2, run 2026-07-09)

Probe prompt: compress fixture eval-1 prompt (verbatim below).

> <probe prompt verbatim>

| Assertion | Command evidence | Result |
|---|---|---|
| (a1) unflagged positive control invokes global compress | <n> Skill tool_use events; `"skill":"compress"` present in control.jsonl | PASS |
| (a2) flagged run excludes it | zero `"skill":"compress"` matches in flagged.jsonl; <n> result event(s) | PASS |
| (b) project-level mount still loads | `"skill":"compress"` (or mounted SKILL.md Read) present in staged.jsonl | PASS |
| (c) OAuth intact | no ANTHROPIC_API_KEY in env; both flagged sessions completed with result events | PASS |

Raw captures: /tmp/m5a-spike/{control,flagged,staged}.jsonl (not committed).

## Predictions

(recorded in Task 13, committed before any sweep)

## Actuals

(recorded in Task 13)

## Adjudication

(recorded in Task 13; the eval-5 rewording application is entry 1 — see Task 12)

## Cache proofs

(recorded in Task 13)
```

```bash
cp docs/CALIBRATION-M5A.md ~/.ai-pref-nsync/local-docs/ai-shakespii/knowledge-references/CALIBRATION-M5A.md
cmp docs/CALIBRATION-M5A.md ~/.ai-pref-nsync/local-docs/ai-shakespii/knowledge-references/CALIBRATION-M5A.md && echo MIRROR-OK
git add docs/CALIBRATION-M5A.md
git commit -m "docs(m5a): isolation spike evidence — setting-sources exclusion proven with positive control"
```

Expected: MIRROR-OK; commit lands. If any assertion failed, do NOT commit partial evidence as PASS — record the failure and halt.

---

### Task 2: `RUN_CACHE_VERSION = 2` epoch in the four run keys

**Files:**
- Modify: `src/lib/harness/run-dir.ts`
- Test: `tests/harness/run-dir.test.ts`

**Interfaces:**
- Produces: `export const RUN_CACHE_VERSION = 2` from `src/lib/harness/run-dir.ts`. `HARNESS_SCHEMA_VERSION` remains exported and equal to `1` (still consumed by `bench.ts` for `benchmark.json` metadata). Key function signatures unchanged.

- [ ] **Step 1: Write the failing test**

Append to `tests/harness/run-dir.test.ts` (add `import { createHash } from 'node:crypto'` and add `RUN_CACHE_VERSION` to the existing run-dir import):

```ts
test('RUN_CACHE_VERSION epoch 2 leads every key formula; HARNESS_SCHEMA_VERSION stays 1', () => {
  expect(HARNESS_SCHEMA_VERSION).toBe(1)
  expect(RUN_CACHE_VERSION).toBe(2)
  const skillHash = 'a'.repeat(64)
  const hex16 = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16)
  expect(runKey({ skillHash, evalId: 1, model: 'sonnet' })).toBe(hex16(`2\n${skillHash}\n1\nsonnet`))
  const qHash = createHash('sha256').update('Query one.').digest('hex')
  expect(triggerKey({ skillHash, query: 'Query one.', rep: 1, model: 'sonnet' })).toBe(hex16(`2\n${skillHash}\ntrigger\n${qHash}\n1\nsonnet`))
  expect(benchKey({ skillHash, evalId: 1, config: 'with_skill', runNumber: 1, model: 'sonnet' })).toBe(hex16(`2\n${skillHash}\n1\nwith_skill\n1\nsonnet`))
  expect(suiteKey({ skillHash, model: 'sonnet', runs: 3 })).toBe(hex16(`2\n${skillHash}\nbench-suite\nsonnet\n3`))
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `bun test tests/harness/run-dir.test.ts`
Expected: FAIL — `RUN_CACHE_VERSION` not exported (compile error) or key mismatch (keys still epoch `1`).

- [ ] **Step 3: Implement**

In `src/lib/harness/run-dir.ts`, replace the `HARNESS_SCHEMA_VERSION` doc comment + add the new constant:

```ts
/** Version of the OUTPUT documents (benchmark.json metadata, grading contract). Independent of RUN_CACHE_VERSION. */
export const HARNESS_SCHEMA_VERSION = 1

/**
 * Comparability epoch of cached runs. Bumps whenever executor session semantics
 * change (M5a: --setting-sources isolation), so runs recorded under older
 * semantics never replay as comparable. Old run dirs stay on disk, ignored.
 */
export const RUN_CACHE_VERSION = 2
```

Then in each of `runKey`, `triggerKey`, `benchKey`, `suiteKey`, replace the leading `${HARNESS_SCHEMA_VERSION}\n` with `${RUN_CACHE_VERSION}\n` (four sites; nothing else changes).

- [ ] **Step 4: Run tests and typecheck**

Run: `bun test` then `bun run typecheck`
Expected: all pass (existing key tests are structural — distinctness/format — and keep passing; the `expect(HARNESS_SCHEMA_VERSION).toBe(1)` pin in the existing runKey test still holds).

- [ ] **Step 5: Commit**

```bash
git add src/lib/harness/run-dir.ts tests/harness/run-dir.test.ts
git commit -m "feat(harness): RUN_CACHE_VERSION=2 epoch — pre-isolation caches never replay as comparable"
```

---

### Task 3: Runner argv gains `--setting-sources project,local`

**Files:**
- Modify: `src/lib/harness/claude-runner.ts:44`
- Test: `tests/harness/claude-runner.test.ts` (two argv pins, sanctioned re-pin)

**Interfaces:**
- Consumes: spike PASS (Task 1).
- Produces: every runner session carries the isolation pair (Global Constraints argv). No signature changes.

- [ ] **Step 1: Re-pin the two argv assertions (failing first)**

In `tests/harness/claude-runner.test.ts`, update the two exact-array assertions:

```ts
// test 'completed run: argv, ...' (~line 45):
expect(args).toEqual(['-p', 'do it', '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions', '--model', 'sonnet', '--setting-sources', 'project,local'])
// test 'detect mode adds --include-partial-messages to argv' (~line 98):
expect(args).toEqual(['-p', 'x', '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions', '--model', 'sonnet', '--setting-sources', 'project,local', '--include-partial-messages'])
```

- [ ] **Step 2: Run to verify both fail**

Run: `bun test tests/harness/claude-runner.test.ts`
Expected: FAIL — argv arrays missing the new pair.

- [ ] **Step 3: Implement**

In `src/lib/harness/claude-runner.ts` line 44, the argv becomes:

```ts
const argv = [claudeBin, '-p', req.prompt, '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions', '--model', req.model, '--setting-sources', 'project,local']
```

(The conditional `if (req.detect) argv.push('--include-partial-messages')` on the next line is untouched, preserving the contractual order.)

- [ ] **Step 4: Run tests and typecheck**

Run: `bun test` then `bun run typecheck`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/harness/claude-runner.ts tests/harness/claude-runner.test.ts
git commit -m "feat(harness): executor isolation — every claude session gets --setting-sources project,local"
```

---

### Task 4: `settleWithGrace` hoisted + outer bound

**Files:**
- Modify: `src/lib/harness/claude-runner.ts` (hoist the closure at lines ~97–124 to module scope)
- Test: `tests/harness/claude-runner.test.ts`

**Interfaces:**
- Produces: `export const SETTLE_OUTER_BOUND_MS = 10_000` and `export async function settleWithGrace<T>(work: Promise<T>, reader: { cancel(): Promise<void> }, fallback: T, graceMs?: number, outerBoundMs?: number): Promise<T>` from `src/lib/harness/claude-runner.ts`. `run()` calls it with defaults — behavior inside the bound byte-identical (spec §8).

- [ ] **Step 1: Write the failing tests**

Append to `tests/harness/claude-runner.test.ts` (add `settleWithGrace`, `SETTLE_OUTER_BOUND_MS` to the import from claude-runner):

```ts
test('SETTLE_OUTER_BOUND_MS is pinned', () => {
  expect(SETTLE_OUTER_BOUND_MS).toBe(10_000)
})

test('settleWithGrace: settled work returns its value inside the bound', async () => {
  const reader = { cancel: async () => {} }
  expect(await settleWithGrace(Promise.resolve('ok'), reader, 'fallback')).toBe('ok')
})

test('settleWithGrace: grace path — work settles after cancel unblocks it', async () => {
  let resolveWork: (v: string) => void = () => {}
  const work = new Promise<string>(r => { resolveWork = r })
  let cancelled = false
  const reader = { cancel: async () => { cancelled = true; resolveWork('drained') } }
  expect(await settleWithGrace(work, reader, 'fallback', 5, 1_000)).toBe('drained')
  expect(cancelled).toBe(true)
})

test('settleWithGrace: outer bound — hung work + hung cancel returns fallback, no hang', async () => {
  const neverWork = new Promise<string>(() => {})
  const hungReader = { cancel: () => new Promise<void>(() => {}) }
  const started = performance.now()
  expect(await settleWithGrace(neverWork, hungReader, 'fallback', 5, 30)).toBe('fallback')
  expect(performance.now() - started).toBeLessThan(1_000)
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `bun test tests/harness/claude-runner.test.ts`
Expected: FAIL — `settleWithGrace` / `SETTLE_OUTER_BOUND_MS` not exported.

- [ ] **Step 3: Implement**

In `src/lib/harness/claude-runner.ts`: delete the `DRAIN_GRACE_MS` constant and the `settleWithGrace` closure from inside `run()` (lines ~97–124) and add at module scope (below `CLAUDE_UNAVAILABLE_MESSAGE`), keeping the existing empirical comment about Bun EOF hangs above it:

```ts
const DRAIN_GRACE_MS = 2000
export const SETTLE_OUTER_BOUND_MS = 10_000

// Once the process has exited, its pipe write-ends are already closed, so a
// pending read should settle almost immediately with `done: true`. Observed
// empirically: after a detached process group has been SIGKILLed more than
// once within the same Bun runtime, the stdout/stderr ReadableStream readers
// can fail to report that EOF and hang indefinitely. Bound the wait and
// force-cancel to unblock; if even the cancel hangs, the outer bound returns
// the fallback rather than hanging the run (spec §8).
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
  return Promise.race([sequence(), Bun.sleep(outerBoundMs).then(() => fallback)])
}
```

The two call sites inside `run()` stay textually identical (`await settleWithGrace(stdoutPromise, stdoutReader, undefined)` / `stderr = await settleWithGrace(stderrPromise, stderrReader, '')`) — `ReadableStreamDefaultReader<Uint8Array>` structurally satisfies `{ cancel(): Promise<void> }`.

- [ ] **Step 4: Run tests and typecheck**

Run: `bun test` then `bun run typecheck`
Expected: all pass (the existing runner integration tests exercise the default-parameter path unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/lib/harness/claude-runner.ts tests/harness/claude-runner.test.ts
git commit -m "fix(harness): settleWithGrace outer bound — a hung reader cancel can no longer hang a run"
```

---

### Task 5: Skill-detection exact-match

**Files:**
- Modify: `src/lib/harness/detect.ts` (the `matches` Skill branch, lines ~20–21)
- Test: `tests/harness/detect.test.ts`

**Interfaces:**
- Consumes: `createDetector(skillName)` — signature unchanged.
- Produces: Skill verdicts fire on `input.skill === skillName` (parse path) or the `"skill":"<name>"` key+value needle (fallback). Read branch untouched.

- [ ] **Step 1: Write the failing tests**

Append to `tests/harness/detect.test.ts`, reusing that file's existing event-builder helpers if present (check the top of the file; otherwise these literal events match the detector's parsed shapes):

```ts
const skillStart = { type: 'stream_event', event: { type: 'content_block_start', content_block: { type: 'tool_use', name: 'Skill' } } }
const delta = (partial_json: string) => ({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json } } })
const blockStop = { type: 'stream_event', event: { type: 'content_block_stop' } }

test('Skill exact match: compress does not fire on compress-v2', () => {
  const d = createDetector('compress')
  d.feed(skillStart)
  d.feed(delta('{"skill":"compress-v2"}'))
  expect(d.feed(blockStop)).toBe(false)
})

test('Skill exact match: fires on the exact name (parse path)', () => {
  const d = createDetector('compress')
  d.feed(skillStart)
  d.feed(delta('{"skill":"compress"}'))
  expect(d.feed(blockStop)).toBe(true)
})

test('Skill fallback: unparsable accumulation fires only on the key+value needle', () => {
  const fires = createDetector('compress')
  fires.feed(skillStart)
  fires.feed(delta('{"skill":"compress",')) // truncated JSON — unparsable
  expect(fires.feed(blockStop)).toBe(true)

  const noFire = createDetector('compress')
  noFire.feed(skillStart)
  noFire.feed(delta('{"skill":"compress-v2",')) // unparsable AND wrong skill
  expect(noFire.feed(blockStop)).toBe(false)
})

test('Skill exact match applies on the assistant-event path too', () => {
  const d = createDetector('compress')
  const assistant = (skill: string) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill } }] } })
  expect(d.feed(assistant('compress-v2'))).toBe(false)
  expect(d.feed(assistant('compress'))).toBe(true)
})
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `bun test tests/harness/detect.test.ts`
Expected: the `compress-v2` cases FAIL (substring matching fires on them today). Also run `grep -n "includes(skillName)" tests/harness/detect.test.ts src/lib/harness/detect.ts` — if any EXISTING detect.test.ts assertion pins substring semantics (a test asserting a fire on a non-exact name), re-pin it to exact-match semantics and name it in the commit body (sanctioned re-pin, Global Constraints).

- [ ] **Step 3: Implement**

In `src/lib/harness/detect.ts`, the `matches` function's Skill branch becomes:

```ts
  const matches = (tool: 'Skill' | 'Read', inputText: string): boolean => {
    if (tool === 'Skill') {
      // Exact-match on the parsed skill name (spec §7) — "compress" must not
      // fire on "compress-v2". The input is complete JSON at block stop.
      try {
        const input = JSON.parse(inputText) as Record<string, unknown>
        return typeof input.skill === 'string' && input.skill === skillName
      } catch {
        // defensive fallback for an unparsable accumulation: key+value needle
        // with the closing quote, so a longer name never matches
        return inputText.includes(`"skill":"${skillName}"`)
      }
    }
    // Read branch unchanged below …
```

(The Read branch and everything else in the file are untouched.)

- [ ] **Step 4: Run tests and typecheck**

Run: `bun test` then `bun run typecheck`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/harness/detect.ts tests/harness/detect.test.ts
git commit -m "fix(harness): Skill detection exact-match — near-name skills no longer false-positive"
```

---

### Task 6: Contamination scanner module

**Files:**
- Create: `src/lib/harness/contamination.ts`
- Test: `tests/harness/contamination.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 7–8 and the Task 13 retro-scan):

```ts
export interface ContaminationHit { skill: string; count: number }
export function scanContamination(events: unknown[], allowed: string[]): ContaminationHit[]
export function contaminationMessage(hit: ContaminationHit, context: string): string
export function readPersistedEvents(dir: string): unknown[]
```

- [ ] **Step 1: Write the failing tests**

Create `tests/harness/contamination.test.ts`:

```ts
import { expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { contaminationMessage, readPersistedEvents, scanContamination } from '../../src/lib/harness/contamination'

const skillUse = (skill: string) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill } }] } })
const readUse = { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/x/SKILL.md' } }] } }
const resultEvt = { type: 'result', result: 'done' }

test('clean run: no assistant Skill invocations → no hits', () => {
  expect(scanContamination([readUse, resultEvt], [])).toEqual([])
})

test('target invocation is allowed; foreign is a hit', () => {
  const events = [skillUse('demo-skill'), skillUse('compress')]
  expect(scanContamination(events, ['demo-skill'])).toEqual([{ skill: 'compress', count: 1 }])
})

test('empty allowed set: ANY Skill invocation is contamination (without_skill)', () => {
  expect(scanContamination([skillUse('compress')], [])).toEqual([{ skill: 'compress', count: 1 }])
})

test('dedupe with counts, first-occurrence order', () => {
  const events = [skillUse('b-skill'), skillUse('a-skill'), skillUse('b-skill')]
  expect(scanContamination(events, [])).toEqual([
    { skill: 'b-skill', count: 2 },
    { skill: 'a-skill', count: 1 },
  ])
})

test('exact match: compress-v2 is NOT covered by allowing compress', () => {
  expect(scanContamination([skillUse('compress-v2')], ['compress'])).toEqual([{ skill: 'compress-v2', count: 1 }])
})

test('tolerant: malformed events and non-string skill inputs are skipped, never throw', () => {
  const events: unknown[] = [
    null, 42, 'text',
    { type: 'assistant' },
    { type: 'assistant', message: { content: 'not-an-array' } },
    { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 7 } }] } },
    { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill' }] } },
    { type: 'stream_event', event: { type: 'content_block_start', content_block: { type: 'tool_use', name: 'Skill' } } },
    skillUse('compress'),
  ]
  expect(scanContamination(events, [])).toEqual([{ skill: 'compress', count: 1 }])
})

test('stream_event partials are ignored (assistant events only — no double counting)', () => {
  const partial = { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{"skill":"compress"}' } } }
  expect(scanContamination([partial], [])).toEqual([])
})

test('contaminationMessage formats are contractual', () => {
  expect(contaminationMessage({ skill: 'compress', count: 2 }, 'eval 3')).toBe(
    'contamination: session invoked non-target skill "compress" (2 invocation(s)) [eval 3]',
  )
  expect(contaminationMessage({ skill: 'compress', count: 1 }, 'query 7 rep 2')).toBe(
    'contamination: session invoked non-target skill "compress" (1 invocation(s)) [query 7 rep 2]',
  )
})

test('readPersistedEvents: parses events.jsonl, skips unparseable lines, [] when absent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-contamination-'))
  expect(readPersistedEvents(dir)).toEqual([])
  writeFileSync(join(dir, 'events.jsonl'), `${JSON.stringify(skillUse('compress'))}\nnot-json\n\n${JSON.stringify(resultEvt)}\n`)
  const events = readPersistedEvents(dir)
  expect(events).toHaveLength(2)
  expect(scanContamination(events, [])).toEqual([{ skill: 'compress', count: 1 }])
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test tests/harness/contamination.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `src/lib/harness/contamination.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

export interface ContaminationHit {
  skill: string
  count: number
}

/**
 * Pure post-hoc contamination scan (spec §4): every assistant-event Skill
 * invocation whose exact name is not in `allowed` is a hit. Scans full
 * assistant messages only — stream_event partials exist only in detect-mode
 * runs and would double-count. Tolerant of malformed events: skip, never throw.
 */
export function scanContamination(events: unknown[], allowed: string[]): ContaminationHit[] {
  const counts = new Map<string, number>()
  for (const event of events) {
    if (!isRecord(event) || event.type !== 'assistant') continue
    if (!isRecord(event.message) || !Array.isArray(event.message.content)) continue
    for (const block of event.message.content) {
      if (!isRecord(block) || block.type !== 'tool_use' || block.name !== 'Skill') continue
      if (!isRecord(block.input) || typeof block.input.skill !== 'string') continue
      const skill = block.input.skill
      if (allowed.includes(skill)) continue
      counts.set(skill, (counts.get(skill) ?? 0) + 1)
    }
  }
  return [...counts.entries()].map(([skill, count]) => ({ skill, count }))
}

/** Contractual message body (spec §4.3); the caller supplies the stage context. */
export function contaminationMessage(hit: ContaminationHit, context: string): string {
  return `contamination: session invoked non-target skill "${hit.skill}" (${hit.count} invocation(s)) [${context}]`
}

/** Events of a persisted run: parse events.jsonl line-by-line, tolerant; [] when absent. */
export function readPersistedEvents(dir: string): unknown[] {
  const p = join(dir, 'events.jsonl')
  if (!existsSync(p)) return []
  const events: unknown[] = []
  for (const line of readFileSync(p, 'utf8').split('\n')) {
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

- [ ] **Step 4: Run tests and typecheck**

Run: `bun test` then `bun run typecheck`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/harness/contamination.ts tests/harness/contamination.test.ts
git commit -m "feat(harness): contamination scanner — pure post-hoc scan over persisted stream events"
```

---

### Task 7: Contamination findings in the scenario and trigger stages

**Files:**
- Modify: `src/lib/harness/llm-stages.ts`
- Modify: `src/lib/harness/trigger-stage.ts`
- Test: `tests/harness/llm-stages.test.ts`, `tests/harness/trigger-stage.test.ts`

**Interfaces:**
- Consumes: Task 6 exports.
- Produces: warn-only contamination findings in the scenario/trigger `findings` arrays; stage `status` now derives from error-severity findings only. Report/JSON shapes otherwise unchanged (clean runs byte-identical — spec §11).

- [ ] **Step 1: Write the failing tests**

Append to `tests/harness/llm-stages.test.ts` (reuse that file's existing skill/cache builders and `completed`/`gradingReply` helpers — mirror the shape of its existing live-run test):

```ts
const contaminatedExecutor = () =>
  completed('did the task', {
    events: [
      { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'compress' } }] } },
      resultEvent('did the task'),
    ],
  })

test('scenario contamination: warn finding with contractual message, status stays pass', async () => {
  // single-eval skill fixture via this file's existing builder; expectations ['ok']
  const runner = fakeRunner([contaminatedExecutor(), graderOkAllPass()])
  const { scenario, grading } = await runLlmStages(skill, { runner, cacheRoot, model: 'sonnet', fresh: false })
  expect(scenario.status).toBe('pass')
  expect(grading.status).toBe('pass')
  const warns = scenario.findings.filter(f => f.severity === 'warn')
  expect(warns).toEqual([
    { severity: 'warn', message: 'contamination: session invoked non-target skill "compress" (1 invocation(s)) [eval 1]', file: 'evals/evals.json', line: null },
  ])
})

test('scenario contamination recomputes from persisted events.jsonl on cached replay', async () => {
  // same skill + cacheRoot as a prior contaminated live run; runner with an
  // EMPTY script proves zero live calls
  const replayRunner = fakeRunner([])
  const { scenario } = await runLlmStages(skill, { runner: replayRunner, cacheRoot, model: 'sonnet', fresh: false })
  expect(scenario.runs[0].cached).toBe(true)
  expect(scenario.findings.some(f => f.message.startsWith('contamination:'))).toBe(true)
})

test('scenario invoking the TARGET skill is not contamination', async () => {
  const targetExecutor = completed('did the task', {
    events: [
      { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'demo-skill' } }] } },
      resultEvent('did the task'),
    ],
  })
  const runner = fakeRunner([targetExecutor, graderOkAllPass()])
  const { scenario } = await runLlmStages(freshSkillAndCache(), { runner, cacheRoot: freshCache, model: 'sonnet', fresh: false })
  expect(scenario.findings).toEqual([])
})
```

(Adapt the builder/helper names to the file's existing ones — the assertions and event shapes above are the contract. `demo-skill` = the fixture's `skill_name`.)

Append to `tests/harness/trigger-stage.test.ts` (same adaptation rule; trigger fixtures use `detected()`):

```ts
test('trigger contamination: warn finding with query/rep context, stage still passes', async () => {
  const contaminatedDetected = detected(true, {
    events: [
      { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'compress' } }] } },
    ],
  })
  // 1-query positive triggers.json fixture, TRIGGER_REPS reps: first rep contaminated, rest clean
  const runner = fakeRunner([contaminatedDetected, detected(true), detected(true)])
  const report = await runTriggerStage(skill, { runner, cacheRoot, model: 'sonnet', fresh: false })
  expect(report.status).toBe('pass')
  expect(report.queries).toEqual({ passed: 1, total: 1 })
  expect(report.findings).toEqual([
    { severity: 'warn', message: 'contamination: session invoked non-target skill "compress" (1 invocation(s)) [query 0 rep 1]', file: 'evals/triggers.json', line: null },
  ])
})

test('trigger contamination recomputes from disk on cached reps (empty-script runner)', async () => {
  const replay = await runTriggerStage(skill, { runner: fakeRunner([]), cacheRoot, model: 'sonnet', fresh: false })
  expect(replay.runs[0].cached).toBe(TRIGGER_REPS)
  expect(replay.findings.filter(f => f.severity === 'warn')).toHaveLength(1)
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `bun test tests/harness/llm-stages.test.ts tests/harness/trigger-stage.test.ts`
Expected: FAIL — no contamination findings emitted yet.

- [ ] **Step 3: Implement — `llm-stages.ts`**

Add imports and a warn helper:

```ts
import { contaminationMessage, readPersistedEvents, scanContamination } from './contamination'
// beside the existing err helper:
const warn = (message: string): HarnessFinding => ({ severity: 'warn', message, file: 'evals/evals.json', line: null })
```

In the cached branch (after the existing `runs.push({ evalId: …, cached: true, … })`):

```ts
        for (const hit of scanContamination(readPersistedEvents(dir), [skillName])) {
          scenarioFindings.push(warn(contaminationMessage(hit, `eval ${evalCase.id}`)))
        }
```

In the live path, immediately after the three `writeFileSync` calls (so failed runs are scanned too):

```ts
    for (const hit of scanContamination(result.events, [skillName])) {
      scenarioFindings.push(warn(contaminationMessage(hit, `eval ${evalCase.id}`)))
    }
```

Scenario status line becomes:

```ts
      status: scenarioFindings.some(f => f.severity === 'error') ? 'fail' : 'pass',
```

(The grading stage still only ever receives error findings — leave its status line as is.)

- [ ] **Step 4: Implement — `trigger-stage.ts`**

Add the same imports plus a warn helper with the trigger file convention:

```ts
import { contaminationMessage, readPersistedEvents, scanContamination } from './contamination'
const warnF = (message: string): HarnessFinding => ({ severity: 'warn', message, file: TRIGGERS, line: null })
```

In the cached-rep branch (inside `if (hit !== null) { … }`, before `continue`):

```ts
          for (const c of scanContamination(readPersistedEvents(dir), [skillName])) {
            findings.push(warnF(contaminationMessage(c, `query ${qi} rep ${rep}`)))
          }
```

In the live path, after the retry settles (`if (result.status !== 'completed') result = await attemptOnce()`) and after `reps += 1`, before the failure check:

```ts
      for (const c of scanContamination(result.events, [skillName])) {
        findings.push(warnF(contaminationMessage(c, `query ${qi} rep ${rep}`)))
      }
```

Final status line becomes:

```ts
  return { stage: 'trigger', status: findings.some(f => f.severity === 'error') ? 'fail' : 'pass', findings, queries: { passed, total: measured }, runs }
```

(The early `fail(...)` returns are untouched — those findings are all errors.)

- [ ] **Step 5: Run tests and typecheck**

Run: `bun test` then `bun run typecheck`
Expected: all pass — including the untouched clean-run report pins (warnings absent ⇒ byte-identical output) and the accuracy-threshold failure tests (error findings still flip status).

- [ ] **Step 6: Commit**

```bash
git add src/lib/harness/llm-stages.ts src/lib/harness/trigger-stage.ts tests/harness/llm-stages.test.ts tests/harness/trigger-stage.test.ts
git commit -m "feat(harness): contamination warnings in scenario and trigger stages — warn-only, status unaffected"
```

---

### Task 8: Contamination warnings in bench (pretty + stderr; stdout stays byte-pure)

**Files:**
- Modify: `src/lib/harness/bench.ts`
- Modify: `src/cli/bench.ts`
- Modify: `src/cli/format/bench-pretty.ts`
- Test: `tests/harness/bench.test.ts`, `tests/cli/bench-command.test.ts`

**Interfaces:**
- Consumes: Task 6 exports.
- Produces: `BenchOutcome` ok-variant gains `warnings: string[]`; `runLiveSample`'s ok-variant gains `events: unknown[]`; `formatBenchPretty(doc, cachedRuns, totalRuns, warnings?: string[])`. `benchmark.json` document and its `--json` stdout bytes unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `tests/harness/bench.test.ts`:

```ts
const contaminatedExecutorOk = () =>
  completed('did the task', {
    events: [
      { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'compress' } }] } },
      resultEvent('did the task'),
    ],
  })

test('9. contamination warnings: without_skill flags any invocation, with_skill allows the target', async () => {
  const { skill, cacheRoot } = makeSkill(SIMPLE_EVALS)
  const script: FakeScript = []
  for (const evalCase of SIMPLE_EVALS.evals) {
    // with_skill run invokes the TARGET skill — allowed
    script.push(completed('did the task', {
      events: [
        { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'demo-skill' } }] } },
        resultEvent('did the task'),
      ],
    }))
    script.push(graderOk(evalCase.expectations, [true]))
    // without_skill run invokes compress — contamination
    script.push(contaminatedExecutorOk())
    script.push(graderOk(evalCase.expectations, [true]))
  }
  const outcome = await runBenchSuite(skill, { runner: fakeRunner(script), cacheRoot, model: 'sonnet', runs: 1, fresh: false })
  if (!outcome.ok) throw new Error(outcome.message)
  expect(outcome.warnings).toEqual([
    'warn contamination: without_skill eval 1 run 1 invoked non-target skill "compress" (1 invocation(s))',
    'warn contamination: without_skill eval 2 run 1 invoked non-target skill "compress" (1 invocation(s))',
    'warn contamination: without_skill eval 3 run 1 invoked non-target skill "compress" (1 invocation(s))',
  ])
})

test('10. contamination warnings recompute on cached replay; document bytes identical', async () => {
  const { skill, cacheRoot } = makeSkill(SIMPLE_EVALS)
  const script: FakeScript = []
  for (const evalCase of SIMPLE_EVALS.evals) {
    script.push(executorOk())
    script.push(graderOk(evalCase.expectations, [true]))
    script.push(contaminatedExecutorOk())
    script.push(graderOk(evalCase.expectations, [true]))
  }
  const first = await runBenchSuite(skill, { runner: fakeRunner(script), cacheRoot, model: 'sonnet', runs: 1, fresh: false })
  const replay = await runBenchSuite(skill, { runner: fakeRunner([]), cacheRoot, model: 'sonnet', runs: 1, fresh: false })
  if (!first.ok || !replay.ok) throw new Error('expected ok outcomes')
  expect(replay.cachedRuns).toBe(6)
  expect(replay.warnings).toEqual(first.warnings)
  expect(readFileSync(replay.docPath, 'utf8')).toBe(readFileSync(first.docPath, 'utf8'))
})
```

Append to `tests/cli/bench-command.test.ts`:

```ts
test('contamination with --json: warnings on stderr, stdout document byte-pure', async () => {
  const { skillDir, cacheRoot } = makeSkillDir()
  const script: FakeScript = []
  for (const _evalCase of EVALS.evals) {
    script.push(executorOk())
    script.push(graderOk())
    script.push(completed('did the task', {
      events: [
        { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'compress' } }] } },
        resultEvent('did the task'),
      ],
    }))
    script.push(graderOk())
  }
  const log = spyOn(console, 'log').mockImplementation(() => {})
  const err = spyOn(console, 'error').mockImplementation(() => {})
  try {
    const code = await runBench([skillDir, '--json', '--runs', '1'], { runner: fakeRunner(script), cacheRoot })
    expect(code).toBe(0)
    expect(log.mock.calls).toHaveLength(1)
    const doc = JSON.parse(log.mock.calls[0][0] as string)
    expect(JSON.stringify(doc)).not.toContain('contamination')
    expect(err.mock.calls.map(c => c[0])).toEqual([
      'warn contamination: without_skill eval 1 run 1 invoked non-target skill "compress" (1 invocation(s))',
      'warn contamination: without_skill eval 2 run 1 invoked non-target skill "compress" (1 invocation(s))',
      'warn contamination: without_skill eval 3 run 1 invoked non-target skill "compress" (1 invocation(s))',
    ])
  } finally {
    log.mockRestore()
    err.mockRestore()
  }
})
```

(`resultEvent` comes from `../harness/helpers` — extend the existing import.)

- [ ] **Step 2: Run to verify they fail**

Run: `bun test tests/harness/bench.test.ts tests/cli/bench-command.test.ts`
Expected: FAIL — `warnings` does not exist on `BenchOutcome` (compile error).

- [ ] **Step 3: Implement — `bench.ts`**

```ts
import { contaminationMessage, readPersistedEvents, scanContamination } from './contamination'
```

`BenchOutcome` ok-variant gains `warnings`:

```ts
export type BenchOutcome =
  | { ok: true; doc: BenchmarkJson; docPath: string; cachedRuns: number; totalRuns: number; warnings: string[] }
  | { ok: false; message: string }
```

`LiveOutcome` ok-variant gains the final attempt's events:

```ts
type LiveOutcome = { ok: true; result: BenchmarkRun['result']; events: unknown[] } | { ok: false; message: string }
```

and `runLiveSample`'s success return becomes `return { ok: true, result, events: attempt.result.events }`.

In `runBenchSuite`: declare `const warnings: string[] = []` beside `rows`. The bench line format differs from the stage finding format (Global Constraints), so bench builds its own strings rather than using `contaminationMessage`. In the matrix loop, inside the per-run body:

```ts
        const allowed = config === 'with_skill' ? [skillName] : []
        const benchWarning = (hit: { skill: string; count: number }): string =>
          `warn contamination: ${config} eval ${evalCase.id} run ${runNumber} invoked non-target skill "${hit.skill}" (${hit.count} invocation(s))`
```

Cached branch (inside `if (cached !== null)` after `cachedRuns += 1`):

```ts
            for (const hit of scanContamination(readPersistedEvents(dir), allowed)) warnings.push(benchWarning(hit))
```

Live branch (after `if (!live.ok) return live`):

```ts
          for (const hit of scanContamination(live.events, allowed)) warnings.push(benchWarning(hit))
```

Success return: `return { ok: true, doc: benchDoc, docPath, cachedRuns, totalRuns: cases.length * CONFIGS.length * options.runs, warnings }`.

- [ ] **Step 4: Implement — `bench-pretty.ts` and `cli/bench.ts`**

`formatBenchPretty` gains a defaulted param and appends warning lines verbatim at the end:

```ts
export function formatBenchPretty(doc: BenchmarkJson, cachedRuns: number, totalRuns: number, warnings: string[] = []): string {
  …
  return [
    …existing five lines…,
    ...warnings,
  ].join('\n')
}
```

`src/cli/bench.ts` success branch becomes:

```ts
    if (json) {
      for (const w of outcome.warnings) console.error(w)
      console.log(JSON.stringify(outcome.doc, null, 2))
    } else {
      console.log(formatBenchPretty(outcome.doc, outcome.cachedRuns, outcome.totalRuns, outcome.warnings))
    }
    return 0
```

- [ ] **Step 5: Run tests and typecheck**

Run: `bun test` then `bun run typecheck`
Expected: all pass — the existing golden-document and replay byte-identity tests prove clean-run output is unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/lib/harness/bench.ts src/cli/bench.ts src/cli/format/bench-pretty.ts tests/harness/bench.test.ts tests/cli/bench-command.test.ts
git commit -m "feat(bench): contamination warnings — pretty summary lines and --json stderr, stdout byte-pure"
```

---

### Task 9: `extractGraderJson` prose tolerance

**Files:**
- Modify: `src/lib/harness/grader.ts:51-65`
- Test: `tests/harness/grader.test.ts`

**Interfaces:**
- Consumes/produces: `extractGraderJson(finalText: string): unknown | undefined` — signature unchanged; strictly more inputs now parse. Retry prompt, gates, retry-cause strings, fail-fast, uncached-failure semantics untouched (spec §6.1).

- [ ] **Step 1: Write the failing tests**

Append to `tests/harness/grader.test.ts`:

```ts
test('extractGraderJson prose tolerance (spec §6.1)', () => {
  const doc = { expectations: [], summary: { passed: 0, failed: 0, total: 0, pass_rate: 0 } }
  const json = JSON.stringify(doc)
  // observed live shapes from the M4b-2 sweep (CALIBRATION-M4B2 adjudication 2)
  expect(extractGraderJson(`Here is my grading:\n${json}`)).toEqual(doc)
  expect(extractGraderJson(`${json}\nHope that helps!`)).toEqual(doc)
  expect(extractGraderJson(`Sure — grading below.\n${json}\nLet me know.`)).toEqual(doc)
  expect(extractGraderJson(`Sure!\n\`\`\`json\n${json}\n\`\`\``)).toEqual(doc) // prose BEFORE a fence defeats the fence-unwrap; brace fallback catches it
  // nested braces stay intact under outermost-brace slicing
  const nested = { a: { b: 1 } }
  expect(extractGraderJson(`prefix ${JSON.stringify(nested)} suffix`)).toEqual(nested)
  // still undefined when there is no parsable object
  expect(extractGraderJson('no json here')).toBeUndefined()
  expect(extractGraderJson('prefix {not json} suffix')).toBeUndefined()
  expect(extractGraderJson('}{')).toBeUndefined()
})
```

(Extend the file's existing `extractGraderJson` import; its existing fence/plain cases stay untouched.)

- [ ] **Step 2: Run to verify it fails**

Run: `bun test tests/harness/grader.test.ts`
Expected: FAIL — prose-wrapped cases return `undefined` today.

- [ ] **Step 3: Implement**

Replace the body of `extractGraderJson` (doc comment updated):

```ts
/**
 * Trim; unwrap a single fenced block (with or without a language tag);
 * JSON.parse. If that fails, fall back to the outermost-brace slice of the
 * unwrapped body — tolerates grader replies that wrap the JSON in prose
 * (spec §6.1). undefined = no parsable object.
 */
export function extractGraderJson(finalText: string): unknown | undefined {
  let body = finalText.trim()
  if (body.startsWith('```')) {
    const firstNewline = body.indexOf('\n')
    const lastFence = body.lastIndexOf('```')
    if (firstNewline !== -1 && lastFence > firstNewline) {
      body = body.slice(firstNewline + 1, lastFence).trim()
    }
  }
  try {
    return JSON.parse(body)
  } catch {
    const first = body.indexOf('{')
    const last = body.lastIndexOf('}')
    if (first === -1 || last <= first) return undefined
    try {
      return JSON.parse(body.slice(first, last + 1))
    } catch {
      return undefined
    }
  }
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `bun test` then `bun run typecheck`
Expected: all pass (grade-case retry tests still pass — a reply that now parses simply skips the retry, which the shared-budget contract permits; verify no grade-case test scripts a prose-wrapped reply as a FORCED gate failure — if one does, it is NOT a sanctioned re-pin: give the scripted reply a genuinely unparsable body instead, preserving the assertion).

- [ ] **Step 5: Commit**

```bash
git add src/lib/harness/grader.ts tests/harness/grader.test.ts
git commit -m "fix(grader): extractGraderJson tolerates prose-wrapped replies via outermost-brace fallback"
```

---

### Task 10: Failed grader replies persist to the run dir

**Files:**
- Modify: `src/lib/harness/grader.ts` (`gradeCase`, lines ~152–160)
- Test: `tests/harness/grade-case.test.ts`

**Interfaces:**
- Produces: `<runDir>/grader-fail-<attempt>.md` (attempt ∈ {1, 2}) written verbatim on each gate-kind attempt failure, before retry/fail-fast. Runner-kind failures (timeout / nonzero-exit / no-reply) persist nothing — there is no reply text. `grading.json` write semantics unchanged (spec §6.2).

- [ ] **Step 1: Write the failing tests**

Append to `tests/harness/grade-case.test.ts` (reuse its existing `gradeCase` fixture builder — every test there already creates a temp `dir`):

```ts
test('gate failure then success: grader-fail-1.md persists beside grading.json', async () => {
  const badReply = completed('utterly not json, no braces at all')
  const runner = fakeRunner([badReply, completed(gradingReply([{ text: 'ok', passed: true }]))])
  const result = await gradeCase({ evalCase, dir, runner, model: 'sonnet', executorDurationSeconds: 1, metrics })
  expect('grading' in result).toBe(true)
  expect(readFileSync(join(dir, 'grader-fail-1.md'), 'utf8')).toBe('utterly not json, no braces at all')
  expect(existsSync(join(dir, 'grader-fail-2.md'))).toBe(false)
})

test('double gate failure: both fail files persist, no grading.json (uncached failure)', async () => {
  const runner = fakeRunner([completed('first bad reply'), completed('second bad reply')])
  const result = await gradeCase({ evalCase, dir, runner, model: 'sonnet', executorDurationSeconds: 1, metrics })
  expect('failure' in result).toBe(true)
  expect(readFileSync(join(dir, 'grader-fail-1.md'), 'utf8')).toBe('first bad reply')
  expect(readFileSync(join(dir, 'grader-fail-2.md'), 'utf8')).toBe('second bad reply')
  expect(existsSync(join(dir, 'grading.json'))).toBe(false)
})

test('runner-kind failure persists no fail file; clean grading persists none', async () => {
  const runner = fakeRunner([failed('timeout', 'hung'), completed(gradingReply([{ text: 'ok', passed: true }]))])
  const result = await gradeCase({ evalCase, dir, runner, model: 'sonnet', executorDurationSeconds: 1, metrics })
  expect('grading' in result).toBe(true)
  expect(existsSync(join(dir, 'grader-fail-1.md'))).toBe(false)
  expect(existsSync(join(dir, 'grader-fail-2.md'))).toBe(false)
})
```

(Adapt `evalCase`/`dir`/`metrics` to the file's existing fixture names. Note the bad replies must contain NO braces so the Task 9 fallback cannot rescue them.)

- [ ] **Step 2: Run to verify they fail**

Run: `bun test tests/harness/grade-case.test.ts`
Expected: FAIL — no `grader-fail-*.md` files are written today.

- [ ] **Step 3: Implement**

In `gradeCase`, around the existing retry block:

```ts
  let attempt = await call(original)
  if (attempt.kind === 'gate') writeFileSync(join(args.dir, 'grader-fail-1.md'), attempt.reply)
  let retryCause: string | null = null
  if (attempt.kind !== 'ok') {
    retryCause =
      attempt.kind === 'gate' ? `gate: invalid grading (${attempt.problems[0]})` : `runner: ${attempt.failure}`
    const retryPrompt =
      attempt.kind === 'gate' ? buildGraderRetryPrompt(original, attempt.problems, attempt.reply) : original
    attempt = await call(retryPrompt)
    if (attempt.kind === 'gate') writeFileSync(join(args.dir, 'grader-fail-2.md'), attempt.reply)
  }
```

(Nothing else in `gradeCase` changes.)

- [ ] **Step 4: Run tests and typecheck**

Run: `bun test` then `bun run typecheck`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/harness/grader.ts tests/harness/grade-case.test.ts
git commit -m "feat(grader): persist failed grader replies as grader-fail-<attempt>.md — closes the observability gap"
```

---

### Task 11: Bench test-hygiene minors (spec §9)

**Files:**
- Modify: `src/lib/harness/bench.ts` (dead defensive branch)
- Modify: `tests/harness/helpers.ts` (shared bench fixture builder)
- Modify: `tests/harness/bench.test.ts`, `tests/cli/bench-command.test.ts`

Item 4 of spec §9 (unused `existsSync` import in `trigger-stage.test.ts`) **already landed in f6963b8** — verify with `git log -1 f6963b8 -- tests/harness/trigger-stage.test.ts` and note "already landed" in the commit body; do not redo it.

- [ ] **Step 1: Dead defensive branch → invariant throw (spec §9.1)**

In `runLiveSample` (bench.ts), the post-grading null check becomes an invariant throw — `gradeCase` only returns validated documents, so a null derivation is a bug, not an executor failure; it leaves the run-failure contract (exit 1) and joins internal errors (exit 2 via the CLI catch):

```ts
  const result = deriveBenchResult(graded.grading)
  if (result === null) throw new Error(failMessage('internal: grading document missing derivable metrics'))
  return { ok: true, result, events: attempt.result.events }
```

Verify nothing pins the old shape: `grep -rn "missing derivable" tests/` — expected: no matches (the `deriveBenchResult` unit test exercises the function directly).

- [ ] **Step 2: Extract the duplicated fixture builder (spec §9.2)**

Add to `tests/harness/helpers.ts`:

```ts
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { EvalsJson } from '../../src/lib/evals/types'

/** On-disk demo-skill fixture shared by the bench pipeline and bench CLI tests. */
export function makeBenchSkillDir(evalsDoc: EvalsJson, prefix = 'shakespii-bench-skill-'): { dir: string; cacheRoot: string } {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  writeFileSync(join(dir, 'SKILL.md'), '---\nname: demo-skill\ndescription: Use when testing bench pipeline plumbing.\nversion: 1.0.0\n---\n\n# Demo\n')
  mkdirSync(join(dir, 'evals'), { recursive: true })
  writeFileSync(join(dir, 'evals/evals.json'), JSON.stringify(evalsDoc))
  return { dir, cacheRoot: mkdtempSync(join(tmpdir(), 'shakespii-bench-cache-')) }
}
```

Rewire `tests/harness/bench.test.ts`'s `makeSkill` to delegate (keeping its parse step and return shape so its ~10 call sites don't change):

```ts
function makeSkill(evalsDoc: EvalsJson): { skill: ReturnType<typeof parseSkill>; cacheRoot: string } {
  const { dir, cacheRoot } = makeBenchSkillDir(evalsDoc)
  return { skill: parseSkill(dir), cacheRoot }
}
```

Rewire `tests/cli/bench-command.test.ts`'s `makeSkillDir` the same way:

```ts
function makeSkillDir(): { skillDir: string; cacheRoot: string } {
  const { dir, cacheRoot } = makeBenchSkillDir(EVALS, 'shakespii-bench-cli-skill-')
  return { skillDir: dir, cacheRoot }
}
```

(The SKILL.md description strings in the two files differ trivially today — "bench CLI plumbing" vs "bench pipeline plumbing"; the shared builder standardizes on the latter, which no assertion pins. Verify: `grep -rn "plumbing" tests/` shows only the builders.)

- [ ] **Step 3: Tighten the json-failure assertion (spec §9.3)**

In `tests/cli/bench-command.test.ts`, the `'run failure with --json'` test gains the single-call pin the pretty variant already has:

```ts
    expect(log.mock.calls).toHaveLength(1)
    expect(log.mock.calls[0][0]).toBe(JSON.stringify({ error: 'bench run failed (eval 1, with_skill, run 1): executor timeout — hung again' }))
```

- [ ] **Step 4: Gate zero-spawn via injected fake (spec §9.5)**

Append to `tests/cli/bench-command.test.ts` (keep the existing subprocess gate tests — they pin exit code and message; this adds the direct no-spawn proof):

```ts
test('deterministic gate: injected runner is never called', async () => {
  const runner = fakeRunner([])
  const err = spyOn(console, 'error').mockImplementation(() => {})
  try {
    const code = await runBench([join(FIXTURES, 'bad-evals')], { runner, cacheRoot: mkdtempSync(join(tmpdir(), 'shakespii-bench-gate-')) })
    expect(code).toBe(2)
    expect(runner.requests).toHaveLength(0)
  } finally {
    err.mockRestore()
  }
})
```

- [ ] **Step 5: Run tests and typecheck, then commit**

Run: `bun test` then `bun run typecheck`
Expected: all pass; no assertion weakened (Steps 3–4 only strengthen).

```bash
git add src/lib/harness/bench.ts tests/harness/helpers.ts tests/harness/bench.test.ts tests/cli/bench-command.test.ts
git commit -m "test(bench): hygiene minors — shared fixture builder, invariant throw, tightened json-failure pin, injected-fake gate proof"
```

---

### Task 12: Eval-5 rewording (adjudicated application, spec §10)

**Files:**
- Modify: `skills/using-shakespii/evals/evals.json` (eval id 5, `prompt` field ONLY)
- Modify: `docs/CALIBRATION-M5A.md` (+ canonical mirror)

**Interfaces:**
- Consumes: the CALIBRATION-M4B2 adjudication-5 recorded candidate.
- Produces: the narrowed prompt; adjudication entry 1 in CALIBRATION-M5A.md. `expected_output` and all three expectations byte-untouched. SKILL.md untouched → no version bump. skillHash rotation is moot (epoch already rotated every key).

- [ ] **Step 1: Apply the exact replacement**

In `skills/using-shakespii/evals/evals.json`, eval id 5:

- Old prompt: `Audit all my installed skills for duplication and near-clones.`
- New prompt: `Audit all my installed skills for duplication and near-clones. Keep it to a single corpus lint pass and a summary of the flagged findings — don't inspect skills beyond the flagged sites.`

Verify the diff is exactly one line: `git diff --stat` → `1 file changed, 1 insertion(+), 1 deletion(-)`.

- [ ] **Step 2: Check nothing pins the old prompt**

Run: `grep -rn "Audit all my installed skills" tests/ src/ docs/superpowers/plans/2026-07-09-m5a-harness-hardening.md`
Expected: no test/src matches (this plan file and calibration docs referencing it historically are fine). If a test pins it, that is a sanctioned re-pin — update it and name it in the commit body.

- [ ] **Step 3: Record adjudication entry 1**

In `docs/CALIBRATION-M5A.md` under `## Adjudication`, replace the placeholder line with:

```markdown
1. **Eval-5 rewording applied (user-adjudicated, spec §10).** The CALIBRATION-M4B2
   adjudication-5 candidate — narrow the corpus-audit prompt to bound session
   length (observed: timeout in the M4b-2 pre-warm, ok at 262 s in the sweep,
   near the 300 s budget) — is applied here by user decision (spec §0.3),
   overriding the parked-with-migration default. Before/after:
   - old: "Audit all my installed skills for duplication and near-clones."
   - new: "Audit all my installed skills for duplication and near-clones. Keep it
     to a single corpus lint pass and a summary of the flagged findings — don't
     inspect skills beyond the flagged sites."
   `expected_output` and expectations unchanged. The CALIBRATION-M4B1 compress
   rewordings remain parked with the M5d migration.
```

- [ ] **Step 4: Run gates, sync mirror, commit**

Run: `bun test` then `bun run typecheck`
Expected: all pass (evals.json content is exercised structurally, not by prompt text).

```bash
cp docs/CALIBRATION-M5A.md ~/.ai-pref-nsync/local-docs/ai-shakespii/knowledge-references/CALIBRATION-M5A.md
cmp docs/CALIBRATION-M5A.md ~/.ai-pref-nsync/local-docs/ai-shakespii/knowledge-references/CALIBRATION-M5A.md && echo MIRROR-OK
git add skills/using-shakespii/evals/evals.json docs/CALIBRATION-M5A.md
git commit -m "feat(evals): narrow using-shakespii eval-5 corpus-audit prompt — adjudicated application of the M4b-2 candidate"
```

---

### Task 13: Calibration re-sweep (controller-executed, live — spec §14)

**Files:**
- Modify: `docs/CALIBRATION-M5A.md` (+ canonical mirror) — predictions commit FIRST, then actuals/adjudication/proofs
- Scratch: `/tmp/m5a-bench-actual.json`, `/tmp/m5a-triggers-actual.json`, `/tmp/m5a-triggers-replay.json`, `/tmp/m5a-retro-scan.txt`, sweep logs under `/tmp/`

Sequencing (spec §14): Tasks 2–12 committed and green → predictions committed → sweeps → retro-scan → cache proofs → actuals + adjudication committed. Long sweeps run detached (`nohup bash -c '…; echo "SWEEP-EXIT=$?" >> <log>' &`) with Monitor until-loops on the exit marker — the Bash tool caps at 10 minutes.

- [ ] **Step 1: Predictions (commit BEFORE any sweep)**

Fill `## Predictions` in CALIBRATION-M5A.md with concrete predicted values/bands, each with a confidence tag, covering at minimum:
1. Bench `without_skill` pass_rate mean — predicted to DROP from the contaminated 1.0 (the global compress skill no longer answers for the bare config).
2. Bench delta pass_rate — predicted to flip non-negative (M4b-2 measured −0.11 under contamination).
3. Trigger accuracy — predicted band (M4b-2 measured 1.00; isolation should not regress staged-skill resolution).
4. Grader retry rate band across all gradings (Task 9 tolerance should cut the observed ~25% non-JSON rate).
5. Contamination findings in the NEW isolated sweeps — predicted ZERO warnings.
6. Retro-scan of archived M4b-2 without_skill events — predicted to flag `compress`.

Commit (with mirror cp + cmp): `git commit -m "docs(calibration): M5a predictions — committed before any sweep"`.

- [ ] **Step 2: Bench re-sweep (compress fixture, 18 live runs)**

```bash
nohup bash -c 'cd /Users/vuphan/Dev/ai-shakespii && bun run src/cli/index.ts bench tests/fixtures/harness/compress --json > /tmp/m5a-bench-actual.json 2>/tmp/m5a-bench-actual.err; echo "SWEEP-EXIT=$?" >> /tmp/m5a-bench-sweep.log' &
```

Monitor until `SWEEP-EXIT=` appears. On fail-fast (exit 1), re-run the same command — cache resume re-executes only the failed run (the M4b-2 recovery pattern). Repeat until exit 0. Stderr carries any contamination warnings — capture verbatim.

- [ ] **Step 3: Trigger re-sweep (using-shakespii, 20 queries × 3 reps + scenario)**

```bash
nohup bash -c 'cd /Users/vuphan/Dev/ai-shakespii && bun run src/cli/index.ts test skills/using-shakespii --run --triggers --json > /tmp/m5a-triggers-actual.json 2>/tmp/m5a-triggers-actual.err; echo "SWEEP-EXIT=$?" >> /tmp/m5a-trigger-sweep.log' &
```

Monitor as above. Note: the eval-5 scenario runs under its NEW prompt (Task 12) — its duration is itself calibration evidence for the rewording.

- [ ] **Step 4: Retro-scan of archived M4b-2 artifacts**

```bash
bun -e '
import { readdirSync, existsSync } from "node:fs"
import { join } from "node:path"
import { readPersistedEvents, scanContamination } from "./src/lib/harness/contamination"
const root = join(process.env.HOME!, ".cache/shakespii/runs/compress")
let flagged = 0, bare = 0
for (const key of readdirSync(root)) {
  const dir = join(root, key)
  if (!existsSync(join(dir, "events.jsonl")) || !existsSync(join(dir, "grading.json"))) continue
  if (existsSync(join(dir, "outputs/.claude"))) continue // mounted ⇒ with_skill/scenario, skip
  bare += 1
  const hits = scanContamination(readPersistedEvents(dir), [])
  if (hits.some(h => h.skill === "compress")) { flagged += 1; console.log(`${key}: ${JSON.stringify(hits)}`) }
}
console.log(`RETRO-SCAN bare=${bare} flaggedCompress=${flagged}`)
' | tee /tmp/m5a-retro-scan.txt
```

Expected: `flaggedCompress ≥ 1` (CALIBRATION-M4B2 documented three contaminated runs). This is the live proof the guard would have caught the M4b-2 incident.

- [ ] **Step 5: Cache proofs**

1. **BENCH-REPLAY-OK:** re-run the Step 2 command into `/tmp/m5a-bench-replay.json`; `cmp /tmp/m5a-bench-actual.json /tmp/m5a-bench-replay.json` silent; pretty re-run reports `18/18 run(s) cached`.
2. **TRIGGER-REPLAY-OK:** re-run Step 3 into `/tmp/m5a-triggers-replay.json`; compare with the M4b-2 adjudication-4 procedure — a `bun -e` field-level diff that normalizes cache metadata ONLY (trigger `cached` counts; scenario `cached`/`durationSeconds`) and additionally asserts the replay is fully cached in BOTH stages. Any non-cache-metadata difference fails the proof.

- [ ] **Step 6: Actuals + adjudication (verbatim), commit**

In CALIBRATION-M5A.md record: the full `benchmark.json` VERBATIM; the trigger stage object VERBATIM; captured stderr warnings (expected: none); the retro-scan output verbatim; per-prediction actual vs predicted table; adjudication entries for every miss (classes: harness bug / miscalibration / eval-authoring miss); rewordings recorded-never-applied (except the pre-applied eval-5, already entry 1); cache-proof results. Mirror cp + cmp, then:

```bash
git add docs/CALIBRATION-M5A.md
git commit -m "docs(calibration): M5a actuals, adjudication, retro-scan evidence, cache proofs"
```

---

### Task 14: Docs closeout (spec §15)

**Files:**
- Modify: `docs/HARNESS.md`, `docs/ROADMAP.md`, `README.md` (+ canonical mirrors for HARNESS/ROADMAP)

- [ ] **Step 1: HARNESS.md**

Add/update sections: executor isolation contract (§3 argv, uniform policy, spike-proven); contamination findings (scanner semantics, allowed sets, the three contractual formats, warn-never-flips-status, stderr rule for `bench --json`); `RUN_CACHE_VERSION`/`HARNESS_SCHEMA_VERSION` split with the four epoch-2 key formulas; `grader-fail-<attempt>.md` artifacts; `SETTLE_OUTER_BOUND_MS`. Copy exact strings from Global Constraints — no paraphrase drift.

- [ ] **Step 2: ROADMAP.md**

Restructure `## M5 — Writer + publishing` into `## M5a — Harness hardening + executor isolation (done 2026-07-09)` (tick all items with commit ranges), `## M5b — Writer-as-skill`, `## M5c — Install gate + npm publish`, `## M5d — Personal-skill migration` per spec §0.1, moving the existing M5 bullets into their new homes (writer + description optimization → M5b; install gate + npm publish graduation → M5c; migration bullet verbatim → M5d; ai-cortex promotion path listed under M5b with a "writer-or-later, not yet decided" note in Open decisions).

- [ ] **Step 3: README.md**

Update the bench caveat: baseline contamination is now mitigated (isolation) and detected (warnings); keep the untrusted-skills safety warning.

- [ ] **Step 4: Mirrors, gates, commit**

```bash
cp docs/HARNESS.md ~/.ai-pref-nsync/local-docs/ai-shakespii/knowledge-references/HARNESS.md
cp docs/ROADMAP.md ~/.ai-pref-nsync/local-docs/ai-shakespii/plans/ROADMAP.md
cmp docs/HARNESS.md ~/.ai-pref-nsync/local-docs/ai-shakespii/knowledge-references/HARNESS.md && cmp docs/ROADMAP.md ~/.ai-pref-nsync/local-docs/ai-shakespii/plans/ROADMAP.md && echo MIRRORS-OK
bun test && bun run typecheck
git add docs/HARNESS.md docs/ROADMAP.md README.md
git commit -m "docs(m5a): close out M5a — harness contracts, roadmap M5a-M5d restructure, README bench caveat"
```

Expected: MIRRORS-OK; suite green; typecheck exit 0; tree clean after commit.

---

## Execution notes

- **Task order is the commit order.** Tasks 2–11 are independent of the sweeps but MUST all land before Task 12 (eval edit), which lands before Task 13 Step 1 (predictions) — spec §14 sequencing.
- **Task 1 gate:** no Task 2+ work before the spike PASSES all four assertions.
- **Verification at every commit:** unpiped `bun test` (expect 0 fail) and `bun run typecheck` (expect exit 0).
- **Final verification** (after Task 14): `bun test`, `bun run typecheck`, `git status --short` empty, both cache proofs recorded, CALIBRATION-M5A.md complete with verbatim actuals.
