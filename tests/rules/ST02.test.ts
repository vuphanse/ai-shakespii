import { expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseSkill } from '../../src/lib/parser'
import { ST02 } from '../../src/lib/rules/ST02'

const CTX = { options: {}, anatomy: {} }
const fx = (name: string) => parseSkill(join(import.meta.dir, '../fixtures', name))

test('missing target: one finding citing the link line; URLs ignored', () => {
  const f = ST02.check(fx('st02-broken-link'), CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toContain('references/guide.md')
  expect(f[0].line).toBe(7)
})

test('../ escape: one finding', () => {
  const f = ST02.check(fx('st02-parent-escape'), CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toContain('..')
})

test('existing file, directory target, and pure anchor all pass', () => {
  expect(ST02.check(fx('st02-ok'), CTX)).toHaveLength(0)
})

test('minimal-pass: zero findings', () => {
  expect(ST02.check(fx('minimal-pass'), CTX)).toHaveLength(0)
})

test('malformed %-sequence in link target: degrades to a missing-target finding instead of throwing', () => {
  const f = ST02.check(fx('st02-malformed-percent'), CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toContain('images/95%-confidence.png')
})

test('existing EMPTY directory target passes (git cannot commit empty dirs, so build at test time)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'st02-empty-dir-'))
  writeFileSync(
    join(dir, 'SKILL.md'),
    '---\nname: st02-empty-dir\ndescription: "Use when testing empty directory targets."\n---\n# st02-empty-dir\n\nSee [assets](assets/).\n',
  )
  mkdirSync(join(dir, 'assets'))
  expect(ST02.check(parseSkill(dir), CTX)).toHaveLength(0)
})

test('reference-style link to a missing file is a finding', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-reflink-'))
  writeFileSync(
    join(dir, 'SKILL.md'),
    '---\nname: reflink\ndescription: "Use when testing reference links."\n---\n# reflink\n\nSee [guide][g].\n\n[g]: references/missing.md\n',
  )
  const f = ST02.check(parseSkill(dir), { options: {}, anatomy: {} })
  expect(f).toHaveLength(1)
  expect(f[0].message).toContain('references/missing.md')
})

test('fragment on an existing sibling resolves (file.md#fragment)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-frag-'))
  writeFileSync(
    join(dir, 'SKILL.md'),
    '---\nname: frag\ndescription: "Use when testing fragment links."\n---\n# frag\n\nSee [s](guide.md#section).\n',
  )
  writeFileSync(join(dir, 'guide.md'), '# guide\n\n## section\n')
  expect(ST02.check(parseSkill(dir), { options: {}, anatomy: {} })).toHaveLength(0)
})
