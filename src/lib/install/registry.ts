import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface Provider {
  name: string
  root: string
  skillsDir: string
}

interface Entry {
  name: string
  root: string[]
  skills: string[]
}

// Third-party paths per the spec's provider research (spec §2.0); codex and
// ezio additionally verified on the development machine 2026-07-10.
const TABLE: Entry[] = [
  { name: 'claude', root: ['.claude'], skills: ['.claude', 'skills'] },
  { name: 'codex', root: ['.codex'], skills: ['.codex', 'skills'] },
  { name: 'cursor', root: ['.cursor'], skills: ['.cursor', 'skills'] },
  { name: 'antigravity', root: ['.gemini'], skills: ['.gemini', 'config', 'skills'] },
  { name: 'gemini', root: ['.gemini'], skills: ['.gemini', 'skills'] },
  { name: 'agents', root: ['.agents'], skills: ['.agents', 'skills'] },
  { name: 'ezio', root: ['.config', 'ai-ezio'], skills: ['.config', 'ai-ezio', 'skills'] },
]

export const PROVIDER_NAMES: string[] = TABLE.map(e => e.name)

export function resolveProvider(name: string, home: string = homedir()): Provider | null {
  const entry = TABLE.find(e => e.name === name)
  if (entry === undefined) return null
  return { name: entry.name, root: join(home, ...entry.root), skillsDir: join(home, ...entry.skills) }
}

export function detectProviders(home: string = homedir()): Provider[] {
  const out: Provider[] = []
  for (const entry of TABLE) {
    const p = resolveProvider(entry.name, home)
    if (p !== null && existsSync(p.root)) out.push(p)
  }
  return out
}
