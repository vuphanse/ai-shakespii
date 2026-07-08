# M4b-1 Test Harness LLM Half (Executor + Grader) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `shakespii test <path> --run` executes a skill's eval suite end to end — headless `claude -p` executor per eval case, LLM rubric grader writing validated `grading.json` into the M4a run-dir cache — with deterministic cache replay and unchanged exit-code semantics.

**Architecture:** One injected `ClaudeRunner` boundary (real impl = `Bun.spawn` around `claude -p --output-format stream-json`); everything else is pure orchestration over runner + filesystem: stream-json parsing → workspace staging → executor → grader gates → atomic `grading.json` persistence → stage reports. The whole test suite runs tokenless via a scripted `FakeRunner` and stub executables.

**Tech Stack:** Bun + TypeScript (strict), `bun test`, node:fs/node:path/node:crypto. No new dependencies.

**Spec:** `docs/specs/2026-07-08-m4b1-harness-executor-grader-design.md` (approved; includes §13.1 amendment — executed grading stage carries `expectations: { passed, total }`).

## Global Constraints

- Contractual strings — copy verbatim, never paraphrase:
  - usage: `usage: shakespii test <path> [--json] [--run] [--fresh] [--model <name>]`
  - flag guards: `--fresh requires --run`, `--model requires --run`, `--model requires a value` (each followed by newline + usage, exit 2); unknown flags keep `unknown option: <flag>` + usage.
  - skip notes: `pass --run to execute LLM stages` (no `--run`) and `deterministic stage failed` (`--run` + deterministic errors).
  - runner error: `claude CLI not found — install Claude Code or put claude on PATH` (thrown as `ClaudeUnavailableError`; CLI surfaces it as `test failed: <msg>`, exit 2).
  - executor finding: `` eval <id>: executor <status> — <errorMessage or 'no result event'> `` with `<status>` ∈ `timeout | nonzero-exit | no-result`.
  - grader findings: `` eval <id>: grader <status> — <errorMessage or 'no reply text'> `` (`<status>` ∈ `timeout | nonzero-exit | no-reply`), `` eval <id>: grader returned invalid grading (<first problem>) ``, `` eval <id> expectation failed: "<text>" — <evidence truncated to 200 chars with trailing …> ``.
  - executor prompt and grader prompt templates: exactly as written in Tasks 3 and 4.
  - pretty summary variants: exactly as written in Task 8.
- Constants: `DEFAULT_MODEL = 'sonnet'`, `RUN_TIMEOUT_MS = 300_000`. `HARNESS_SCHEMA_VERSION` stays 1.
- test-JSON stays `version: 1`. Key orders contractual: top `version, mode, skill, stages, summary`; findings `severity, message, file, line`; runs `evalId, cached, status, durationSeconds`; executed scenario `stage, status, findings, runs`; executed grading `stage, status, findings, expectations` (`passed, total`); skipped `stage, status, note`.
- Cache-hit definition: `grading.json` exists under the runKey **and** passes `validateGradingJson` **and** rubric fidelity (expectation texts verbatim, same count/order vs the current eval). Anything else is a self-healing miss.
- Frozen surfaces: lint CLI/JSON v1 byte-identical; `profiles/default.yaml` untouched; `src/lib/rules/TR01.ts` untouched; `runDeterministic` behavior unchanged; scaffold keystone `{errors: 20, warnings: 0}`; live corpus (`~/.claude/skills/`, superpowers cache) read-only and untouched.
- Every test that touches the cache passes an explicit temp `cacheRoot` (or sets `SHAKESPII_CACHE_DIR` for subprocess tests). No test reads or writes `~/.cache/shakespii`. No test spawns the real `claude` — only scripted fakes and stub shell scripts.
- TDD: write the failing test, run it (unpiped `bun test <file>`, exit code preserved), implement, re-run, commit. Full-suite `bun test` and `bun run typecheck` must be green at every commit — single documented exception: Tasks 7 and 8 commit with their scoped suites + typecheck green while old CLI pins await Task 9's re-pins; Task 9's commit restores the full-suite gate (see Task 7 Step 4).
- Docs are dual-location: canonical `~/.ai-pref-nsync/local-docs/ai-shakespii/<subdir>/`, repo mirror; sync with `cp` + `cmp` in the same task that edits them.
- **Sequencing rule (spec §10, binding):** Task 10 (calibration — the only task that spends tokens) runs BEFORE Task 11 (using-shakespii v0.4.0). At sweep time using-shakespii has exactly 5 eval cases; budget is 5 + 3 = 8 executor sessions + 8 grader calls on sonnet; second sweep proves 8/8 cached. The sixth eval case is never executed with `--run` in M4b-1.
- Never weaken an assertion to absorb a new finding. Keystone re-pins listed in Tasks 7–9 and 11 are exact-string swaps only.

**Model allocation guidance (for subagent-driven execution):** Tasks 1, 3, 4, 8, 12 are transcription-complete (full code in plan) → cheapest tier. Tasks 2, 5, 6, 7, 9, 11 touch shared types/multi-file wiring or subtle process behavior → mid tier. Task 10 spends real tokens and adjudicates calibration → mid tier. Reviewers ≥ implementer tier; final whole-branch review on the strongest available model.

---

### Task 1: Stream-json parsing module

**Files:**
- Create: `src/lib/harness/stream-json.ts`
- Create: `tests/harness/stream-json.test.ts`
- Create: `tests/fixtures/harness/stream-json/basic.jsonl`
- Create: `tests/fixtures/harness/stream-json/no-result.jsonl`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ExecutionMetrics`, `extractFinalText(events): string | null`, `extractUsage(events): { inputTokens: number; outputTokens: number } | null`, `deriveMetrics(events, transcript): ExecutionMetrics`, `renderTranscript({skillName, evalId, prompt, events}): string` — consumed by Tasks 2, 5, 6.

- [ ] **Step 1: Write the fixtures**

`tests/fixtures/harness/stream-json/basic.jsonl` (hand-authored per spec §4 shapes; one garbage line on purpose):

```
{"type":"system","subtype":"init","session_id":"abc"}
{"type":"assistant","message":{"content":[{"type":"text","text":"Reading the skill."},{"type":"tool_use","name":"Read","input":{"file_path":".claude/skills/demo/SKILL.md"}}]}}
{"type":"user","message":{"content":[{"type":"tool_result","is_error":false,"content":"# demo skill"}]}}
{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Write","input":{"file_path":"out.md","content":"done"}}]}}
{"type":"user","message":{"content":[{"type":"tool_result","is_error":true,"content":"permission denied"}]}}
not json at all
{"type":"result","result":"Task complete.","usage":{"input_tokens":123,"output_tokens":45},"num_turns":4,"duration_ms":6100,"is_error":false}
```

`tests/fixtures/harness/stream-json/no-result.jsonl`:

```
{"type":"assistant","message":{"content":[{"type":"text","text":"Working."}]}}
```

- [ ] **Step 2: Write the failing tests**

`tests/harness/stream-json.test.ts`:

```ts
import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { deriveMetrics, extractFinalText, extractUsage, renderTranscript } from '../../src/lib/harness/stream-json'

const FIXTURES = join(import.meta.dir, '../fixtures/harness/stream-json')

const loadEvents = async (name: string): Promise<unknown[]> => {
  const raw = await Bun.file(join(FIXTURES, name)).text()
  const events: unknown[] = []
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t) continue
    try {
      events.push(JSON.parse(t))
    } catch {
      // tolerant reader: garbage lines are skipped, mirroring the runner
    }
  }
  return events
}

test('extractFinalText returns the result event text', async () => {
  expect(extractFinalText(await loadEvents('basic.jsonl'))).toBe('Task complete.')
})

test('extractFinalText is null without a result event', async () => {
  expect(extractFinalText(await loadEvents('no-result.jsonl'))).toBeNull()
})

test('extractUsage reads the result event usage block', async () => {
  expect(extractUsage(await loadEvents('basic.jsonl'))).toEqual({ inputTokens: 123, outputTokens: 45 })
  expect(extractUsage(await loadEvents('no-result.jsonl'))).toBeNull()
})

test('deriveMetrics counts tools, errors, turns, tokens', async () => {
  const events = await loadEvents('basic.jsonl')
  const transcript = renderTranscript({ skillName: 'demo', evalId: 1, prompt: 'Do the thing.', events })
  expect(deriveMetrics(events, transcript)).toEqual({
    tool_calls: { Read: 1, Write: 1 },
    total_tool_calls: 2,
    errors_encountered: 1,
    num_turns: 4,
    input_tokens: 123,
    output_tokens: 45,
    transcript_chars: transcript.length,
  })
})

test('deriveMetrics on an empty stream is all zeros', () => {
  expect(deriveMetrics([], '')).toEqual({
    tool_calls: {},
    total_tool_calls: 0,
    errors_encountered: 0,
    num_turns: 0,
    input_tokens: 0,
    output_tokens: 0,
    transcript_chars: 0,
  })
})

test('renderTranscript carries the contractual headings in event order', async () => {
  const events = await loadEvents('basic.jsonl')
  const out = renderTranscript({ skillName: 'demo', evalId: 1, prompt: 'Do the thing.', events })
  expect(out).toStartWith('# Transcript — demo eval 1\n\n## Prompt\n\nDo the thing.\n')
  expect(out).toContain('## Assistant\n\nReading the skill.')
  expect(out).toContain('**Tool: Read** — {"file_path":".claude/skills/demo/SKILL.md"}')
  expect(out).toContain('## Tool result\n\n# demo skill')
  expect(out).toContain('## Tool result\n\npermission denied')
  expect(out).toContain('## Result\n\nTask complete.')
  const order = ['## Prompt', '## Assistant', '## Tool result', '## Result']
  let last = -1
  for (const h of order) {
    const i = out.indexOf(h)
    expect(i).toBeGreaterThan(last)
    last = i
  }
})

test('renderTranscript truncates tool input at 500 and tool result at 2000 chars', () => {
  const bigInput = { data: 'x'.repeat(600) }
  const events = [
    { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Write', input: bigInput }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', is_error: false, content: 'y'.repeat(2100) }] } },
  ]
  const out = renderTranscript({ skillName: 's', evalId: 2, prompt: 'p', events })
  expect(out).toContain(`${JSON.stringify(bigInput).slice(0, 500)}…`)
  expect(out).not.toContain('x'.repeat(501))
  expect(out).toContain(`${'y'.repeat(2000)}…`)
  expect(out).not.toContain('y'.repeat(2001))
})

test('renderTranscript without a result event prints the placeholder', () => {
  const out = renderTranscript({ skillName: 's', evalId: 3, prompt: 'p', events: [] })
  expect(out).toContain('## Result\n\n(no result event)')
})
```

- [ ] **Step 3: Run to verify failure**

Run: `bun test tests/harness/stream-json.test.ts`
Expected: FAIL — cannot resolve `../../src/lib/harness/stream-json`.

- [ ] **Step 4: Implement**

`src/lib/harness/stream-json.ts`:

```ts
export interface ExecutionMetrics {
  tool_calls: Record<string, number>
  total_tool_calls: number
  errors_encountered: number
  num_turns: number
  input_tokens: number
  output_tokens: number
  transcript_chars: number
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const truncate = (s: string, max: number): string => (s.length > max ? `${s.slice(0, max)}…` : s)

function contentBlocks(event: unknown): Record<string, unknown>[] {
  if (!isRecord(event) || !isRecord(event.message) || !Array.isArray(event.message.content)) return []
  return event.message.content.filter(isRecord)
}

function resultEvent(events: unknown[]): Record<string, unknown> | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (isRecord(e) && e.type === 'result') return e
  }
  return null
}

export function extractFinalText(events: unknown[]): string | null {
  const r = resultEvent(events)
  return r && typeof r.result === 'string' ? r.result : null
}

export function extractUsage(events: unknown[]): { inputTokens: number; outputTokens: number } | null {
  const r = resultEvent(events)
  if (!r || !isRecord(r.usage)) return null
  const input = r.usage.input_tokens
  const output = r.usage.output_tokens
  if (typeof input !== 'number' || typeof output !== 'number') return null
  return { inputTokens: input, outputTokens: output }
}

export function deriveMetrics(events: unknown[], transcript: string): ExecutionMetrics {
  const toolCalls: Record<string, number> = {}
  let total = 0
  let errors = 0
  for (const e of events) {
    if (!isRecord(e)) continue
    if (e.type === 'assistant') {
      for (const b of contentBlocks(e)) {
        if (b.type === 'tool_use' && typeof b.name === 'string') {
          toolCalls[b.name] = (toolCalls[b.name] ?? 0) + 1
          total += 1
        }
      }
    } else if (e.type === 'user') {
      for (const b of contentBlocks(e)) {
        if (b.type === 'tool_result' && b.is_error === true) errors += 1
      }
    }
  }
  const r = resultEvent(events)
  const usage = extractUsage(events)
  return {
    tool_calls: toolCalls,
    total_tool_calls: total,
    errors_encountered: errors,
    num_turns: r && typeof r.num_turns === 'number' ? r.num_turns : 0,
    input_tokens: usage?.inputTokens ?? 0,
    output_tokens: usage?.outputTokens ?? 0,
    transcript_chars: transcript.length,
  }
}

