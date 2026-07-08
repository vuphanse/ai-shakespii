import { expect, test } from 'bun:test'
import { mkdtempSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { discoverSkills } from '../../src/lib/corpus/discover'

const FIXTURES = join(import.meta.dir, '../fixtures/corpus')

test('discovers skill directories sorted, one level deep', () => {
  const { skillDirs, skipped } = discoverSkills(join(FIXTURES, 'clean-pair'))
  expect(skillDirs.map(d => basename(d))).toEqual(['corpus-clean-a', 'corpus-clean-b'])
  expect(skipped).toEqual([])
})

test('directories without SKILL.md are skipped with a reason; plain files are ignored silently', () => {
  const root = join(FIXTURES, 'with-skipped')
  const { skillDirs, skipped } = discoverSkills(root)
  expect(skillDirs.map(d => basename(d))).toEqual(['corpus-solo'])
  expect(skipped).toEqual([{ dir: join(root, 'notes'), reason: 'no SKILL.md' }])
})

test('symlinked skill directories are followed', () => {
  const root = mkdtempSync(join(tmpdir(), 'shakespii-corpus-'))
  symlinkSync(join(FIXTURES, 'clean-pair/corpus-clean-a'), join(root, 'linked-skill'))
  const { skillDirs } = discoverSkills(root)
  expect(skillDirs.map(d => basename(d))).toEqual(['linked-skill'])
})

test('a root that is itself a skill throws the exact contract message', () => {
  expect(() => discoverSkills(join(import.meta.dir, '../fixtures/minimal-pass'))).toThrow(
    'target is a single skill; drop --corpus or point at its parent directory',
  )
})

test('a missing root throws not-a-directory', () => {
  expect(() => discoverSkills(join(FIXTURES, 'does-not-exist'))).toThrow('not a directory:')
})
