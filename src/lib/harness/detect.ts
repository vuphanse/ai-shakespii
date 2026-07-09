const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

export interface Detector {
  /** Feed one parsed stream-json event; returns true once the trigger verdict has fired. */
  feed(event: unknown): boolean
}

/**
 * Ported from skill-creator run_eval.py with two adjudicated deviations (spec §6):
 * verdicts fire at content_block_stop/message_stop (not mid-delta), and an
 * unrelated first tool_use does not end the scan.
 */
export function createDetector(skillName: string): Detector {
  const readNeedle = `.claude/skills/${skillName}/SKILL.md`
  let pending: 'Skill' | 'Read' | null = null
  let accumulated = ''
  let fired = false

  const matches = (tool: 'Skill' | 'Read', inputText: string): boolean => {
    if (tool === 'Skill') return inputText.includes(skillName)
    // Read fires only on a path ENDING in the mounted SKILL.md (spec §6 —
    // ".../SKILL.md.bak" or a longer nested path must NOT count). The input is
    // complete JSON at block stop; parse it and test file_path with endsWith.
    try {
      const input = JSON.parse(inputText) as Record<string, unknown>
      return typeof input.file_path === 'string' && input.file_path.endsWith(readNeedle)
    } catch {
      // defensive fallback for an unparsable accumulation: a JSON string value
      // ending with the path is the needle immediately followed by its closing quote
      return inputText.includes(`${readNeedle}"`)
    }
  }

  const settle = (): boolean => {
    if (pending !== null && matches(pending, accumulated)) fired = true
    pending = null
    accumulated = ''
    return fired
  }

  return {
    feed(event: unknown): boolean {
      if (fired || !isRecord(event)) return fired
      if (event.type === 'stream_event' && isRecord(event.event)) {
        const se = event.event
        if (se.type === 'content_block_start' && isRecord(se.content_block) && se.content_block.type === 'tool_use') {
          const name = se.content_block.name
          pending = name === 'Skill' || name === 'Read' ? name : null
          accumulated = ''
        } else if (se.type === 'content_block_delta' && pending !== null && isRecord(se.delta) && se.delta.type === 'input_json_delta') {
          if (typeof se.delta.partial_json === 'string') accumulated += se.delta.partial_json
        } else if (se.type === 'content_block_stop' || se.type === 'message_stop') {
          return settle()
        }
        return fired
      }
      if (event.type === 'assistant' && isRecord(event.message) && Array.isArray(event.message.content)) {
        for (const b of event.message.content) {
          if (!isRecord(b) || b.type !== 'tool_use') continue
          const name = b.name
          if (name !== 'Skill' && name !== 'Read') continue
          if (matches(name, JSON.stringify(b.input ?? null))) {
            fired = true
            return true
          }
        }
      }
      return fired
    },
  }
}