export function renderTranscript(input: {
  skillName: string
  evalId: number
  prompt: string
  events: unknown[]
}): string {
  const parts: string[] = [`# Transcript — ${input.skillName} eval ${input.evalId}`, '', '## Prompt', '', input.prompt, '']
  for (const e of input.events) {
    if (!isRecord(e)) continue
    if (e.type === 'assistant') {
      const blocks = contentBlocks(e)
      if (blocks.length === 0) continue
      parts.push('## Assistant', '')
      for (const b of blocks) {
        if (b.type === 'text' && typeof b.text === 'string') {
          parts.push(b.text, '')
        } else if (b.type === 'tool_use' && typeof b.name === 'string') {
          parts.push(`**Tool: ${b.name}** — ${truncate(JSON.stringify(b.input ?? null), 500)}`, '')
        }
      }
    } else if (e.type === 'user') {
      for (const b of contentBlocks(e)) {
        if (b.type !== 'tool_result') continue
        const content = typeof b.content === 'string' ? b.content : JSON.stringify(b.content ?? null)
        parts.push('## Tool result', '', truncate(content, 2000), '')
      }
    }
  }
  parts.push('## Result', '', extractFinalText(input.events) ?? '(no result event)', '')
  return parts.join('\n')
}
```

- [ ] **Step 5: Run tests + typecheck, commit**

Run: `bun test tests/harness/stream-json.test.ts` then `bun test` and `bun run typecheck`.
Expected: all PASS.

```bash
git add src/lib/harness/stream-json.ts tests/harness/stream-json.test.ts tests/fixtures/harness/stream-json
git commit -m "feat(harness): stream-json parsing, metrics, transcript rendering"
```

---

### Task 2: ClaudeRunner boundary — types, spawn implementation, FakeRunner

**Files:**
- Create: `src/lib/harness/claude-runner.ts`
- Create: `tests/harness/claude-runner.test.ts`
- Create: `tests/harness/helpers.ts`

**Interfaces:**
- Consumes: `extractFinalText`, `extractUsage` (Task 1).
- Produces: `RunnerRequest`, `RunnerStatus`, `RunnerResult`, `ClaudeRunner`, `DEFAULT_MODEL = 'sonnet'`, `RUN_TIMEOUT_MS = 300_000`, `ClaudeUnavailableError`, `spawnClaudeRunner(claudeBin = 'claude')`; test helper `fakeRunner(script)` with recorded `requests` — consumed by every later task.

- [ ] **Step 1: Write the failing tests**

`tests/harness/claude-runner.test.ts`:

```ts
import { expect, test } from 'bun:test'
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ClaudeUnavailableError,
  DEFAULT_MODEL,
  RUN_TIMEOUT_MS,
  spawnClaudeRunner,
} from '../../src/lib/harness/claude-runner'

const NDJSON = [
  '{"type":"assistant","message":{"content":[{"type":"text","text":"hi"}]}}',
  '{"type":"result","result":"done","usage":{"input_tokens":5,"output_tokens":7},"num_turns":1,"duration_ms":50,"is_error":false}',
].join('\n')

function stub(script: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-stub-'))
  const bin = join(dir, 'claude')
  writeFileSync(bin, `#!/bin/sh\n${script}\n`)
  chmodSync(bin, 0o755)
  return bin
}

test('constants are pinned', () => {
  expect(DEFAULT_MODEL).toBe('sonnet')
  expect(RUN_TIMEOUT_MS).toBe(300_000)
})

test('completed run: argv, NDJSON events, final text, usage, status', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-runner-out-'))
  const argsFile = join(dir, 'args.txt')
  const dataFile = join(dir, 'data.jsonl')
  writeFileSync(dataFile, `${NDJSON}\ngarbage line\n`)
  const bin = stub(`printf '%s\\n' "$@" > "${argsFile}"\ncat "${dataFile}"`)
  const runner = spawnClaudeRunner(bin)
  const res = await runner.run({ prompt: 'do it', cwd: dir, model: 'sonnet', timeoutMs: 10_000 })
  expect(res.status).toBe('completed')
  expect(res.finalText).toBe('done')
  expect(res.usage).toEqual({ inputTokens: 5, outputTokens: 7 })
  expect(res.events).toHaveLength(2) // garbage line skipped
  expect(res.errorMessage).toBeNull()
  expect(res.durationSeconds).toBeGreaterThanOrEqual(0)
  const args = (await Bun.file(argsFile).text()).trim().split('\n')
  expect(args).toEqual(['-p', 'do it', '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions', '--model', 'sonnet'])
})

test('CLAUDECODE is stripped from the child environment', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-runner-env-'))
  const bin = stub(`if [ -n "$CLAUDECODE" ]; then echo '{"type":"result","result":"present"}'; else echo '{"type":"result","result":"absent"}'; fi`)
  const prev = process.env.CLAUDECODE
  process.env.CLAUDECODE = '1'
  try {
    const res = await spawnClaudeRunner(bin).run({ prompt: 'x', cwd: dir, model: 'sonnet', timeoutMs: 10_000 })
    expect(res.finalText).toBe('absent')
  } finally {
    if (prev === undefined) delete process.env.CLAUDECODE
    else process.env.CLAUDECODE = prev
  }
})

test('nonzero exit: status and stderr tail', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-runner-fail-'))
  const bin = stub(`echo 'boom happened' >&2\nexit 3`)
  const res = await spawnClaudeRunner(bin).run({ prompt: 'x', cwd: dir, model: 'sonnet', timeoutMs: 10_000 })
  expect(res.status).toBe('nonzero-exit')
  expect(res.errorMessage).toContain('boom happened')
})

test('timeout: process killed, status timeout', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-runner-slow-'))
  const bin = stub('sleep 30')
  const res = await spawnClaudeRunner(bin).run({ prompt: 'x', cwd: dir, model: 'sonnet', timeoutMs: 300 })
  expect(res.status).toBe('timeout')
  expect(res.errorMessage).toContain('timed out')
}, 10_000)

test('unspawnable binary throws ClaudeUnavailableError with the contractual message', async () => {
  const runner = spawnClaudeRunner('/nonexistent/claude-definitely-missing')
  await expect(runner.run({ prompt: 'x', cwd: tmpdir(), model: 'sonnet', timeoutMs: 1000 })).rejects.toThrow(
    'claude CLI not found — install Claude Code or put claude on PATH',
  )
  await expect(runner.run({ prompt: 'x', cwd: tmpdir(), model: 'sonnet', timeoutMs: 1000 })).rejects.toBeInstanceOf(ClaudeUnavailableError)
})
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test tests/harness/claude-runner.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/lib/harness/claude-runner.ts`:

```ts
import { extractFinalText, extractUsage } from './stream-json'

export interface RunnerRequest {
  prompt: string
  cwd: string
  model: string
  timeoutMs: number
}

export type RunnerStatus = 'completed' | 'timeout' | 'nonzero-exit'

export interface RunnerResult {
  status: RunnerStatus
  finalText: string | null
  events: unknown[]
  usage: { inputTokens: number; outputTokens: number } | null
  durationSeconds: number
  errorMessage: string | null
}

export interface ClaudeRunner {
  run(req: RunnerRequest): Promise<RunnerResult>
}

export const DEFAULT_MODEL = 'sonnet'
export const RUN_TIMEOUT_MS = 300_000

export class ClaudeUnavailableError extends Error {}

const round2 = (n: number): number => Math.round(n * 100) / 100

export function spawnClaudeRunner(claudeBin = 'claude'): ClaudeRunner {
  return {
    async run(req: RunnerRequest): Promise<RunnerResult> {
      const started = performance.now()
      const env = { ...process.env }
      delete env.CLAUDECODE
      let proc: ReturnType<typeof Bun.spawn>
      try {
        proc = Bun.spawn(
          [claudeBin, '-p', req.prompt, '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions', '--model', req.model],
          { cwd: req.cwd, env, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
        )
      } catch {
        throw new ClaudeUnavailableError('claude CLI not found — install Claude Code or put claude on PATH')
      }
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        proc.kill()
      }, req.timeoutMs)
      let stdout: string
      let stderr: string
      let exitCode: number
      try {
        ;[stdout, stderr, exitCode] = await Promise.all([
          new Response(proc.stdout as ReadableStream).text(),
          new Response(proc.stderr as ReadableStream).text(),
          proc.exited,
        ])
      } catch {
        clearTimeout(timer)
        throw new ClaudeUnavailableError('claude CLI not found — install Claude Code or put claude on PATH')
      }
      clearTimeout(timer)
      const events: unknown[] = []
      for (const line of stdout.split('\n')) {
        const t = line.trim()
        if (!t) continue
        try {
          events.push(JSON.parse(t))
        } catch {
          // tolerant reader: non-JSON lines are skipped
        }
      }
      const durationSeconds = round2((performance.now() - started) / 1000)
      const finalText = extractFinalText(events)
      const usage = extractUsage(events)
      if (timedOut) {
        return { status: 'timeout', finalText, events, usage, durationSeconds, errorMessage: `timed out after ${req.timeoutMs}ms` }
      }
      if (exitCode !== 0) {
        return { status: 'nonzero-exit', finalText, events, usage, durationSeconds, errorMessage: stderr.slice(-2000) || `exit code ${exitCode}` }
      }
      return { status: 'completed', finalText, events, usage, durationSeconds, errorMessage: null }
    },
  }
}
```

Implementation note (not a deviation): if `Bun.spawn` reports a missing binary asynchronously rather than throwing synchronously, move the `ClaudeUnavailableError` mapping to wherever the failure surfaces — the ENOENT test pins the observable behavior, which is what must hold.

`tests/harness/helpers.ts`:

```ts
import type { ClaudeRunner, RunnerRequest, RunnerResult } from '../../src/lib/harness/claude-runner'

export type FakeScript = Array<RunnerResult | ((req: RunnerRequest) => RunnerResult)>

export interface FakeRunner extends ClaudeRunner {
  requests: RunnerRequest[]
}

export function fakeRunner(script: FakeScript): FakeRunner {
  const queue = [...script]
  const requests: RunnerRequest[] = []
  return {
    requests,
    async run(req: RunnerRequest): Promise<RunnerResult> {
      requests.push(req)
      const next = queue.shift()
      if (next === undefined) throw new Error(`FakeRunner script exhausted at call ${requests.length}`)
      return typeof next === 'function' ? next(req) : next
    },
  }
}

export const resultEvent = (text: string): unknown => ({
  type: 'result',
  result: text,
  usage: { input_tokens: 5, output_tokens: 7 },
  num_turns: 1,
  duration_ms: 100,
  is_error: false,
})

export const completed = (finalText: string | null, overrides: Partial<RunnerResult> = {}): RunnerResult => ({
  status: 'completed',
  finalText,
  events: finalText === null ? [] : [resultEvent(finalText)],
  usage: { inputTokens: 5, outputTokens: 7 },
  durationSeconds: 1.5,
  errorMessage: null,
  ...overrides,
})

export const failed = (status: 'timeout' | 'nonzero-exit', errorMessage: string): RunnerResult => ({
  status,
  finalText: null,
  events: [],
  usage: null,
  durationSeconds: 0.5,
  errorMessage,
})

export const gradingReply = (expectations: Array<{ text: string; passed: boolean; evidence?: string }>): string =>
  JSON.stringify(
    {
      expectations: expectations.map(e => ({ text: e.text, passed: e.passed, evidence: e.evidence ?? 'seen in transcript' })),
      summary: {
        passed: expectations.filter(e => e.passed).length,
        failed: expectations.filter(e => !e.passed).length,
        total: expectations.length,
        pass_rate: expectations.length === 0 ? 0 : expectations.filter(e => e.passed).length / expectations.length,
      },
    },
    null,
    2,
  )
```

- [ ] **Step 4: Run tests + typecheck, commit**

Run: `bun test tests/harness/claude-runner.test.ts`, then `bun test`, `bun run typecheck`.
Expected: all PASS.

```bash
git add src/lib/harness/claude-runner.ts tests/harness/claude-runner.test.ts tests/harness/helpers.ts
git commit -m "feat(harness): ClaudeRunner boundary with spawn implementation and FakeRunner"
```

---

### Task 3: Executor building blocks — prompt, staging, cache gate

**Files:**
- Create: `src/lib/harness/executor.ts`
- Create: `tests/harness/executor.test.ts`

**Interfaces:**
- Consumes: `ParsedSkill` (`src/lib/types.ts`), `EvalCase`, `GradingJson` (`src/lib/evals/types.ts`), `validateGradingJson` (`src/lib/evals/validate.ts`).
- Produces: `ScenarioRunMeta`, `buildExecutorPrompt(skillName, evalPrompt): string`, `stageRunDir(skill, evalCase, skillName, dir): string` (returns the `outputs/` path; wipes + recreates `dir`), `readValidCachedGrading(dir, expectations): GradingJson | null` — consumed by Tasks 6, 7.

- [ ] **Step 1: Write the failing tests**

`tests/harness/executor.test.ts`:

```ts
import { expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildExecutorPrompt, readValidCachedGrading, stageRunDir } from '../../src/lib/harness/executor'
import { parseSkill } from '../../src/lib/parser'

const COMPRESS = join(import.meta.dir, '../fixtures/harness/compress')

test('buildExecutorPrompt: exact contractual template', () => {
  expect(buildExecutorPrompt('compress', 'Compress the memory file evals/files/sample-memory.md to save tokens.')).toBe(
    'A skill named "compress" is installed at .claude/skills/compress/. Read .claude/skills/compress/SKILL.md first, then complete this task following the skill:\n\nCompress the memory file evals/files/sample-memory.md to save tokens.',
  )
})

test('stageRunDir mounts the skill and stages eval files at their relPaths', () => {
  const skill = parseSkill(COMPRESS)
  const dir = join(mkdtempSync(join(tmpdir(), 'shakespii-stage-')), 'run')
  const evalCase = { id: 1, prompt: 'p', expected_output: 'o', files: ['evals/files/sample-memory.md'], expectations: ['e'] }
  const outputs = stageRunDir(skill, evalCase, 'compress', dir)
  expect(outputs).toBe(join(dir, 'outputs'))
  expect(existsSync(join(outputs, '.claude/skills/compress/SKILL.md'))).toBe(true)
  expect(existsSync(join(outputs, '.claude/skills/compress/evals/evals.json'))).toBe(true)
  expect(existsSync(join(outputs, 'evals/files/sample-memory.md'))).toBe(true)
  expect(readFileSync(join(outputs, 'evals/files/sample-memory.md'), 'utf8')).toBe(
    readFileSync(join(COMPRESS, 'evals/files/sample-memory.md'), 'utf8'),
  )
})

