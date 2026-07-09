import { expect, test } from 'bun:test'
import { chmodSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ClaudeUnavailableError,
  DEFAULT_MODEL,
  RUN_TIMEOUT_MS,
  SETTLE_OUTER_BOUND_MS,
  settleWithGrace,
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
  expect(args).toEqual(['-p', 'do it', '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions', '--model', 'sonnet', '--setting-sources', 'project,local'])
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

const DETECT_LINES = [
  '{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"tu1","name":"Skill"}}}',
  '{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"command\\": \\"demo-skill\\"}"}}}',
  '{"type":"stream_event","event":{"type":"content_block_stop","index":0}}',
].join('\n')

test('detect mode adds --include-partial-messages to argv', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-detect-argv-'))
  const argsFile = join(dir, 'args.txt')
  const bin = stub(`printf '%s\\n' "$@" > "${argsFile}"\necho '{"type":"result","result":"done"}'`)
  await spawnClaudeRunner(bin).run({ prompt: 'x', cwd: dir, model: 'sonnet', timeoutMs: 10_000, detect: { skillName: 'demo-skill' } })
  const args = (await Bun.file(argsFile).text()).trim().split('\n')
  expect(args).toEqual(['-p', 'x', '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions', '--model', 'sonnet', '--setting-sources', 'project,local', '--include-partial-messages'])
})

test('detection fires: early process-group kill, status completed, triggered true', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-detect-kill-'))
  const marker = join(dir, 'orphan-survived.txt')
  const dataFile = join(dir, 'data.jsonl')
  writeFileSync(dataFile, `${DETECT_LINES}\n`)
  // Background child would write the marker after 2s; the group kill must reap it.
  const bin = stub(`(sleep 2; echo late > "${marker}") &\ncat "${dataFile}"\nsleep 30`)
  const started = performance.now()
  const res = await spawnClaudeRunner(bin).run({ prompt: 'x', cwd: dir, model: 'sonnet', timeoutMs: 20_000, detect: { skillName: 'demo-skill' } })
  expect(performance.now() - started).toBeLessThan(15_000)
  expect(res.status).toBe('completed')
  expect(res.triggered).toBe(true)
  await Bun.sleep(2_500)
  expect(existsSync(marker)).toBe(false)
}, 30_000)

test('clean completion without detection: triggered false', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-detect-clean-'))
  const bin = stub(`echo '{"type":"result","result":"done"}'`)
  const res = await spawnClaudeRunner(bin).run({ prompt: 'x', cwd: dir, model: 'sonnet', timeoutMs: 10_000, detect: { skillName: 'demo-skill' } })
  expect(res.status).toBe('completed')
  expect(res.triggered).toBe(false)
})

test('timeout in detect mode: status timeout, triggered absent', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-detect-timeout-'))
  const bin = stub('sleep 30')
  const res = await spawnClaudeRunner(bin).run({ prompt: 'x', cwd: dir, model: 'sonnet', timeoutMs: 300, detect: { skillName: 'demo-skill' } })
  expect(res.status).toBe('timeout')
  expect('triggered' in res).toBe(false)
}, 10_000)

test('non-detect requests carry no triggered field (frozen surface)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-detect-absent-'))
  const bin = stub(`echo '{"type":"result","result":"done"}'`)
  const res = await spawnClaudeRunner(bin).run({ prompt: 'x', cwd: dir, model: 'sonnet', timeoutMs: 10_000 })
  expect('triggered' in res).toBe(false)
})

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
