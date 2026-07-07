import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { FileEntry } from '../types'

const MAX_TEXT_SIZE = 1024 * 1024
const MAX_DEPTH = 5

function isBinary(buf: Buffer): boolean {
  return buf.subarray(0, 8192).includes(0)
}

function walk(root: string, rel: string, depth: number, out: FileEntry[]): void {
  if (depth > MAX_DEPTH) return
  for (const name of readdirSync(join(root, rel)).sort()) {
    if (name === '.git') continue
    const relPath = rel === '' ? name : `${rel}/${name}`
    const st = statSync(join(root, relPath))
    if (st.isDirectory()) {
      walk(root, relPath, depth + 1, out)
      continue
    }
    if (relPath === 'SKILL.md') continue
    if (st.size > MAX_TEXT_SIZE) {
      out.push({ relPath, size: st.size, text: null })
      continue
    }
    const buf = readFileSync(join(root, relPath))
    out.push({ relPath, size: st.size, text: isBinary(buf) ? null : buf.toString('utf8').replace(/\r\n/g, '\n') })
  }
}

export function walkInventory(dir: string): FileEntry[] {
  const out: FileEntry[] = []
  walk(dir, '', 0, out)
  return out.sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0))
}

/** Directory relPaths (including empty directories, which carry no FileEntry) — ST02 resolves directory link targets against this. */
export function walkDirs(dir: string): string[] {
  const out: string[] = []
  const walk = (rel: string, depth: number): void => {
    if (depth > MAX_DEPTH) return
    for (const name of readdirSync(join(dir, rel)).sort()) {
      if (name === '.git') continue
      const relPath = rel === '' ? name : `${rel}/${name}`
      if (statSync(join(dir, relPath)).isDirectory()) {
        out.push(relPath)
        walk(relPath, depth + 1)
      }
    }
  }
  walk('', 0)
  return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}