test('stageRunDir wipes a stale run dir', () => {
  const skill = parseSkill(COMPRESS)
  const dir = join(mkdtempSync(join(tmpdir(), 'shakespii-stale-')), 'run')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'leftover.txt'), 'stale')
  stageRunDir(skill, { id: 1, prompt: 'p', expected_output: 'o', expectations: ['e'] }, 'compress', dir)
  expect(existsSync(join(dir, 'leftover.txt'))).toBe(false)
})

const grading = (texts: string[]) => ({
  expectations: texts.map(t => ({ text: t, passed: true, evidence: 'ok' })),
  summary: { passed: texts.length, failed: 0, total: texts.length, pass_rate: 1 },
})

test('readValidCachedGrading: hit on schema-valid, rubric-matching file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-cache-'))
  writeFileSync(join(dir, 'grading.json'), JSON.stringify(grading(['a', 'b'])))
  expect(readValidCachedGrading(dir, ['a', 'b'])).not.toBeNull()
})

test('readValidCachedGrading: miss on absence, bad JSON, and schema-invalid', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-cache-miss-'))
  expect(readValidCachedGrading(dir, ['a'])).toBeNull()
  writeFileSync(join(dir, 'grading.json'), '{not json')
  expect(readValidCachedGrading(dir, ['a'])).toBeNull()
  writeFileSync(join(dir, 'grading.json'), JSON.stringify({ expectations: [], summary: {} }))
  expect(readValidCachedGrading(dir, ['a'])).toBeNull()
})

test('readValidCachedGrading: rubric-mismatch self-heal — schema-valid file with wrong texts is a miss', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-cache-rubric-'))
  writeFileSync(join(dir, 'grading.json'), JSON.stringify(grading(['stale expectation'])))
  expect(readValidCachedGrading(dir, ['current expectation'])).toBeNull()
  writeFileSync(join(dir, 'grading.json'), JSON.stringify(grading(['a', 'b'])))
  expect(readValidCachedGrading(dir, ['b', 'a'])).toBeNull() // order matters
  expect(readValidCachedGrading(dir, ['a'])).toBeNull() // count matters
})
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test tests/harness/executor.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/lib/harness/executor.ts`:

```ts
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { EvalCase, GradingJson } from '../evals/types'
import { validateGradingJson } from '../evals/validate'
import type { ParsedSkill } from '../types'

export interface ScenarioRunMeta {
  evalId: number
  cached: boolean
  status: 'ok' | 'timeout' | 'nonzero-exit' | 'no-result'
  durationSeconds: number
}

export function buildExecutorPrompt(skillName: string, evalPrompt: string): string {
  return `A skill named "${skillName}" is installed at .claude/skills/${skillName}/. Read .claude/skills/${skillName}/SKILL.md first, then complete this task following the skill:\n\n${evalPrompt}`
}

/** Wipes and recreates the run dir, stages the skill mount and eval files, returns the outputs/ path (the executor cwd). */
export function stageRunDir(skill: ParsedSkill, evalCase: EvalCase, skillName: string, dir: string): string {
  rmSync(dir, { recursive: true, force: true })
  const outputs = join(dir, 'outputs')
  const mount = join(outputs, '.claude', 'skills', skillName)
  mkdirSync(mount, { recursive: true })
  cpSync(join(skill.dir, 'SKILL.md'), join(mount, 'SKILL.md'))
  for (const f of skill.files) {
    const dest = join(mount, f.relPath)
    mkdirSync(dirname(dest), { recursive: true })
    cpSync(join(skill.dir, f.relPath), dest)
  }
  for (const rel of evalCase.files ?? []) {
    const dest = join(outputs, rel)
    mkdirSync(dirname(dest), { recursive: true })
    cpSync(join(skill.dir, rel), dest)
  }
  return outputs
}

/**
 * Cache gate: grading.json must exist, parse, pass validateGradingJson, AND pass
 * rubric fidelity (expectation texts verbatim, same count and order vs the current
 * case). Anything else is a self-healing cache miss (spec §5 step 2).
 */
export function readValidCachedGrading(dir: string, expectations: string[]): GradingJson | null {
  const p = join(dir, 'grading.json')
  if (!existsSync(p)) return null
  let doc: unknown
  try {
    doc = JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return null
  }
  if (validateGradingJson(doc).length > 0) return null
  const g = doc as GradingJson
  if (g.expectations.length !== expectations.length) return null
  for (let i = 0; i < expectations.length; i++) {
    if (g.expectations[i].text !== expectations[i]) return null
  }
  return g
}
```

- [ ] **Step 4: Run tests + typecheck, commit**

Run: `bun test tests/harness/executor.test.ts`, then `bun test`, `bun run typecheck`.
Expected: all PASS.

```bash
git add src/lib/harness/executor.ts tests/harness/executor.test.ts
git commit -m "feat(harness): executor prompt, run-dir staging, rubric-gated cache read"
```

---

### Task 4: Grader building blocks — prompt, extraction, gates, summary, findings

**Files:**
- Create: `src/lib/harness/grader.ts`
- Create: `tests/harness/grader.test.ts`

**Interfaces:**
- Consumes: `EvalCase`, `GradingExpectation`, `GradingJson` types; `validateGradingJson`; `HarnessFinding`.
- Produces: `buildGraderPrompt(evalCase): string`, `buildGraderRetryPrompt(original, problems, previousReply): string`, `extractGraderJson(finalText): unknown | undefined` (undefined = parse failure), `gateGraderReply(doc, expectations): string[]` (empty = pass), `recomputeSummary(expectations): GradingJson['summary']`, `gradingFindings(evalId, grading): HarnessFinding[]` — consumed by Task 5.

- [ ] **Step 1: Write the failing tests**

`tests/harness/grader.test.ts`:

```ts
import { expect, test } from 'bun:test'
import {
  buildGraderPrompt,
  buildGraderRetryPrompt,
  extractGraderJson,
  gateGraderReply,
  gradingFindings,
  recomputeSummary,
} from '../../src/lib/harness/grader'

const evalCase = {
  id: 2,
  prompt: 'Compress evals/files/code-only.md.',
  expected_output: 'No material compression is possible.',
  expectations: ['The fenced code block is byte-identical after compression', 'No code content is reworded or dropped'],
}

test('buildGraderPrompt: exact contractual template', () => {
  expect(buildGraderPrompt(evalCase)).toBe(
    `You are grading a skill evaluation run. Work in the current directory.

Read transcript.md (the execution transcript). Examine the files under outputs/, ignoring outputs/.claude/ (it is the skill mount, not an artifact).

The task given to the executor:
Compress evals/files/code-only.md.

Expected outcome:
No material compression is possible.

Grade each expectation below as passed true or false, with cited evidence. The burden of proof is on the expectation: PASS only with clear evidence of genuine completion; superficial compliance (right filename, wrong content) is FAIL. No partial credit.

Expectations (grade exactly these, verbatim, in this order):
1. The fenced code block is byte-identical after compression
2. No code content is reworded or dropped

Reply with ONLY this JSON — no prose before or after:
{
  "expectations": [
    { "text": "<expectation verbatim>", "passed": true, "evidence": "<specific citation>" }
  ],
  "summary": { "passed": 0, "failed": 0, "total": 0, "pass_rate": 0 }
}`,
  )
})

test('buildGraderRetryPrompt appends diagnostics and the previous reply', () => {
  const out = buildGraderRetryPrompt('ORIGINAL', ['expectations: must be a non-empty array'], 'BAD REPLY')
  expect(out).toBe(
    `ORIGINAL

Your previous reply failed validation:
expectations: must be a non-empty array

Previous reply:
BAD REPLY

Reply again with ONLY the corrected JSON.`,
  )
})

test('extractGraderJson: bare, fenced, and fenced-with-language replies', () => {
  expect(extractGraderJson('{"a":1}')).toEqual({ a: 1 })
  expect(extractGraderJson('```\n{"a":1}\n```')).toEqual({ a: 1 })
  expect(extractGraderJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
  expect(extractGraderJson('  {"a":1}  ')).toEqual({ a: 1 })
  expect(extractGraderJson('not json')).toBeUndefined()
})

const reply = (texts: Array<[string, boolean]>) => ({
  expectations: texts.map(([text, passed]) => ({ text, passed, evidence: 'ev' })),
  summary: { passed: 0, failed: 0, total: texts.length, pass_rate: 0 },
})

test('gateGraderReply: schema diagnostics come back as path-prefixed problems', () => {
  const problems = gateGraderReply({ expectations: [] }, evalCase.expectations)
  expect(problems.length).toBeGreaterThan(0)
  expect(problems[0]).toBe('expectations: must be a non-empty array')
})

test('gateGraderReply: rubric fidelity — count and text mismatches are named', () => {
  const wrongCount = gateGraderReply(reply([[evalCase.expectations[0], true]]), evalCase.expectations)
  expect(wrongCount).toEqual(['expectations: expected 2 graded expectations, got 1'])
  const wrongText = gateGraderReply(
    reply([[evalCase.expectations[0], true], ['an invented rubric line', false]]),
    evalCase.expectations,
  )
  expect(wrongText).toEqual(['expectations[1].text: does not match the eval\'s expectation'])
})

test('gateGraderReply: valid, faithful reply passes', () => {
  expect(gateGraderReply(reply([[evalCase.expectations[0], true], [evalCase.expectations[1], false]]), evalCase.expectations)).toEqual([])
})

test('recomputeSummary never trusts LLM arithmetic', () => {
  expect(
    recomputeSummary([
      { text: 'a', passed: true, evidence: 'e' },
      { text: 'b', passed: false, evidence: 'e' },
      { text: 'c', passed: true, evidence: 'e' },
    ]),
  ).toEqual({ passed: 2, failed: 1, total: 3, pass_rate: 0.6667 })
})

test('gradingFindings: one error per failed expectation, evidence truncated at 200', () => {
  const longEvidence = 'x'.repeat(250)
  const findings = gradingFindings(2, {
    expectations: [
      { text: 'passes', passed: true, evidence: 'fine' },
      { text: 'fails', passed: false, evidence: longEvidence },
    ],
    summary: { passed: 1, failed: 1, total: 2, pass_rate: 0.5 },
  })
  expect(findings).toEqual([
    {
      severity: 'error',
      message: `eval 2 expectation failed: "fails" — ${'x'.repeat(200)}…`,
      file: 'evals/evals.json',
      line: null,
    },
  ])
})
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test tests/harness/grader.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/lib/harness/grader.ts`:

```ts
import type { EvalCase, GradingExpectation, GradingJson } from '../evals/types'
import { validateGradingJson } from '../evals/validate'
import type { HarnessFinding } from './types'

const truncate = (s: string, max: number): string => (s.length > max ? `${s.slice(0, max)}…` : s)

export function buildGraderPrompt(evalCase: EvalCase): string {
  const numbered = evalCase.expectations.map((e, i) => `${i + 1}. ${e}`).join('\n')
  return `You are grading a skill evaluation run. Work in the current directory.

Read transcript.md (the execution transcript). Examine the files under outputs/, ignoring outputs/.claude/ (it is the skill mount, not an artifact).

The task given to the executor:
${evalCase.prompt}

Expected outcome:
${evalCase.expected_output}

Grade each expectation below as passed true or false, with cited evidence. The burden of proof is on the expectation: PASS only with clear evidence of genuine completion; superficial compliance (right filename, wrong content) is FAIL. No partial credit.

Expectations (grade exactly these, verbatim, in this order):
${numbered}

Reply with ONLY this JSON — no prose before or after:
{
  "expectations": [
    { "text": "<expectation verbatim>", "passed": true, "evidence": "<specific citation>" }
  ],
  "summary": { "passed": 0, "failed": 0, "total": 0, "pass_rate": 0 }
}`
}

export function buildGraderRetryPrompt(original: string, problems: string[], previousReply: string): string {
  return `${original}

Your previous reply failed validation:
${problems.join('\n')}

Previous reply:
${previousReply}

Reply again with ONLY the corrected JSON.`
}

/** Trim; unwrap a single fenced block (with or without a language tag); JSON.parse. undefined = parse failure. */
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
    return undefined
  }
}

/** Gates 2 (schema) and 3 (rubric fidelity). Empty array = pass. */
export function gateGraderReply(doc: unknown, expectations: string[]): string[] {
  const diagnostics = validateGradingJson(doc)
  if (diagnostics.length > 0) return diagnostics.map(d => `${d.path}: ${d.message}`)
  const g = doc as GradingJson
  if (g.expectations.length !== expectations.length) {
    return [`expectations: expected ${expectations.length} graded expectations, got ${g.expectations.length}`]
  }
  for (let i = 0; i < expectations.length; i++) {
    if (g.expectations[i].text !== expectations[i]) {
      return [`expectations[${i}].text: does not match the eval's expectation`]
    }
  }
  return []
}

/** The grader's arithmetic is never trusted; pass_rate rounds to 4 decimals. */
export function recomputeSummary(expectations: GradingExpectation[]): GradingJson['summary'] {
  const passed = expectations.filter(e => e.passed).length
  const total = expectations.length
  return {
    passed,
    failed: total - passed,
    total,
    pass_rate: total === 0 ? 0 : Math.round((passed / total) * 10_000) / 10_000,
  }
}

