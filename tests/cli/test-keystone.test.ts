import { expect, test } from 'bun:test'
import { join } from 'node:path'

const CLI = join(import.meta.dir, '../../src/cli/index.ts')
const COMPRESS = join(import.meta.dir, '../fixtures/harness/compress')
const NO_EVALS = join(import.meta.dir, '../fixtures/harness/no-evals')
const run = (args: string[]) => Bun.spawnSync(['bun', CLI, ...args], { cwd: '/tmp' })

test('KEYSTONE: the repaired compress fixture passes the deterministic stage byte-exactly', () => {
  const r = run(['test', COMPRESS, '--json'])
  expect(r.exitCode).toBe(0)
  const rep = JSON.parse(r.stdout.toString())
  expect(rep).toEqual({
    version: 1,
    mode: 'test',
    skill: { dir: COMPRESS, name: 'compress' },
    stages: [
      { stage: 'deterministic', status: 'pass', findings: [] },
      { stage: 'scenario', status: 'unavailable', note: 'ships in M4b' },
      { stage: 'grading', status: 'unavailable', note: 'ships in M4b' },
    ],
    summary: { errors: 0, warnings: 0 },
  })
  expect(Object.keys(rep)).toEqual(['version', 'mode', 'skill', 'stages', 'summary'])
})

test('KEYSTONE: missing evals fails with the contractual message and exit 1', () => {
  const r = run(['test', NO_EVALS, '--json'])
  expect(r.exitCode).toBe(1)
  const rep = JSON.parse(r.stdout.toString())
  expect(rep.stages[0].findings[0].message).toBe(
    'no evals/evals.json — author evals first (see TR01); shakespii test requires a reproducible eval suite',
  )
})

test('KEYSTONE: pretty summary line on the compress fixture', () => {
  const r = run(['test', COMPRESS])
  expect(r.exitCode).toBe(0)
  expect(r.stdout.toString()).toContain('deterministic: 0 errors, 0 warnings · scenario/grading pending M4b')
})
