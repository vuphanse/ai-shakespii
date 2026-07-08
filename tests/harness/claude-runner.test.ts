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