export function gradingFindings(evalId: number, grading: GradingJson): HarnessFinding[] {
  return grading.expectations
    .filter(e => !e.passed)
    .map(e => ({
      severity: 'error' as const,
      message: `eval ${evalId} expectation failed: "${e.text}" — ${truncate(e.evidence, 200)}`,
      file: 'evals/evals.json',
      line: null,
    }))
}
```

- [ ] **Step 4: Run tests + typecheck, commit**

Run: `bun test tests/harness/grader.test.ts`, then `bun test`, `bun run typecheck`.
Expected: all PASS.

```bash
git add src/lib/harness/grader.ts tests/harness/grader.test.ts
git commit -m "feat(harness): grader prompt, extraction, validation gates, recomputed summary"
```

---

### Task 5: gradeCase orchestration — retry budget, persistence, failure modes

**Files:**
- Modify: `src/lib/harness/grader.ts` (append `gradeCase`)
- Create: `tests/harness/grade-case.test.ts`

**Interfaces:**
- Consumes: `ClaudeRunner`, `RUN_TIMEOUT_MS` (Task 2); Task 4 helpers; `ExecutionMetrics` (Task 1).
- Produces: `gradeCase(args): Promise<GradeCaseResult>` where `GradeCaseResult = { grading: GradingJson; graderDurationSeconds: number } | { failure: string }` — consumed by Task 6. On success it writes `timing.json` and `grading.json` (atomic) into `args.dir`.

- [ ] **Step 1: Write the failing tests**

`tests/harness/grade-case.test.ts`:

```ts
import { expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gradeCase } from '../../src/lib/harness/grader'
import { completed, failed, fakeRunner, gradingReply } from './helpers'

const evalCase = {
  id: 1,
  prompt: 'Do the task.',
  expected_output: 'Task done.',
  expectations: ['first expectation', 'second expectation'],
}

const metrics = {
  tool_calls: { Read: 1 },
  total_tool_calls: 1,
  errors_encountered: 0,
  num_turns: 2,
  input_tokens: 10,
  output_tokens: 20,
  transcript_chars: 500,
}

const args = (runner: ReturnType<typeof fakeRunner>, dir: string) => ({
  evalCase,
  dir,
  runner,
  model: 'sonnet',
  executorDurationSeconds: 12.34,
  metrics,
})

test('happy path: one call, merged doc persisted atomically, summary recomputed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-grade-'))
  const runner = fakeRunner([completed(gradingReply([
    { text: 'first expectation', passed: true },
    { text: 'second expectation', passed: false, evidence: 'missing output' },
  ]))])
  const res = await gradeCase(args(runner, dir))
  expect('grading' in res).toBe(true)
  if (!('grading' in res)) throw new Error('unreachable')
  expect(res.grading.summary).toEqual({ passed: 1, failed: 1, total: 2, pass_rate: 0.5 })
  expect(runner.requests).toHaveLength(1)
  expect(runner.requests[0].cwd).toBe(dir)
  expect(runner.requests[0].model).toBe('sonnet')
  expect(runner.requests[0].prompt).toContain('grade exactly these, verbatim')
  const persisted = JSON.parse(readFileSync(join(dir, 'grading.json'), 'utf8'))
  expect(persisted.execution_metrics).toEqual(metrics)
  expect(persisted.timing).toEqual({
    executor_duration_seconds: 12.34,
    grader_duration_seconds: 1.5,
    total_duration_seconds: 13.84,
  })
  expect(JSON.parse(readFileSync(join(dir, 'timing.json'), 'utf8'))).toEqual(persisted.timing)
  expect(existsSync(join(dir, 'grading.json.tmp'))).toBe(false)
})

test('gate failure then valid retry: retry prompt carries diagnostics and previous reply', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-grade-retry-'))
  const runner = fakeRunner([
    completed('not json at all'),
    completed(gradingReply([
      { text: 'first expectation', passed: true },
      { text: 'second expectation', passed: true },
    ])),
  ])
  const res = await gradeCase(args(runner, dir))
  expect('grading' in res).toBe(true)
  expect(runner.requests).toHaveLength(2)
  expect(runner.requests[1].prompt).toContain('Your previous reply failed validation:')
  expect(runner.requests[1].prompt).toContain('not json at all')
  expect(runner.requests[1].prompt).toContain('Reply again with ONLY the corrected JSON.')
})

test('two gate failures: invalid-grading failure, nothing persisted', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-grade-fail-'))
  const runner = fakeRunner([completed('nope'), completed('still nope')])
  const res = await gradeCase(args(runner, dir))
  expect(res).toEqual({ failure: 'grader returned invalid grading (reply is not valid JSON)' })
  expect(existsSync(join(dir, 'grading.json'))).toBe(false)
  expect(existsSync(join(dir, 'timing.json'))).toBe(false)
})

test('runner-level failures: timeout, nonzero-exit, no-reply each retry once with the ORIGINAL prompt', async () => {
  for (const [result, statusWord, detail] of [
    [failed('timeout', 'timed out after 300000ms'), 'timeout', 'timed out after 300000ms'],
    [failed('nonzero-exit', 'exit code 3'), 'nonzero-exit', 'exit code 3'],
    [completed(null), 'no-reply', 'no reply text'],
    [completed('   '), 'no-reply', 'no reply text'],
  ] as const) {
    const dir = mkdtempSync(join(tmpdir(), 'shakespii-grade-runner-'))
    const runner = fakeRunner([result, result])
    const res = await gradeCase(args(runner, dir))
    expect(res).toEqual({ failure: `grader ${statusWord} — ${detail}` })
    expect(runner.requests).toHaveLength(2)
    expect(runner.requests[1].prompt).toBe(runner.requests[0].prompt) // original, unchanged
    expect(existsSync(join(dir, 'grading.json'))).toBe(false)
  }
})

test('mixed failure: runner failure then gate failure — shared budget, one failure, two calls', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-grade-mixed-'))
  const runner = fakeRunner([failed('timeout', 't'), completed('garbage')])
  const res = await gradeCase(args(runner, dir))
  expect(res).toEqual({ failure: 'grader returned invalid grading (reply is not valid JSON)' })
  expect(runner.requests).toHaveLength(2)
})

