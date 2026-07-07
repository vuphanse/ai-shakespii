import { expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { walkInventory } from '../../src/lib/parser/inventory'

function makeTree(): string {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-inv-'))
  writeFileSync(join(dir, 'SKILL.md'), '# excluded')
  writeFileSync(join(dir, 'README.md'), 'readme text')
  mkdirSync(join(dir, 'evals'))
  writeFileSync(join(dir, 'evals', 'evals.json'), '{}')
  writeFileSync(join(dir, 'bin.dat'), Buffer.from([0x41, 0x00, 0x42]))
  mkdirSync(join(dir, '.git'))
  writeFileSync(join(dir, '.git', 'HEAD'), 'ref: x')
  return dir
}

test('walkInventory: excludes SKILL.md and .git, loads text, nulls binary', () => {
  const entries = walkInventory(makeTree())
  expect(entries.map(e => e.relPath)).toEqual(['README.md', 'bin.dat', 'evals/evals.json'])
  expect(entries.find(e => e.relPath === 'README.md')?.text).toBe('readme text')
  expect(entries.find(e => e.relPath === 'bin.dat')?.text).toBeNull()
  expect(entries.find(e => e.relPath === 'evals/evals.json')?.text).toBe('{}')
})
