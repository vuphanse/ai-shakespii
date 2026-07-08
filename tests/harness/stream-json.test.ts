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