test('grader duration sums across retry calls', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-grade-durations-'))
  const good = gradingReply([
    { text: 'first expectation', passed: true },
    { text: 'second expectation', passed: true },
  ])
  const runner = fakeRunner([completed('bad', { durationSeconds: 2 }), completed(good, { durationSeconds: 3 })])
  const res = await gradeCase(args(runner, dir))
  if (!('grading' in res)) throw new Error('expected success')
  expect(res.grading.timing).toEqual({
    executor_duration_seconds: 12.34,
    grader_duration_seconds: 5,
    total_duration_seconds: 17.34,
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test tests/harness/grade-case.test.ts`
Expected: FAIL — `gradeCase` not exported.

- [ ] **Step 3: Implement — append to `src/lib/harness/grader.ts`**

Add imports at the top of the file (merging with existing ones):

```ts
import { renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ClaudeRunner, RunnerResult } from './claude-runner'
import { RUN_TIMEOUT_MS } from './claude-runner'
import type { ExecutionMetrics } from './stream-json'
```

Append:

```ts
export type GradeCaseResult = { grading: GradingJson; graderDurationSeconds: number } | { failure: string }

const round2 = (n: number): number => Math.round(n * 100) / 100

type Attempt =
  | { kind: 'ok'; doc: GradingJson; reply: string }
  | { kind: 'runner'; failure: string }
  | { kind: 'gate'; problems: string[]; reply: string }

function classify(result: RunnerResult, expectations: string[]): Attempt {
  if (result.status !== 'completed') {
    return { kind: 'runner', failure: `grader ${result.status} — ${result.errorMessage ?? 'no reply text'}` }
  }
  const reply = result.finalText ?? ''
  if (reply.trim().length === 0) {
    return { kind: 'runner', failure: 'grader no-reply — no reply text' }
  }
  const doc = extractGraderJson(reply)
  if (doc === undefined) return { kind: 'gate', problems: ['reply is not valid JSON'], reply }
  const problems = gateGraderReply(doc, expectations)
  if (problems.length > 0) return { kind: 'gate', problems, reply }
  return { kind: 'ok', doc: doc as GradingJson, reply }
}

/**
 * One grader pass for an executed eval case: at most two runner calls total
 * (spec §6 — runner-level and gate failures share the single-retry budget).
 * On success writes timing.json and grading.json (write .tmp, then rename).
 */
export async function gradeCase(args: {
  evalCase: EvalCase
  dir: string
  runner: ClaudeRunner
  model: string
  executorDurationSeconds: number
  metrics: ExecutionMetrics
}): Promise<GradeCaseResult> {
  const original = buildGraderPrompt(args.evalCase)
  let graderDuration = 0

  const call = async (prompt: string): Promise<Attempt> => {
    const result = await args.runner.run({ prompt, cwd: args.dir, model: args.model, timeoutMs: RUN_TIMEOUT_MS })
    graderDuration = round2(graderDuration + result.durationSeconds)
    return classify(result, args.evalCase.expectations)
  }

  let attempt = await call(original)
  if (attempt.kind !== 'ok') {
    const retryPrompt =
      attempt.kind === 'gate' ? buildGraderRetryPrompt(original, attempt.problems, attempt.reply) : original
    attempt = await call(retryPrompt)
  }
  if (attempt.kind === 'runner') return { failure: attempt.failure }
  if (attempt.kind === 'gate') return { failure: `grader returned invalid grading (${attempt.problems[0]})` }

  const timing = {
    executor_duration_seconds: args.executorDurationSeconds,
    grader_duration_seconds: graderDuration,
    total_duration_seconds: round2(args.executorDurationSeconds + graderDuration),
  }
  const merged: GradingJson = {
    expectations: attempt.doc.expectations,
    summary: recomputeSummary(attempt.doc.expectations),
    execution_metrics: args.metrics as unknown as Record<string, unknown>,
    timing,
  }
  const diagnostics = validateGradingJson(merged)
  if (diagnostics.length > 0) {
    throw new Error(`internal: merged grading document failed validation (${diagnostics[0].path}: ${diagnostics[0].message})`)
  }
  writeFileSync(join(args.dir, 'timing.json'), `${JSON.stringify(timing, null, 2)}\n`)
  const tmp = join(args.dir, 'grading.json.tmp')
  writeFileSync(tmp, `${JSON.stringify(merged, null, 2)}\n`)
  renameSync(tmp, join(args.dir, 'grading.json'))
  return { grading: merged, graderDurationSeconds: graderDuration }
}
```

- [ ] **Step 4: Run tests + typecheck, commit**

Run: `bun test tests/harness/grade-case.test.ts`, then `bun test`, `bun run typecheck`.
Expected: all PASS.

```bash
git add src/lib/harness/grader.ts tests/harness/grade-case.test.ts
git commit -m "feat(harness): gradeCase orchestration with shared retry budget and atomic persistence"
```

---

### Task 6: runLlmStages — per-eval pipeline, cache replay, artifacts

**Files:**
- Create: `src/lib/harness/llm-stages.ts`
- Create: `tests/harness/llm-stages.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–5; `skillContentHash`, `runKey`, `runDir` (`src/lib/harness/run-dir.ts`); `EvalsJson`.
- Produces: `runLlmStages(skill, options: { runner; cacheRoot; model; fresh }): Promise<{ scenario: ScenarioStage; grading: GradingStage }>` using the Task 7 `StageReport` shapes — consumed by Task 7. Precondition (guaranteed by caller): deterministic stage ran with zero errors.

- [ ] **Step 1: Write the failing tests**

`tests/harness/llm-stages.test.ts`:

```ts
import { expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runLlmStages } from '../../src/lib/harness/llm-stages'
import { runDir, runKey, skillContentHash } from '../../src/lib/harness/run-dir'
import { parseSkill } from '../../src/lib/parser'
import { completed, failed, fakeRunner, gradingReply, resultEvent } from './helpers'

const COMPRESS = join(import.meta.dir, '../fixtures/harness/compress')
const skill = () => parseSkill(COMPRESS)
const evals = JSON.parse(readFileSync(join(COMPRESS, 'evals/evals.json'), 'utf8')) as {
  evals: Array<{ id: number; expectations: string[] }>
}

const executorOk = () => completed('Task complete.', { events: [resultEvent('Task complete.')], durationSeconds: 2 })
const graderOk = (i: number) => completed(gradingReply(evals.evals[i].expectations.map(text => ({ text, passed: true }))))

const freshCache = () => mkdtempSync(join(tmpdir(), 'shakespii-llm-cache-'))
const opts = (runner: ReturnType<typeof fakeRunner>, cacheRoot: string, fresh = false) => ({
  runner,
  cacheRoot,
  model: 'sonnet',
  fresh,
})

test('cold run: executor + grader per case in id order, artifacts written, stages pass', async () => {
  const cacheRoot = freshCache()
  const runner = fakeRunner([
    executorOk(), graderOk(0),
    executorOk(), graderOk(1),
    executorOk(), graderOk(2),
  ])
  const { scenario, grading } = await runLlmStages(skill(), opts(runner, cacheRoot))
  expect(scenario).toEqual({
    stage: 'scenario',
    status: 'pass',
    findings: [],
    runs: [
      { evalId: 1, cached: false, status: 'ok', durationSeconds: 2 },
      { evalId: 2, cached: false, status: 'ok', durationSeconds: 2 },
      { evalId: 3, cached: false, status: 'ok', durationSeconds: 2 },
    ],
  })
  expect(grading).toEqual({
    stage: 'grading',
    status: 'pass',
    findings: [],
    expectations: { passed: 8, total: 8 }, // 4 + 2 + 2 expectations across the three compress cases
  })
  // executor calls run in outputs/, grader calls in the run dir; prompts carry the contract
  expect(runner.requests).toHaveLength(6)
  expect(runner.requests[0].prompt).toStartWith('A skill named "compress" is installed at .claude/skills/compress/.')
  expect(runner.requests[0].cwd.endsWith('/outputs')).toBe(true)
  expect(runner.requests[1].cwd.endsWith('/outputs')).toBe(false)
  const key = runKey({ skillHash: skillContentHash(skill()), evalId: 1, model: 'sonnet' })
  const dir = runDir(cacheRoot, 'compress', key)
  for (const artifact of ['events.jsonl', 'transcript.md', 'outputs/metrics.json', 'timing.json', 'grading.json']) {
    expect(existsSync(join(dir, artifact))).toBe(true)
  }
})

test('second run replays from cache: zero runner calls, identical findings, cached metas', async () => {
  const cacheRoot = freshCache()
  const grader1Fails = completed(gradingReply(evals.evals[0].expectations.map((text, i) => ({ text, passed: i > 0 }))))
  const cold = fakeRunner([executorOk(), grader1Fails, executorOk(), graderOk(1), executorOk(), graderOk(2)])
  const first = await runLlmStages(skill(), opts(cold, cacheRoot))
  const warm = fakeRunner([])
  const second = await runLlmStages(skill(), opts(warm, cacheRoot))
  expect(warm.requests).toHaveLength(0)
  expect(second.grading.findings).toEqual(first.grading.findings)
  expect(second.grading.expectations).toEqual(first.grading.expectations)
  expect(second.scenario.runs.every(r => r.cached && r.status === 'ok' && r.durationSeconds === 0)).toBe(true)
})

test('--fresh re-executes despite a valid cache', async () => {
  const cacheRoot = freshCache()
  const cold = fakeRunner([executorOk(), graderOk(0), executorOk(), graderOk(1), executorOk(), graderOk(2)])
  await runLlmStages(skill(), opts(cold, cacheRoot))
  const fresh = fakeRunner([executorOk(), graderOk(0), executorOk(), graderOk(1), executorOk(), graderOk(2)])
  const res = await runLlmStages(skill(), opts(fresh, cacheRoot, true))
  expect(fresh.requests).toHaveLength(6)
  expect(res.scenario.runs.every(r => r.cached === false)).toBe(true)
})

test('rubric-mismatched cached grading is a self-healing miss', async () => {
  const cacheRoot = freshCache()
  const cold = fakeRunner([executorOk(), graderOk(0), executorOk(), graderOk(1), executorOk(), graderOk(2)])
  await runLlmStages(skill(), opts(cold, cacheRoot))
  const key = runKey({ skillHash: skillContentHash(skill()), evalId: 1, model: 'sonnet' })
  const dir = runDir(cacheRoot, 'compress', key)
  writeFileSync(
    join(dir, 'grading.json'),
    JSON.stringify({ expectations: [{ text: 'stale rubric', passed: true, evidence: 'e' }], summary: { passed: 1, failed: 0, total: 1, pass_rate: 1 } }),
  )
  const heal = fakeRunner([executorOk(), graderOk(0)])
  const res = await runLlmStages(skill(), opts(heal, cacheRoot))
  expect(heal.requests).toHaveLength(2) // only eval 1 re-ran
  expect(res.scenario.runs[0].cached).toBe(false)
  expect(res.scenario.runs[1].cached).toBe(true)
})

test('executor failures: finding per case, no grading, stays uncached', async () => {
  const cacheRoot = freshCache()
  const runner = fakeRunner([
    failed('timeout', 'timed out after 300000ms'),
    completed(null, { events: [] }), // completed but no result event -> no-result
    executorOk(), graderOk(2),
  ])
  const { scenario, grading } = await runLlmStages(skill(), opts(runner, cacheRoot))
  expect(scenario.status).toBe('fail')
  expect(scenario.findings).toEqual([
    { severity: 'error', message: 'eval 1: executor timeout — timed out after 300000ms', file: 'evals/evals.json', line: null },
    { severity: 'error', message: 'eval 2: executor no-result — no result event', file: 'evals/evals.json', line: null },
  ])
  expect(scenario.runs.map(r => r.status)).toEqual(['timeout', 'no-result', 'ok'])
  expect(grading.expectations).toEqual({ passed: 2, total: 2 }) // only eval 3 graded
  const key = runKey({ skillHash: skillContentHash(skill()), evalId: 1, model: 'sonnet' })
  expect(existsSync(join(runDir(cacheRoot, 'compress', key), 'grading.json'))).toBe(false)
  expect(existsSync(join(runDir(cacheRoot, 'compress', key), 'transcript.md'))).toBe(true) // artifacts still written
})

test('grader failure: grading finding, case uncached, scenario run still ok', async () => {
  const cacheRoot = freshCache()
  const runner = fakeRunner([
    executorOk(), failed('timeout', 't'), failed('timeout', 't'),
    executorOk(), graderOk(1),
    executorOk(), graderOk(2),
  ])
  const { scenario, grading } = await runLlmStages(skill(), opts(runner, cacheRoot))
  expect(scenario.status).toBe('pass')
  expect(grading.status).toBe('fail')
  expect(grading.findings[0]).toEqual({
    severity: 'error',
    message: 'eval 1: grader timeout — t',
    file: 'evals/evals.json',
    line: null,
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test tests/harness/llm-stages.test.ts`
Expected: FAIL — module not found. (The `StageReport` changes land in Task 7; define the two stage shapes locally in `llm-stages.ts` now, structurally identical, and Task 7 unifies the types.)

- [ ] **Step 3: Implement**

`src/lib/harness/llm-stages.ts`:

```ts
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { EvalCase, EvalsJson } from '../evals/types'
import type { ParsedSkill } from '../types'
import type { ClaudeRunner } from './claude-runner'
import { RUN_TIMEOUT_MS } from './claude-runner'
import type { ScenarioRunMeta } from './executor'
import { buildExecutorPrompt, readValidCachedGrading, stageRunDir } from './executor'
import { gradeCase, gradingFindings } from './grader'
import { runDir, runKey, skillContentHash } from './run-dir'
import { deriveMetrics, extractFinalText, renderTranscript } from './stream-json'
import type { HarnessFinding } from './types'

export interface LlmStagesOptions {
  runner: ClaudeRunner
  cacheRoot: string
  model: string
  fresh: boolean
}

export interface ScenarioStage {
  stage: 'scenario'
  status: 'pass' | 'fail'
  findings: HarnessFinding[]
  runs: ScenarioRunMeta[]
}

export interface GradingStage {
  stage: 'grading'
  status: 'pass' | 'fail'
  findings: HarnessFinding[]
  expectations: { passed: number; total: number }
}

const err = (message: string): HarnessFinding => ({ severity: 'error', message, file: 'evals/evals.json', line: null })

/** Precondition: the deterministic stage ran on this skill with zero errors. */
export async function runLlmStages(
  skill: ParsedSkill,
  options: LlmStagesOptions,
): Promise<{ scenario: ScenarioStage; grading: GradingStage }> {
  const entry = skill.files.find(f => f.relPath === 'evals/evals.json')
  if (!entry || entry.text === null) throw new Error('internal: runLlmStages requires a deterministic-clean eval suite')
  const doc = JSON.parse(entry.text) as EvalsJson
  const cases: EvalCase[] = [...doc.evals].sort((a, b) => a.id - b.id)
  const skillName = doc.skill_name
  const skillHash = skillContentHash(skill)

  const scenarioFindings: HarnessFinding[] = []
  const gradingFindingsAll: HarnessFinding[] = []
  const runs: ScenarioRunMeta[] = []
  let passedTotal = 0
  let gradedTotal = 0

  for (const evalCase of cases) {
    const key = runKey({ skillHash, evalId: evalCase.id, model: options.model })
    const dir = runDir(options.cacheRoot, skillName, key)

    if (!options.fresh) {
      const cached = readValidCachedGrading(dir, evalCase.expectations)
      if (cached !== null) {
        runs.push({ evalId: evalCase.id, cached: true, status: 'ok', durationSeconds: 0 })
        gradingFindingsAll.push(...gradingFindings(evalCase.id, cached))
        passedTotal += cached.summary.passed
        gradedTotal += cached.summary.total
        continue
      }
    }

    const outputs = stageRunDir(skill, evalCase, skillName, dir)
    const prompt = buildExecutorPrompt(skillName, evalCase.prompt)
    const result = await options.runner.run({ prompt, cwd: outputs, model: options.model, timeoutMs: RUN_TIMEOUT_MS })

    const transcript = renderTranscript({ skillName, evalId: evalCase.id, prompt, events: result.events })
    const metrics = deriveMetrics(result.events, transcript)
    writeFileSync(join(dir, 'events.jsonl'), result.events.map(e => JSON.stringify(e)).join('\n') + (result.events.length > 0 ? '\n' : ''))
    writeFileSync(join(dir, 'transcript.md'), transcript)
    writeFileSync(join(outputs, 'metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`)

    const noResult = result.status === 'completed' && extractFinalText(result.events) === null
    if (result.status !== 'completed' || noResult) {
      const status = result.status === 'completed' ? 'no-result' : result.status
      scenarioFindings.push(err(`eval ${evalCase.id}: executor ${status} — ${result.errorMessage ?? 'no result event'}`))
      runs.push({ evalId: evalCase.id, cached: false, status, durationSeconds: result.durationSeconds })
      continue
    }
    runs.push({ evalId: evalCase.id, cached: false, status: 'ok', durationSeconds: result.durationSeconds })

    const graded = await gradeCase({
      evalCase,
      dir,
      runner: options.runner,
      model: options.model,
      executorDurationSeconds: result.durationSeconds,
      metrics,
    })
    if ('failure' in graded) {
      gradingFindingsAll.push(err(`eval ${evalCase.id}: ${graded.failure}`))
      continue
    }
    gradingFindingsAll.push(...gradingFindings(evalCase.id, graded.grading))
    passedTotal += graded.grading.summary.passed
    gradedTotal += graded.grading.summary.total
  }

  return {
    scenario: {
      stage: 'scenario',
      status: scenarioFindings.length > 0 ? 'fail' : 'pass',
      findings: scenarioFindings,
      runs,
    },
    grading: {
      stage: 'grading',
      status: gradingFindingsAll.length > 0 ? 'fail' : 'pass',
      findings: gradingFindingsAll,
      expectations: { passed: passedTotal, total: gradedTotal },
    },
  }
}
```

- [ ] **Step 4: Run tests + typecheck, commit**

Run: `bun test tests/harness/llm-stages.test.ts`, then `bun test`, `bun run typecheck`.
Expected: all PASS.

```bash
git add src/lib/harness/llm-stages.ts tests/harness/llm-stages.test.ts
git commit -m "feat(harness): runLlmStages per-eval pipeline with cache replay and artifacts"
```

---

### Task 7: Async testSkill pipeline — StageReport union, TestOptions, skip notes

**Files:**
- Modify: `src/lib/harness/types.ts`
- Modify: `src/lib/harness/index.ts`
- Modify: `src/lib/harness/llm-stages.ts` (swap local stage interfaces for the shared union members)
- Modify: `tests/harness/deterministic.test.ts` (re-pins + async)
- Create: `tests/harness/test-skill.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 6.
- Produces: the final `StageReport` union and `TestOptions`; `testSkill(skill, options?): Promise<TestResult>` — consumed by Tasks 8, 9.

- [ ] **Step 1: Write the failing tests**

`tests/harness/test-skill.test.ts`:

```ts
import { expect, test } from 'bun:test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { testSkill } from '../../src/lib/harness'
import { parseSkill } from '../../src/lib/parser'
import { completed, fakeRunner, gradingReply, resultEvent } from './helpers'

const COMPRESS = join(import.meta.dir, '../fixtures/harness/compress')
const NO_EVALS = join(import.meta.dir, '../fixtures/harness/no-evals')

test('no --run: LLM stages report skipped with the contractual note, zero runner use', async () => {
  const runner = fakeRunner([])
  const result = await testSkill(parseSkill(COMPRESS), { runner, cacheRoot: mkdtempSync(join(tmpdir(), 'sk-')) })
  expect(result.stages[1]).toEqual({ stage: 'scenario', status: 'skipped', note: 'pass --run to execute LLM stages' })
  expect(result.stages[2]).toEqual({ stage: 'grading', status: 'skipped', note: 'pass --run to execute LLM stages' })
  expect(runner.requests).toHaveLength(0)
})

test('--run with deterministic errors: stages skipped as deterministic stage failed', async () => {
  const runner = fakeRunner([])
  const result = await testSkill(parseSkill(NO_EVALS), { run: true, runner, cacheRoot: mkdtempSync(join(tmpdir(), 'sk-')) })
  expect(result.stages[1]).toEqual({ stage: 'scenario', status: 'skipped', note: 'deterministic stage failed' })
  expect(result.stages[2]).toEqual({ stage: 'grading', status: 'skipped', note: 'deterministic stage failed' })
  expect(runner.requests).toHaveLength(0)
  expect(result.summary.errors).toBe(1)
})

test('--run happy path: all three stages live, summary spans stages, model defaults to sonnet', async () => {
  const evals = JSON.parse(readFileSync(join(COMPRESS, 'evals/evals.json'), 'utf8')) as {
    evals: Array<{ expectations: string[] }>
  }
  const executorOk = completed('done', { events: [resultEvent('done')] })
  const runner = fakeRunner([
    executorOk, completed(gradingReply(evals.evals[0].expectations.map(text => ({ text, passed: true })))),
    executorOk, completed(gradingReply(evals.evals[1].expectations.map((text, i) => ({ text, passed: i === 0 })))),
    executorOk, completed(gradingReply(evals.evals[2].expectations.map(text => ({ text, passed: true })))),
  ])
  const result = await testSkill(parseSkill(COMPRESS), { run: true, runner, cacheRoot: mkdtempSync(join(tmpdir(), 'sk-')) })
  expect(result.stages[0]).toEqual({ stage: 'deterministic', status: 'pass', findings: [] })
  expect(result.stages[1]).toMatchObject({ stage: 'scenario', status: 'pass' })
  expect(result.stages[2]).toMatchObject({
    stage: 'grading',
    status: 'fail',
    expectations: { passed: 7, total: 8 },
  })
  expect(result.summary).toEqual({ errors: 1, warnings: 0 }) // the one failed expectation
  expect(runner.requests.every(r => r.model === 'sonnet')).toBe(true)
})

test('model option flows through to every runner request', async () => {
  const evals = JSON.parse(readFileSync(join(COMPRESS, 'evals/evals.json'), 'utf8')) as {
    evals: Array<{ expectations: string[] }>
  }
  const executorOk = completed('done', { events: [resultEvent('done')] })
  const runner = fakeRunner([
    executorOk, completed(gradingReply(evals.evals[0].expectations.map(text => ({ text, passed: true })))),
    executorOk, completed(gradingReply(evals.evals[1].expectations.map(text => ({ text, passed: true })))),
    executorOk, completed(gradingReply(evals.evals[2].expectations.map(text => ({ text, passed: true })))),
  ])
  await testSkill(parseSkill(COMPRESS), { run: true, model: 'haiku', runner, cacheRoot: mkdtempSync(join(tmpdir(), 'sk-')) })
  expect(runner.requests.every(r => r.model === 'haiku')).toBe(true)
})
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test tests/harness/test-skill.test.ts`
Expected: FAIL — `testSkill` does not accept options / returns non-promise stages with `unavailable`.

