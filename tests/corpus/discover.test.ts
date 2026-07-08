import { expect, test } from 'bun:test'
import { chmodSync, mkdirSync, mkdtempSync, symlinkSync } from 'node:fs'
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

test('a dangling symlink is recorded as skipped, not silently dropped', () => {
  const root = mkdtempSync(join(tmpdir(), 'shakespii-corpus-'))
  symlinkSync(join(root, 'does-not-exist'), join(root, 'broken-link'))
  const { skillDirs, skipped } = discoverSkills(root)
  expect(skillDirs).toEqual([])
  expect(skipped).toEqual([{ dir: join(root, 'broken-link'), reason: 'broken symlink' }])
})

// root can bypass POSIX permission checks, so chmod-based traps don't produce
// EACCES under that uid — skip rather than weaken the assertion.
test.skipIf(process.getuid?.() === 0)(
  'a permission-denied entry is recorded as inaccessible, not "broken symlink"',
  () => {
    const root = mkdtempSync(join(tmpdir(), 'shakespii-corpus-'))
    const hidden = join(root, 'hidden')
    const target = join(hidden, 'target')
    mkdirSync(target, { recursive: true })
    try {
      chmodSync(hidden, 0o000)
      symlinkSync(target, join(root, 'entry'))
      const { skillDirs, skipped } = discoverSkills(root)
      // `hidden` itself also lands in `skipped` (its own SKILL.md check can't
      // traverse into a 0o000 dir, so it reads as "no SKILL.md") — that's an
      // unrelated side effect of the fixture, not what's under test here.
      expect(skillDirs).toEqual([])
      expect(skipped).toContainEqual({ dir: join(root, 'entry'), reason: 'inaccessible' })
    } finally {
      chmodSync(hidden, 0o700)
    }
  },
)

test('a root that is itself a skill throws the exact contract message', () => {
  expect(() => discoverSkills(join(import.meta.dir, '../fixtures/minimal-pass'))).toThrow(
    'target is a single skill; drop --corpus or point at its parent directory',
  )
})

test('a missing root throws not-a-directory', () => {
  expect(() => discoverSkills(join(FIXTURES, 'does-not-exist'))).toThrow('not a directory:')
})
