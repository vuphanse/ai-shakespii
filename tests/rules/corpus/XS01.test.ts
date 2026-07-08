import { expect, test } from 'bun:test'
import { XS01 } from '../../../src/lib/rules/corpus/XS01'
import { cleanSkillRaw, corpusFromRaws, ctxFor } from '../../helpers/skill'
import type { RuleContext } from '../../../src/lib/types'

const CTX = ctxFor('XS01') // { minLines: 15, minSkills: 2 }
const smallCtx = (minLines: number, minSkills: number): RuleContext => ({
  options: { minLines, minSkills },
  anatomy: CTX.anatomy,
})

const block = (n: number): string =>
  Array.from({ length: n }, (_, i) => `Shared corpus preamble sentence number ${'x'.repeat(i + 1)}.`).join('\n')

// Every section differs per skill except `procedure`, so the maximal identical
// run is exactly: "## Procedure" + the shared block + "## Output" (block + 2).
const withProcedure = (tag: string, procedure: string): string =>
  cleanSkillRaw({
    intent: `${tag} intent prose.`,
    inputs: `${tag} inputs prose.`,
    preconditions: `${tag} preconditions prose.`,
    procedure,
    output: `${tag} output prose.`,
    examples: `Given the input \`${tag}\`, the expected output is \`${tag}-out\`.`,
    'anti-patterns': `${tag} anti-pattern prose.`,
  })

test('a shared 16-line block fires once with two sites (run = block + flanking headings = 18)', () => {
  const shared = block(16)
  const skills = corpusFromRaws([withProcedure('Alpha', shared), withProcedure('Beta', shared)], ['dup-a', 'dup-b'])
  const f = XS01.check(skills, CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toBe('18-line block shared by 2 skills — extract to a shared reference')
  expect(f[0].sites.map(s => s.skill)).toEqual(['dup-a', 'dup-b'])
  expect(f[0].sites.every(s => s.file === 'SKILL.md')).toBe(true)
})

test('a shared 12-line block stays silent at minLines 15 (run = 14)', () => {
  const shared = block(12)
  const skills = corpusFromRaws([withProcedure('Alpha', shared), withProcedure('Beta', shared)], ['dup-a', 'dup-b'])
  expect(XS01.check(skills, CTX)).toHaveLength(0)
})

test('a shared 13-line block fires exactly at the boundary (run = 15)', () => {
  const shared = block(13)
  const skills = corpusFromRaws([withProcedure('Alpha', shared), withProcedure('Beta', shared)], ['dup-a', 'dup-b'])
  const f = XS01.check(skills, CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toBe('15-line block shared by 2 skills — extract to a shared reference')
})

test('three sharers merge into one finding with three sites', () => {
  const shared = block(16)
  const skills = corpusFromRaws(
    [withProcedure('Alpha', shared), withProcedure('Beta', shared), withProcedure('Gamma', shared)],
    ['dup-a', 'dup-b', 'dup-c'],
  )
  const f = XS01.check(skills, CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toBe('18-line block shared by 3 skills — extract to a shared reference')
  expect(f[0].sites.map(s => s.skill)).toEqual(['dup-a', 'dup-b', 'dup-c'])
})

test('duplication within a single skill does not count', () => {
  const shared = block(16)
  const skills = corpusFromRaws(
    [
      withProcedure('Alpha', `${shared}\n\nBridge prose between copies.\n\n${shared}`),
      withProcedure('Beta', 'Nothing shared here at all.'),
    ],
    ['dup-a', 'dup-b'],
  )
  expect(XS01.check(skills, CTX)).toHaveLength(0)
})

test('blank lines inside one copy neither break nor shrink the run', () => {
  const shared = block(16)
  const lines = shared.split('\n')
  const withBlanks = [...lines.slice(0, 8), '', ...lines.slice(8)].join('\n')
  const skills = corpusFromRaws([withProcedure('Alpha', shared), withProcedure('Beta', withBlanks)], ['dup-a', 'dup-b'])
  const f = XS01.check(skills, CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toBe('18-line block shared by 2 skills — extract to a shared reference')
})

test('minSkills 3 suppresses a two-skill duplicate', () => {
  const shared = block(6) // run = 8
  const skills = corpusFromRaws([withProcedure('Alpha', shared), withProcedure('Beta', shared)], ['dup-a', 'dup-b'])
  expect(XS01.check(skills, smallCtx(5, 3))).toHaveLength(0)
  expect(XS01.check(skills, smallCtx(5, 2))).toHaveLength(1)
})

test('reported line ranges are original file coordinates', () => {
  const shared = block(16)
  const raw = withProcedure('Alpha', shared)
  const procedureHeadingLine = raw.split('\n').findIndex(l => l === '## Procedure') + 1
  const skills = corpusFromRaws([raw, withProcedure('Beta', shared)], ['dup-a', 'dup-b'])
  const f = XS01.check(skills, CTX)
  expect(f[0].sites[0].startLine).toBe(procedureHeadingLine)
  expect(f[0].sites[0].endLine).toBeGreaterThan(procedureHeadingLine)
})