- [ ] **Step 3: Implement**

`src/lib/harness/types.ts` — replace the `StageReport` union:

```ts
import type { Severity } from '../types'
import type { ScenarioRunMeta } from './executor'

export interface HarnessFinding {
  severity: Severity
  message: string
  file: string
  line: number | null
}

export type StageReport =
  | { stage: 'deterministic'; status: 'pass' | 'fail'; findings: HarnessFinding[] }
  | { stage: 'scenario'; status: 'pass' | 'fail'; findings: HarnessFinding[]; runs: ScenarioRunMeta[] }
  | { stage: 'grading'; status: 'pass' | 'fail'; findings: HarnessFinding[]; expectations: { passed: number; total: number } }
  | { stage: 'scenario' | 'grading'; status: 'skipped'; note: string }

export interface TestResult {
  skill: { dir: string; name: string | null }
  stages: StageReport[]
  summary: { errors: number; warnings: number }
}
```

`src/lib/harness/index.ts` — full replacement:

```ts
import type { ParsedSkill } from '../types'
import type { ClaudeRunner } from './claude-runner'
import { DEFAULT_MODEL, spawnClaudeRunner } from './claude-runner'
import { runDeterministic } from './deterministic'
import { runLlmStages } from './llm-stages'
import { cacheRoot } from './run-dir'
import type { HarnessFinding, StageReport, TestResult } from './types'

export type { HarnessFinding, StageReport, TestResult } from './types'
export { ClaudeUnavailableError, DEFAULT_MODEL, RUN_TIMEOUT_MS } from './claude-runner'
export type { ClaudeRunner } from './claude-runner'

export interface TestOptions {
  run?: boolean
  fresh?: boolean
  model?: string
  runner?: ClaudeRunner
  cacheRoot?: string
}

const SKIP_NO_RUN = 'pass --run to execute LLM stages'
const SKIP_DET_FAILED = 'deterministic stage failed'

const countBySeverity = (findings: HarnessFinding[]): { errors: number; warnings: number } => {
  const errors = findings.filter(f => f.severity === 'error').length
  return { errors, warnings: findings.length - errors }
}

export async function testSkill(skill: ParsedSkill, options: TestOptions = {}): Promise<TestResult> {
  const detFindings = runDeterministic(skill)
  const det = countBySeverity(detFindings)
  const deterministic: StageReport = { stage: 'deterministic', status: det.errors > 0 ? 'fail' : 'pass', findings: detFindings }

  let scenario: StageReport
  let grading: StageReport
  if (!options.run) {
    scenario = { stage: 'scenario', status: 'skipped', note: SKIP_NO_RUN }
    grading = { stage: 'grading', status: 'skipped', note: SKIP_NO_RUN }
  } else if (det.errors > 0) {
    scenario = { stage: 'scenario', status: 'skipped', note: SKIP_DET_FAILED }
    grading = { stage: 'grading', status: 'skipped', note: SKIP_DET_FAILED }
  } else {
    const res = await runLlmStages(skill, {
      runner: options.runner ?? spawnClaudeRunner(),
      cacheRoot: options.cacheRoot ?? cacheRoot(),
      model: options.model ?? DEFAULT_MODEL,
      fresh: options.fresh ?? false,
    })
    scenario = res.scenario
    grading = res.grading
  }

  const allFindings = [deterministic, scenario, grading].flatMap(s => ('findings' in s ? s.findings : []))
  const name = skill.frontmatter.parsed?.['name']
  return {
    skill: { dir: skill.dir, name: typeof name === 'string' ? name : null },
    stages: [deterministic, scenario, grading],
    summary: countBySeverity(allFindings),
  }
}
```

`src/lib/harness/llm-stages.ts` — delete the local `ScenarioStage`/`GradingStage` interfaces and import the union member shapes structurally instead: change the return type to

```ts
Promise<{
  scenario: Extract<StageReport, { stage: 'scenario'; status: 'pass' | 'fail' }>
  grading: Extract<StageReport, { stage: 'grading'; status: 'pass' | 'fail' }>
}>
```

importing `StageReport` from `./types` (keep the function body unchanged).

`tests/harness/deterministic.test.ts` — re-pin the `testSkill` pipeline test (lines 109–128): the test callback becomes `async`, every `testSkill(...)` gains `await`, and the two stage pins become:

```ts
    { stage: 'scenario', status: 'skipped', note: 'pass --run to execute LLM stages' },
    { stage: 'grading', status: 'skipped', note: 'pass --run to execute LLM stages' },
```

No other assertion in that file changes.

- [ ] **Step 4: Run tests + typecheck, commit**

Run: `bun test tests/harness/`, then `bun test`, `bun run typecheck`.
Expected: harness suite green; `tests/cli/*` now FAIL on the old pins — that is expected and fixed in Tasks 8–9. If the full suite must stay green per commit, fold the Task 8–9 re-pins forward: instead run only `bun test tests/harness tests/rules tests/evals` here and commit Tasks 7–9 in sequence within the same working session, with the full `bun test` gate at Task 9's commit. Record in the ledger that Tasks 7, 8, 9 form one green-suite unit; Tasks 7 and 8 commit with their own scoped suites green and typecheck green.

```bash
git add src/lib/harness tests/harness
git commit -m "feat(harness): async testSkill pipeline with skipped/executed stage reports"
```

---

### Task 8: Formatters — test-JSON key orders and pretty output variants

**Files:**
- Modify: `src/cli/format/test-json.ts`
- Modify: `src/cli/format/test-pretty.ts`
- Modify: `tests/cli/format-test.test.ts`

**Interfaces:**
- Consumes: Task 7 `StageReport`/`TestResult`.
- Produces: `jsonTestReport` and `formatTestPretty` handling all four stage shapes — consumed by Task 9.

- [ ] **Step 1: Rewrite the format tests**

`tests/cli/format-test.test.ts` — full replacement:

```ts
import { expect, test } from 'bun:test'
import type { StageReport, TestResult } from '../../src/lib/harness/types'
import { jsonTestReport } from '../../src/cli/format/test-json'
import { formatTestPretty } from '../../src/cli/format/test-pretty'

type Finding = { severity: 'error' | 'warn'; message: string; file: string; line: number | null }

const skipped = (note: string): StageReport[] => [
  { stage: 'scenario', status: 'skipped', note },
  { stage: 'grading', status: 'skipped', note },
]

const result = (errors: number, warnings: number, findings: Finding[], llm?: StageReport[]): TestResult => ({
  skill: { dir: '/abs/demo-skill', name: 'demo-skill' },
  stages: [
    { stage: 'deterministic', status: findings.some(f => f.severity === 'error') ? 'fail' : 'pass', findings },
    ...(llm ?? skipped('pass --run to execute LLM stages')),
  ],
  summary: { errors, warnings },
})

const executed = (): StageReport[] => [
  {
    stage: 'scenario',
    status: 'fail',
    findings: [{ severity: 'error', message: 'eval 1: executor timeout — timed out after 300000ms', file: 'evals/evals.json', line: null }],
    runs: [
      { evalId: 1, cached: false, status: 'timeout', durationSeconds: 300 },
      { evalId: 2, cached: true, status: 'ok', durationSeconds: 0 },
      { evalId: 3, cached: false, status: 'ok', durationSeconds: 41.5 },
    ],
  },
  {
    stage: 'grading',
    status: 'fail',
    findings: [{ severity: 'error', message: 'eval 3 expectation failed: "x" — no evidence', file: 'evals/evals.json', line: null }],
    expectations: { passed: 5, total: 6 },
  },
]

test('jsonTestReport: exact top-level shape and key order', () => {
  const rep = jsonTestReport(result(0, 0, []))
  expect(Object.keys(rep)).toEqual(['version', 'mode', 'skill', 'stages', 'summary'])
  expect(rep.version).toBe(1)
  expect(rep.mode).toBe('test')
  expect(rep.stages).toHaveLength(3)
})

test('jsonTestReport: skipped stage key order is stage, status, note', () => {
  const rep = jsonTestReport(result(0, 0, []))
  expect(Object.keys(rep.stages[1] as Record<string, unknown>)).toEqual(['stage', 'status', 'note'])
  expect(rep.stages[1]).toEqual({ stage: 'scenario', status: 'skipped', note: 'pass --run to execute LLM stages' })
})

test('jsonTestReport: executed scenario and grading key orders, runs entry order', () => {
  const rep = jsonTestReport(result(2, 0, [], executed()))
  const scenario = rep.stages[1] as Record<string, unknown>
  expect(Object.keys(scenario)).toEqual(['stage', 'status', 'findings', 'runs'])
  expect(Object.keys((scenario.runs as Record<string, unknown>[])[0])).toEqual(['evalId', 'cached', 'status', 'durationSeconds'])
  const grading = rep.stages[2] as Record<string, unknown>
  expect(Object.keys(grading)).toEqual(['stage', 'status', 'findings', 'expectations'])
  expect(Object.keys(grading.expectations as Record<string, unknown>)).toEqual(['passed', 'total'])
})

test('jsonTestReport: finding key order is severity, message, file, line', () => {
  const rep = jsonTestReport(result(1, 0, [{ severity: 'error', message: 'boom', file: 'evals/evals.json', line: null }]))
  const stage = rep.stages[0] as { findings: unknown[] }
  expect(Object.keys(stage.findings[0] as Record<string, unknown>)).toEqual(['severity', 'message', 'file', 'line'])
})

test('pretty: no --run shows skipped stages and the skip summary', () => {
  const out = formatTestPretty(result(0, 0, []))
  expect(out).toContain('deterministic  PASS')
  expect(out).toContain('scenario       skipped (pass --run to execute LLM stages)')
  expect(out).toContain('grading        skipped (pass --run to execute LLM stages)')
  expect(out).toContain('deterministic: 0 errors, 0 warnings · scenario/grading skipped (pass --run)')
})

test('pretty: deterministic failure under --run shows the blocked summary', () => {
  const out = formatTestPretty(
    result(1, 0, [{ severity: 'error', message: 'boom', file: 'evals/evals.json', line: null }], skipped('deterministic stage failed')),
  )
  expect(out).toContain('deterministic: 1 error, 0 warnings · scenario/grading skipped (deterministic stage failed)')
})

test('pretty: executed stages show PASS/FAIL, findings, and the run summary line', () => {
  const out = formatTestPretty(result(2, 0, [], executed()))
  expect(out).toContain('scenario       FAIL')
  expect(out).toContain('error  evals/evals.json  eval 1: executor timeout — timed out after 300000ms')
  expect(out).toContain('grading        FAIL')
  expect(out).toContain('deterministic: 0 errors, 0 warnings · scenario: 2/3 runs ok (1 cached) · grading: 5/6 expectations passed')
})

test('pretty: singular pluralization in the executed summary', () => {
  const llm: StageReport[] = [
    { stage: 'scenario', status: 'pass', findings: [], runs: [{ evalId: 1, cached: false, status: 'ok', durationSeconds: 2 }] },
    { stage: 'grading', status: 'pass', findings: [], expectations: { passed: 1, total: 1 } },
  ]
  const out = formatTestPretty(result(0, 0, [], llm))
  expect(out).toContain('scenario: 1/1 run ok (0 cached) · grading: 1/1 expectation passed')
})
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test tests/cli/format-test.test.ts`
Expected: FAIL — formatters still emit `unavailable` shapes.

- [ ] **Step 3: Implement**

`src/cli/format/test-json.ts` — full replacement:

```ts
import type { StageReport, TestResult } from '../../lib/harness/types'

export interface TestJsonReport {
  version: 1
  mode: 'test'
  skill: { dir: string; name: string | null }
  stages: StageReport[]
  summary: { errors: number; warnings: number }
}

export function jsonTestReport(result: TestResult): TestJsonReport {
  return {
    version: 1,
    mode: 'test',
    skill: result.skill,
    stages: result.stages.map((s): StageReport => {
      if (s.status === 'skipped') return { stage: s.stage, status: s.status, note: s.note }
      const findings = s.findings.map(f => ({ severity: f.severity, message: f.message, file: f.file, line: f.line }))
      if (s.stage === 'scenario') {
        return {
          stage: s.stage,
          status: s.status,
          findings,
          runs: s.runs.map(r => ({ evalId: r.evalId, cached: r.cached, status: r.status, durationSeconds: r.durationSeconds })),
        }
      }
      if (s.stage === 'grading') {
        return { stage: s.stage, status: s.status, findings, expectations: { passed: s.expectations.passed, total: s.expectations.total } }
      }
      return { stage: s.stage, status: s.status, findings }
    }),
    summary: result.summary,
  }
}
```

`src/cli/format/test-pretty.ts` — full replacement:

