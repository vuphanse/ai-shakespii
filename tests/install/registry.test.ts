import { expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { detectProviders, PROVIDER_NAMES, resolveProvider } from '../../src/lib/install/registry'

const HOME = '/fake/home'

test('registry order and names are pinned', () => {
  expect(PROVIDER_NAMES).toEqual(['claude', 'codex', 'cursor', 'antigravity', 'gemini', 'agents', 'ezio'])
})

test.each([
  ['claude', '/fake/home/.claude', '/fake/home/.claude/skills'],
  ['codex', '/fake/home/.codex', '/fake/home/.codex/skills'],
  ['cursor', '/fake/home/.cursor', '/fake/home/.cursor/skills'],
  ['antigravity', '/fake/home/.gemini', '/fake/home/.gemini/config/skills'],
  ['gemini', '/fake/home/.gemini', '/fake/home/.gemini/skills'],
  ['agents', '/fake/home/.agents', '/fake/home/.agents/skills'],
  ['ezio', '/fake/home/.config/ai-ezio', '/fake/home/.config/ai-ezio/skills'],
])('resolveProvider(%s) maps to its documented dirs', (name, root, skillsDir) => {
  expect(resolveProvider(name, HOME)).toEqual({ name, root, skillsDir })
})

test('unknown provider resolves to null', () => {
  expect(resolveProvider('emacs', HOME)).toBeNull()
})

test('detectProviders returns only providers whose root exists, in registry order', () => {
  const home = mkdtempSync(join(tmpdir(), 'shakespii-home-'))
  mkdirSync(join(home, '.claude'), { recursive: true })
  mkdirSync(join(home, '.config/ai-ezio'), { recursive: true })
  expect(detectProviders(home).map(p => p.name)).toEqual(['claude', 'ezio'])
})

test('shared ~/.gemini root detects both antigravity and gemini', () => {
  const home = mkdtempSync(join(tmpdir(), 'shakespii-home-'))
  mkdirSync(join(home, '.gemini'), { recursive: true })
  expect(detectProviders(home).map(p => p.name)).toEqual(['antigravity', 'gemini'])
})

test('detectProviders with no roots is empty', () => {
  const home = mkdtempSync(join(tmpdir(), 'shakespii-home-'))
  expect(detectProviders(home)).toEqual([])
})
