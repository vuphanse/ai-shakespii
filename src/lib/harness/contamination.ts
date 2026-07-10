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