```ts
import { basename } from 'node:path'
import pc from 'picocolors'
import type { HarnessFinding, StageReport, TestResult } from '../../lib/harness/types'

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

const findingLines = (findings: HarnessFinding[], lines: string[]): void => {
  for (const f of findings) {
    const sev = f.severity === 'error' ? pc.red('error') : pc.yellow('warn ')
    lines.push(`    ${sev}  ${f.file}  ${f.message}`)
  }
}

function summaryTail(scenario: StageReport, grading: StageReport): string {
  if (scenario.status === 'skipped') {
    return scenario.note === 'deterministic stage failed'
      ? 'scenario/grading skipped (deterministic stage failed)'
      : 'scenario/grading skipped (pass --run)'
  }
  const runs = scenario.stage === 'scenario' && 'runs' in scenario ? scenario.runs : []
  const ok = runs.filter(r => r.status === 'ok').length
  const cached = runs.filter(r => r.cached).length
  const exp = grading.stage === 'grading' && 'expectations' in grading ? grading.expectations : { passed: 0, total: 0 }
  const runWord = runs.length === 1 ? 'run' : 'runs'
  const expWord = exp.total === 1 ? 'expectation' : 'expectations'
  return `scenario: ${ok}/${runs.length} ${runWord} ok (${cached} cached) · grading: ${exp.passed}/${exp.total} ${expWord} passed`
}

export function formatTestPretty(result: TestResult): string {
  const lines: string[] = [pc.underline(basename(result.skill.dir))]
  for (const s of result.stages) {
    if (s.stage === 'deterministic') {
      lines.push(`  deterministic  ${s.status === 'fail' ? pc.red('FAIL') : pc.green('PASS')}`)
      findingLines(s.findings, lines)
    } else if (s.status === 'skipped') {
      lines.push(`  ${s.stage.padEnd(13)}  ${pc.dim(`skipped (${s.note})`)}`)
    } else {
      lines.push(`  ${s.stage.padEnd(13)}  ${s.status === 'fail' ? pc.red('FAIL') : pc.green('PASS')}`)
      findingLines(s.findings, lines)
    }
  }
  lines.push('')
  const [, scenario, grading] = result.stages
  lines.push(
    pc.bold(
      `deterministic: ${plural(result.summary.errors, 'error')}, ${plural(result.summary.warnings, 'warning')} · ${summaryTail(scenario, grading)}`,
    ),
  )
  return lines.join('\n')
}
```

Note: the summary's error/warning counts span all stages (Task 7 computes them that way); the pretty line's label `deterministic:` is retained from M4a for the leading counts — the keystone strings in Task 9 pin the full lines.

- [ ] **Step 4: Run tests + typecheck, commit**

