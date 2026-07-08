import { expect, test } from 'bun:test'
import { join } from 'node:path'

const CLI = join(import.meta.dir, '../../src/cli/index.ts')
const FIXTURES = join(import.meta.dir, '../fixtures/corpus')

const corpusJson = (root: string) => {
  const r = Bun.spawnSync(['bun', CLI, 'lint', join(FIXTURES, root), '--corpus', '--json'])
  return { exitCode: r.exitCode, rep: JSON.parse(r.stdout.toString()) }
}

test('KEYSTONE clean-pair: 2 skills, all zero, no corpus findings, exit 0', () => {
  const { exitCode, rep } = corpusJson('clean-pair')
  expect(exitCode).toBe(0)
  expect(rep.summary).toEqual({ skills: 2, skipped: 0, errors: 0, warnings: 0 })
  expect(rep.corpusFindings).toEqual([])
  for (const s of rep.skills) expect(s.summary).toEqual({ errors: 0, warnings: 0 })
})

test('KEYSTONE clone-pair: XS01 17-line block + XS02 cluster of 2, exit 0', () => {
  const { exitCode, rep } = corpusJson('clone-pair')
  expect(exitCode).toBe(0)
  expect(rep.summary).toEqual({ skills: 2, skipped: 0, errors: 0, warnings: 2 })
  for (const s of rep.skills) expect(s.summary).toEqual({ errors: 0, warnings: 0 })
  expect(rep.corpusFindings).toEqual([
    {
      ruleId: 'XS01',
      severity: 'warn',
      message: '17-line block shared by 2 skills — extract to a shared reference',
      sites: [
        { skill: 'corpus-clone-a', file: 'SKILL.md', startLine: 9, endLine: 38 },
        { skill: 'corpus-clone-b', file: 'SKILL.md', startLine: 9, endLine: 38 },
      ],
    },
    {
      ruleId: 'XS02',
      severity: 'warn',
      message: 'near-clone cluster of 2 skills (pairwise similarity ≥ 0.8) — consider parameterizing into one skill',
      sites: [
        { skill: 'corpus-clone-a', file: 'SKILL.md', startLine: 7, endLine: 38 },
        { skill: 'corpus-clone-b', file: 'SKILL.md', startLine: 7, endLine: 38 },
      ],
    },
  ])
})

test('KEYSTONE shared-block-trio: one XS01 finding, three sites, XS02 silent, exit 0', () => {
  const { exitCode, rep } = corpusJson('shared-block-trio')
  expect(exitCode).toBe(0)
  expect(rep.summary).toEqual({ skills: 3, skipped: 0, errors: 0, warnings: 1 })
  for (const s of rep.skills) expect(s.summary).toEqual({ errors: 0, warnings: 0 })
  expect(rep.corpusFindings).toEqual([
    {
      ruleId: 'XS01',
      severity: 'warn',
      message: '18-line block shared by 3 skills — extract to a shared reference',
      sites: [
        { skill: 'corpus-shared-a', file: 'SKILL.md', startLine: 21, endLine: 40 },
        { skill: 'corpus-shared-b', file: 'SKILL.md', startLine: 21, endLine: 40 },
        { skill: 'corpus-shared-c', file: 'SKILL.md', startLine: 21, endLine: 40 },
      ],
    },
  ])
})

test('KEYSTONE summary identity: per-skill sums plus corpus counts equal the top-level summary', () => {
  for (const root of ['clean-pair', 'clone-pair', 'shared-block-trio', 'with-skipped']) {
    const { rep } = corpusJson(root)
    const perSkill = rep.skills.reduce(
      (acc: { e: number; w: number }, s: { summary?: { errors: number; warnings: number } }) => ({
        e: acc.e + (s.summary?.errors ?? 0),
        w: acc.w + (s.summary?.warnings ?? 0),
      }),
      { e: 0, w: 0 },
    )
    const ce = rep.corpusFindings.filter((f: { severity: string }) => f.severity === 'error').length
    const cw = rep.corpusFindings.length - ce
    expect(rep.summary.errors).toBe(perSkill.e + ce)
    expect(rep.summary.warnings).toBe(perSkill.w + cw)
  }
})
