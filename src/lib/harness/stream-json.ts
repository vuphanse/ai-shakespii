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