Run: `bun test tests/cli/format-test.test.ts`, then `bun test tests/harness tests/cli/format-test.test.ts`, `bun run typecheck`.
Expected: PASS (remaining `tests/cli` failures are Task 9's re-pins).

```bash
git add src/cli/format/test-json.ts src/cli/format/test-pretty.ts tests/cli/format-test.test.ts
git commit -m "feat(cli): test formatters for skipped and executed LLM stages"
```

---

### Task 9: CLI — flags, guards, deps injection, keystone re-pins, full suite green

**Files:**
- Modify: `src/cli/test.ts`
- Modify: `src/cli/index.ts` (USAGE line only)
- Modify: `tests/cli/test-command.test.ts`
- Modify: `tests/cli/test-keystone.test.ts`
- Modify: `tests/skill/using-shakespii.test.ts` (only if the weld's `shakespii test` lock pins a changed string — it pins `stages[0]` and `summary` only, so expected: no change; verify)

**Interfaces:**
- Consumes: Tasks 7–8.
- Produces: `runTest(argv, deps?): Promise<number>` with `RunTestDeps = { runner?: ClaudeRunner; cacheRoot?: string }`.

- [ ] **Step 1: Extend the CLI tests**

In `tests/cli/test-command.test.ts`:

Re-pins (exact swaps):
- line 55: `expect(out).toContain('scenario       skipped (pass --run to execute LLM stages)')`
- line 56: `expect(out).toContain('deterministic: 0 errors, 1 warning · scenario/grading skipped (pass --run)')`
- lines 72–77 (the old `unknown option: --fresh` test) — replace with:

```ts
test('unknown option: loud failure, exit 2', () => {
  const r = run(['test', join(FIXTURES, 'two-cases'), '--bogus'])
  expect(r.exitCode).toBe(2)
  expect(r.stderr.toString()).toContain('unknown option: --bogus')
  expect(r.stderr.toString()).toContain('usage: shakespii test <path> [--json] [--run] [--fresh] [--model <name>]')
})

test('--fresh and --model require --run; --model requires a value', () => {
  const fresh = run(['test', join(FIXTURES, 'two-cases'), '--fresh'])
  expect(fresh.exitCode).toBe(2)
  expect(fresh.stderr.toString()).toContain('--fresh requires --run')
  const model = run(['test', join(FIXTURES, 'two-cases'), '--model', 'sonnet'])
  expect(model.exitCode).toBe(2)
  expect(model.stderr.toString()).toContain('--model requires --run')
  const noValue = run(['test', join(FIXTURES, 'two-cases'), '--run', '--model'])
  expect(noValue.exitCode).toBe(2)
  expect(noValue.stderr.toString()).toContain('--model requires a value')
})
```

- line 99 (`--help` pin): `expect(r.stdout.toString()).toContain('test <path> [--json] [--run]')`

Append integration tests (stub binary over PATH — end-to-end wiring without tokens):

```ts
import { chmodSync, writeFileSync } from 'node:fs' // merge into the existing imports

test('--run end to end with a failing stub claude: scenario findings, runs metadata, exit 1', () => {
  const stubDir = mkdtempSync(join(tmpdir(), 'shakespii-claude-stub-'))
  writeFileSync(join(stubDir, 'claude'), '#!/bin/sh\necho "stub cannot run" >&2\nexit 3\n')
  chmodSync(join(stubDir, 'claude'), 0o755)
  const cache = mkdtempSync(join(tmpdir(), 'shakespii-cli-cache-'))
  const r = Bun.spawnSync(['bun', CLI, 'test', join(FIXTURES, 'compress'), '--run', '--json'], {
    cwd: tmpdir(),
    env: { ...process.env, PATH: `${stubDir}:${process.env.PATH}`, SHAKESPII_CACHE_DIR: cache },
  })
  expect(r.exitCode).toBe(1)
  const rep = JSON.parse(r.stdout.toString())
  expect(rep.stages[1].status).toBe('fail')
  expect(rep.stages[1].findings[0].message).toContain('eval 1: executor nonzero-exit')
  expect(rep.stages[1].runs).toHaveLength(3)
  expect(rep.stages[2]).toEqual({ stage: 'grading', status: 'pass', findings: [], expectations: { passed: 0, total: 0 } })
})

test('--run without claude on PATH: exit 2 with the contractual message', () => {
  const emptyPath = mkdtempSync(join(tmpdir(), 'shakespii-empty-path-'))
  const cache = mkdtempSync(join(tmpdir(), 'shakespii-cli-cache2-'))
  const r = Bun.spawnSync([process.execPath, CLI, 'test', join(FIXTURES, 'compress'), '--run'], {
    cwd: tmpdir(),
    env: { ...process.env, PATH: emptyPath, SHAKESPII_CACHE_DIR: cache },
  })
  expect(r.exitCode).toBe(2)
  expect(r.stderr.toString()).toContain('test failed: claude CLI not found — install Claude Code or put claude on PATH')
})
```

(`process.execPath` is the running bun binary — the child resolves without PATH.)

In `tests/cli/test-keystone.test.ts`:
- stages entries re-pin to `{ stage: 'scenario', status: 'skipped', note: 'pass --run to execute LLM stages' }` and the grading twin.
- line 39 re-pin: `expect(r.stdout.toString()).toContain('deterministic: 0 errors, 0 warnings · scenario/grading skipped (pass --run)')`

- [ ] **Step 2: Run to verify failure**

Run: `bun test tests/cli/test-command.test.ts tests/cli/test-keystone.test.ts`
Expected: FAIL — flags unknown, old strings emitted.

- [ ] **Step 3: Implement**

`src/cli/test.ts` — full replacement:

```ts
import { existsSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { ClaudeRunner } from '../lib/harness'
import { testSkill } from '../lib/harness'
import { parseSkill } from '../lib/parser'
import { jsonTestReport } from './format/test-json'
import { formatTestPretty } from './format/test-pretty'

const USAGE = 'usage: shakespii test <path> [--json] [--run] [--fresh] [--model <name>]'

export interface RunTestDeps {
  runner?: ClaudeRunner
  cacheRoot?: string
}

export async function runTest(argv: string[], deps: RunTestDeps = {}): Promise<number> {
  let json = false
  let run = false
  let fresh = false
  let model: string | undefined
  const positionals: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--json') {
      json = true
    } else if (a === '--run') {
      run = true
    } else if (a === '--fresh') {
      fresh = true
    } else if (a === '--model') {
      const v = argv[i + 1]
      if (v === undefined || v.startsWith('-')) {
        console.error(`--model requires a value\n${USAGE}`)
        return 2
      }
      model = v
      i += 1
    } else if (a.startsWith('-')) {
      console.error(`unknown option: ${a}\n${USAGE}`)
      return 2
    } else {
      positionals.push(a)
    }
  }
  if (fresh && !run) {
    console.error(`--fresh requires --run\n${USAGE}`)
    return 2
  }
  if (model !== undefined && !run) {
    console.error(`--model requires --run\n${USAGE}`)
    return 2
  }
  if (positionals.length !== 1) {
    console.error(USAGE)
    return 2
  }
  const dir = resolve(positionals[0])
  let isDir = false
  try {
    isDir = statSync(dir).isDirectory()
  } catch {
    isDir = false
  }
  if (!isDir) {
    console.error(`not a directory: ${dir}`)
    return 2
  }
  if (!existsSync(join(dir, 'SKILL.md'))) {
    console.error(`not a skill: no SKILL.md at ${dir}`)
    return 2
  }
  try {
    const skill = parseSkill(dir)
    const result = await testSkill(skill, { run, fresh, model, runner: deps.runner, cacheRoot: deps.cacheRoot })
    console.log(json ? JSON.stringify(jsonTestReport(result), null, 2) : formatTestPretty(result))
    return result.summary.errors > 0 ? 1 : 0
  } catch (e) {
    console.error(`test failed: ${(e as Error).message}`)
    return 2
  }
}
```

`src/cli/index.ts` — replace the `test` USAGE line with:

```
  test <path> [--json] [--run]        run harness checks; --run executes LLM stages
```

(The dispatch itself needs no change: `runTest` returning a promise is awaited by `return` inside async `main`.)

- [ ] **Step 4: Run the FULL suite + typecheck, commit**

Run: `bun test` (must be fully green — this closes the Task 7–9 unit) and `bun run typecheck`.
Expected: all PASS, including `tests/skill/using-shakespii.test.ts` unmodified (its `shakespii test` lock pins `summary` and `stages[0]` only).

```bash
git add src/cli/test.ts src/cli/index.ts tests/cli/test-command.test.ts tests/cli/test-keystone.test.ts
git commit -m "feat(cli): shakespii test --run/--fresh/--model with injected deps and re-pinned keystones"
```

---

### Task 10: Calibration — predictions, live sweep, cache proof, fixture validation

Spec §10. **This is the only task that spends tokens** (8 executor + 8 grader sonnet sessions, plus up to 8 grader retries worst-case). Requires `claude` on PATH and `ANTHROPIC` auth in the shell; run commands directly (not sandboxed), never pipe `bun`/`shakespii` output.

**Files:**
- Create: `docs/CALIBRATION-M4B1.md`
- Possibly modify: `tests/fixtures/harness/stream-json/*.jsonl` (fixture strengthening only)

- [ ] **Step 1: Commit predictions BEFORE the sweep** (separate commit)

Write `docs/CALIBRATION-M4B1.md` with a Predictions section (verbatim structure):

```markdown
# M4b-1 calibration — executor + grader live sweep

Budget (spec §0.4): using-shakespii (5 evals) + compress fixture (3 evals),
1 run/eval, sonnet. Sequencing rule (spec §10): this sweep runs BEFORE the
using-shakespii v0.4.0 changes; the suite has exactly 5 cases at sweep time.

## Predictions (committed before the sweep)

- P1: `shakespii test skills/using-shakespii --run` exits 0 or 1 with all 5
  scenario runs `status: "ok"` (no executor timeouts/crashes).
- P2: `shakespii test tests/fixtures/harness/compress --run` exits 0 or 1
  with all 3 scenario runs `status: "ok"`; eval 1's staged
  `evals/files/sample-memory.md` is present in the run workspace.
- P3: every produced grading.json passes validateGradingJson and rubric
  fidelity (no grader-invalid findings on either skill).
- P4: compress evals 1–3 pass-rate ≥ 0.5 each (the repaired fixture is
  runnable and the skill's procedure is followable by sonnet).
- P5: immediate second sweep of both skills: 8/8 runs `cached: true`,
  zero runner sessions, sub-second wall time per skill.
- P6: captured events.jsonl streams contain only event shapes already
  covered by the hand-authored parser fixtures (assistant text/tool_use,
  user tool_result, result) — any novel shape strengthens the fixtures.

## Actuals

(recorded verbatim after the sweep)

## Cache proof

(recorded after the second sweep)

## Fixture validation

(events.jsonl shape comparison vs tests/fixtures/harness/stream-json/)

## Adjudications

(classes: harness bug / miscalibration / eval-authoring miss;
grader-verdict disputes recorded with evidence; expectation rewording is
recorded, never applied in this commit)
```

```bash
git add docs/CALIBRATION-M4B1.md
git commit -m "docs(m4b1): calibration predictions (pre-sweep)"
```

- [ ] **Step 2: Sweep** (live, sequential)

Run and capture verbatim (exit codes + JSON):

```bash
bun src/cli/index.ts test skills/using-shakespii --run --json; echo "exit=$?"
bun src/cli/index.ts test tests/fixtures/harness/compress --run --json; echo "exit=$?"
```

Record per-skill: exit code, `stages[1].runs`, `stages[2].expectations`, every finding message verbatim, wall time.

- [ ] **Step 3: Cache proof** — immediately re-run both commands; record that every `runs[]` entry is `cached: true`, runner sessions = 0 (wall time sub-second per skill).

- [ ] **Step 4: Fixture validation** — inspect the captured `events.jsonl` files under the cache root (`$XDG_CACHE_HOME/shakespii` or `~/.cache/shakespii`); compare event shapes against `tests/fixtures/harness/stream-json/`. If reality contains shapes the fixtures lack (e.g. different result-event fields), STRENGTHEN the fixtures/tests in this task — never weaken an assertion. Re-run `bun test` if fixtures changed.

- [ ] **Step 5: Fill Actuals / Cache proof / Fixture validation / Adjudications sections verbatim; sync + commit**

```bash
cp docs/CALIBRATION-M4B1.md ~/.ai-pref-nsync/local-docs/ai-shakespii/knowledge-references/
cmp ~/.ai-pref-nsync/local-docs/ai-shakespii/knowledge-references/CALIBRATION-M4B1.md docs/CALIBRATION-M4B1.md
git add docs/CALIBRATION-M4B1.md tests/fixtures/harness/stream-json tests/harness
git commit -m "docs(m4b1): calibration sweep actuals, cache proof, fixture validation"
```

Note: grader verdicts on individual expectations may legitimately fail (real skill behavior) — those are findings to record, not bugs to fix. Only harness defects (crashes, schema failures, staging errors) block this task.

---

### Task 11: using-shakespii v0.4.0 — teach `--run`, sixth eval, weld re-pins

**Sequencing:** MUST land after Task 10 (spec §10 rule). The sixth eval is deterministic-stage-only in M4b-1.

**Files:**
- Modify: `skills/using-shakespii/SKILL.md`
- Modify: `skills/using-shakespii/evals/evals.json`
- Modify: `tests/skill/using-shakespii.test.ts`

- [ ] **Step 1: Extend the weld test first**

In `tests/skill/using-shakespii.test.ts`:
- Add `'Run the evals for'` to `REQUIRED_PROMPT_ANCHORS`.
- Change the count assertion to `expect(evals.evals.length).toBeGreaterThanOrEqual(6)`.

Run: `bun test tests/skill/using-shakespii.test.ts` — expect FAIL (anchor missing).

- [ ] **Step 2: SKILL.md edits**

Frontmatter: `version: 0.3.0` → `version: 0.4.0`; description becomes:

```
description: "Use when creating a new agent skill or auditing, linting, testing, or fixing an existing one — drives the shakespii CLI (init, lint --json, test --run) to scaffold standard SKILL.md skills and resolve findings until clean."
```

Replace the entire "### Testing a skill's evals" section body with:

````markdown
### Testing a skill's evals

After a skill lints clean, verify its eval suite with the harness:

```bash
shakespii test <skill-dir> --json
```

Exit codes: 0 = no error findings (warnings allowed), 1 = error findings to
fix, 2 = the run itself failed (bad path, no SKILL.md, claude CLI missing).
The deterministic stage checks that `evals/evals.json` exists, parses,
follows the skill-creator schema (`skill_name` equal to the frontmatter
name, unique integer ids, non-empty prompts and expectations, at least
three cases), and references only files that exist inside the skill
directory. Without `--run` the `scenario` and `grading` stages report
`skipped` — the command is free and safe to loop on.

To actually execute the evals — a headless agent runs each case, then an
LLM grader scores every expectation with cited evidence — add `--run`:

```bash
shakespii test <skill-dir> --run --json
```

`--run` spends real tokens (one executor and one grader session per eval
case), so confirm with the human before the first run on a suite. Results
are cached per (skill content, eval, model): re-running after no changes
replays instantly from cache; editing the skill or its evals re-runs only
because the content hash changed. `--fresh` forces re-execution despite the
cache; `--model <name>` overrides the default executor/grader model
(sonnet). Fix loop: deterministic findings name the JSON path of the defect
in `evals/evals.json`; `scenario` findings mean the executor run itself
failed (timeout, crash); `grading` findings quote the failed expectation
and the grader's evidence — fix the skill (or a genuinely wrong
expectation, with the human's approval) and re-run until exit 0.
````

(The section keeps fenced `bash` blocks inside the markdown body, as the current file does.)

- [ ] **Step 3: Sixth eval case** — append to `skills/using-shakespii/evals/evals.json` (after id 5):

```json
{
  "id": 6,
  "prompt": "Run the evals for ~/.claude/skills/compress and tell me which expectations fail.",
  "expected_output": "The agent confirms token spend with the human, runs shakespii test with --run and --json, reads the scenario and grading findings, and reports each failed expectation with the grader's evidence — re-running from cache when nothing changed.",
  "files": [],
  "expectations": [
    "Confirms with the human before the first token-spending --run",
    "Invokes `shakespii test <dir> --run --json` rather than executing evals by hand",
    "Distinguishes scenario findings (executor failures) from grading findings (failed expectations)",
    "Reports failed expectations verbatim with the grader's evidence",
    "Relies on the cache for unchanged re-runs instead of passing --fresh by default"
  ]
}
```

- [ ] **Step 4: Verify the weld end to end**

Run: `bun test tests/skill/using-shakespii.test.ts` — expect PASS (lint zero findings at v0.4.0, six cases, anchors present, `shakespii test` lock still `{0,0}` — the deterministic stage sees six valid cases).
Run: `bun test` and `bun run typecheck` — all green.

- [ ] **Step 5: Commit**

```bash
git add skills/using-shakespii tests/skill/using-shakespii.test.ts
git commit -m "feat(skill): using-shakespii v0.4.0 — teach shakespii test --run loop"
```

---

### Task 12: Documentation — HARNESS.md rewrite, ROADMAP split, README, mirrors

**Files:**
- Modify: `docs/HARNESS.md`
- Modify: `docs/ROADMAP.md`
- Modify: `README.md`

- [ ] **Step 1: `docs/HARNESS.md`** — full replacement:

```markdown
# shakespii test harness — contract

Status: M4b-1 shipped (deterministic + scenario + grading stages; scenario
and grading are opt-in via --run). M4b-2 pending (TR02 trigger eval,
benchmark stats). Upstream schema authority: skill-creator
`references/schemas.md` (pinned evidence, vintage 2026-07 — see
profiles/default.yaml provenance).

## Stage pipeline

`shakespii test <path> [--json] [--run] [--fresh] [--model <name>]` runs
three stages, always in this order: `deterministic`, `scenario`, `grading`.

- Without `--run`, scenario/grading report
  `status: "skipped", note: "pass --run to execute LLM stages"` and the
  command is free — no LLM calls, ever. TR01 (lint) delegates to the
  deterministic stage only; lint never spends tokens.
- With `--run`, each eval case is executed headlessly (`claude -p`,
  stream-json, model default `sonnet`, 300s timeout per LLM call) and then
  graded by a second LLM call. If the deterministic stage produced errors,
  both LLM stages report `status: "skipped", note: "deterministic stage
  failed"` — an invalid suite never burns tokens. Deterministic warnings
  alone do not block.
- `--fresh` and `--model` require `--run` (usage error, exit 2, otherwise).

Exit codes: 0 — no error findings (warnings allowed); 1 — at least one
error finding (failed expectations, executor/grader failures included);
2 — run error only (bad usage, unreadable target, `claude` CLI not
spawnable, unexpected exception).

**Permissions bypass — accepted risk.** The executor runs
`claude -p --dangerously-skip-permissions` inside a disposable per-run
workspace. This is opt-in (`--run`), intended for the user's own trusted
skills; the workspace cwd is containment by convention, not a sandbox — a
malicious skill could escape via Bash. Do NOT point `--run` at untrusted
third-party skills.

## test-JSON v1

Top-level key order is contractual: `version, mode, skill, stages, summary`.
Findings: `severity, message, file, line` (no ruleId; schema-path detail is
folded into `message`). Executed scenario stage: `stage, status, findings,
runs` with runs entries `evalId, cached, status, durationSeconds`
(`status` ∈ ok | timeout | nonzero-exit | no-result). Executed grading
stage: `stage, status, findings, expectations` with `expectations`
`{passed, total}` counting graded expectations across cold and cached
cases. Skipped stages: `stage, status, note`. `summary` counts all findings
across stages.

## Executor

Per eval case (sequential, ascending id): runKey → run dir; cache check;
cold path stages a workspace (`outputs/`): the skill mounted at
`outputs/.claude/skills/<skill_name>/`, each eval `files` entry copied at
its skill-relative path. Prompt: force-load preamble ("Read
.claude/skills/<name>/SKILL.md first…") plus the eval prompt verbatim —
scenario evals measure capability with the skill; natural triggering is
TR02's concern (M4b-2). Executor failures (timeout / nonzero-exit /
completed with no result event) become scenario error findings; the case
is not graded and stays uncached.

## Grader

Second `claude -p` call, cwd = the run dir. The grader reads transcript.md
and outputs/ and replies with JSON; the harness validates
(`validateGradingJson` + rubric fidelity: expectation texts verbatim, same
count and order) and persists. One retry (shared budget across gate and
runner-level failures — at most two grader calls per case); the summary is
recomputed by the harness (LLM arithmetic is never trusted); grading.json
is written atomically (tmp + rename). Grading findings: one error per
failed expectation, quoting the text and the grader's evidence.

## Run-dir and cache (`src/lib/harness/run-dir.ts`)

- Cache root: `SHAKESPII_CACHE_DIR`, else `$XDG_CACHE_HOME/shakespii`,
  else `~/.cache/shakespii`. The harness never writes inside a skill dir.
- `skillContentHash`: sha256 over SKILL.md raw bytes plus every inventory
  file's (relPath, raw bytes), sorted; any byte change rotates the hash.
- `runKey({skillHash, evalId, model})`: first 16 hex of
  sha256(`HARNESS_SCHEMA_VERSION \n skillHash \n evalId \n model`).
- Layout: `<root>/runs/<skillName>/<runKey>/` holds `outputs/` (workspace:
  skill mount, staged files, agent artifacts, `metrics.json`),
  `events.jsonl` (raw stream-json), `transcript.md`, `timing.json`, and
  `grading.json` — written last, only after validation.
- **Cache-hit definition: `grading.json` exists under the runKey AND
  passes schema + rubric-fidelity validation against the current case.**
  A missing, unparseable, schema-invalid, or rubric-mismatched file is a
  self-healing miss. Cached replay derives identical findings
  deterministically at zero token cost.
- `HARNESS_SCHEMA_VERSION` (currently 1) bumps when the layout or grading
  contract changes. Eval runs are on-demand and cached — never per-commit.

## M4b-2 output contracts

`validateBenchmarkJson` (`src/lib/evals/validate.ts`) encodes the
`benchmark.json` shape (configurations `with_skill`/`without_skill`,
nested result, run_summary aggregate stats) that the M4b-2 benchmark
writer must satisfy.
```

- [ ] **Step 2: `docs/ROADMAP.md`** — replace the M4b section with:

```markdown
## M4b-1 — Test harness, LLM half: executor + grader (done 2026-07-08)

- [x] `ClaudeRunner` boundary: headless `claude -p` scenario runs (stream-json, per-call timeout, CLAUDECODE strip); whole suite tokenless via injected fakes
- [x] LLM rubric grading writing `grading.json` (M4a validators + rubric-fidelity gate; summary recomputed, atomic write); cached per (skill content, eval, model), on-demand
- [x] `shakespii test --run [--fresh] [--model <name>]`: scenario/grading stages live, opt-in; cache replay deterministic at zero tokens
- [x] Calibration sweep (docs/CALIBRATION-M4B1.md): using-shakespii + compress fixture, 8/8 cache proof
- [x] using-shakespii v0.4.0 teaches the `--run` loop

## M4b-2 — Test harness, LLM half: trigger eval + benchmark

- [ ] Trigger-accuracy eval (TR02) per skill-creator's design (~20 labeled queries incl. near-miss negatives, threshold on held-out split)
- [ ] Benchmark stats (`benchmark.json`, with/without skill, runs-per-eval > 1, variance)
- [ ] Live-compress evals sync (user sign-off; attached to the personal-skill-migration decision)
```

(Check off the milestones exactly as shipped; do not touch other sections.)

- [ ] **Step 3: `README.md`** — replace the test bullet with:

```markdown
- `shakespii test <path> [--json] [--run] [--fresh] [--model <name>]` — static checks on a skill's eval suite for free; `--run` executes the evals headlessly and LLM-grades every expectation, cached per (skill content, eval, model)
```

- [ ] **Step 4: Sync mirrors + verify + commit**

```bash
cp docs/HARNESS.md ~/.ai-pref-nsync/local-docs/ai-shakespii/knowledge-references/HARNESS.md
cp docs/ROADMAP.md ~/.ai-pref-nsync/local-docs/ai-shakespii/plans/ROADMAP.md
cmp ~/.ai-pref-nsync/local-docs/ai-shakespii/knowledge-references/HARNESS.md docs/HARNESS.md
cmp ~/.ai-pref-nsync/local-docs/ai-shakespii/plans/ROADMAP.md docs/ROADMAP.md
bun test
bun run typecheck
git add docs/HARNESS.md docs/ROADMAP.md README.md
git commit -m "docs(m4b1): close out M4b-1 — HARNESS contract, roadmap split, README"
```

(README is repo-only, no mirror — M4a precedent.)

---

## Final verification (before the whole-branch review)

```bash
bun test           # full suite green, exit 0 (unpiped)
bun run typecheck  # exit 0
git status --porcelain   # clean
```

Confirm the frozen surfaces: `git diff <base> -- profiles/ src/lib/rules/TR01.ts src/lib/harness/deterministic.ts src/cli/lint.ts src/cli/format/lint*.ts` shows no changes (deterministic.ts and lint surfaces untouched by every task).
