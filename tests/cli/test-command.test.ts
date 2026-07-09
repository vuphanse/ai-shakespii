import { expect, test } from 'bun:test'
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CLI = join(import.meta.dir, '../../src/cli/index.ts')
const FIXTURES = join(import.meta.dir, '../fixtures/harness')
const run = (args: string[]) => Bun.spawnSync(['bun', CLI, ...args], { cwd: tmpdir() })

test('missing evals: exit 1, contractual error finding', () => {
  const r = run(['test', join(FIXTURES, 'no-evals'), '--json'])
  expect(r.exitCode).toBe(1)
  const rep = JSON.parse(r.stdout.toString())
  expect(rep.summary).toEqual({ errors: 1, warnings: 0 })
  expect(rep.stages[0].status).toBe('fail')
  expect(rep.stages[0].findings).toEqual([
    {
      severity: 'error',
      message: 'no evals/evals.json — author evals first (see TR01); shakespii test requires a reproducible eval suite',
      file: 'evals/evals.json',
      line: null,
    },
  ])
})

test('bad-evals: exit 1, all six co-existing defects in deterministic order', () => {
  const r = run(['test', join(FIXTURES, 'bad-evals'), '--json'])
  expect(r.exitCode).toBe(1)
  const rep = JSON.parse(r.stdout.toString())
  expect(rep.summary).toEqual({ errors: 6, warnings: 0 })
  expect(rep.stages[0].findings.map((f: { message: string }) => f.message)).toEqual([
    'notes: unknown key "notes"',
    'evals[1].id: duplicate id 1 (first used by evals[0])',
    'evals[1].expectations: must be a non-empty array',
    'skill_name "someone-else" does not match frontmatter name "bad-evals"',
    'evals[0].files[0]: path escapes the skill directory ("../escape.md")',
    'evals[0].files[1]: file not found ("evals/files/missing.md")',
  ])
})

test('two-cases: exit 0 with the thin-eval warning', () => {
  const r = run(['test', join(FIXTURES, 'two-cases'), '--json'])
  expect(r.exitCode).toBe(0)
  const rep = JSON.parse(r.stdout.toString())
  expect(rep.summary).toEqual({ errors: 0, warnings: 1 })
  expect(rep.stages[0].status).toBe('pass')
  expect(rep.stages[0].findings[0].message).toBe('only 2 eval case(s) — Anthropic guidance is a minimum of three')
})

test('pretty output carries the contractual stage and summary lines', () => {
  const r = run(['test', join(FIXTURES, 'two-cases')])
  expect(r.exitCode).toBe(0)
  const out = r.stdout.toString()
  expect(out).toContain('deterministic  PASS')
  expect(out).toContain('scenario       skipped (pass --run to execute LLM stages)')
  expect(out).toContain('deterministic: 0 errors, 1 warning · scenario/grading skipped (pass --run)')
})

test('a file path is rejected: the target must be a directory (spec §2)', () => {
  const r = run(['test', join(FIXTURES, 'two-cases/SKILL.md')])
  expect(r.exitCode).toBe(2)
  expect(r.stderr.toString()).toContain('not a directory')
  expect(r.stdout.toString()).toBe('')
})

test('a nonexistent path is rejected as not a directory', () => {
  const r = run(['test', join(FIXTURES, 'does-not-exist')])
  expect(r.exitCode).toBe(2)
  expect(r.stderr.toString()).toContain('not a directory')
})

test('unknown option: loud failure, exit 2', () => {
  const r = run(['test', join(FIXTURES, 'two-cases'), '--bogus'])
  expect(r.exitCode).toBe(2)
  expect(r.stderr.toString()).toContain('unknown option: --bogus')
  expect(r.stderr.toString()).toContain('usage: shakespii test <path> [--json] [--run] [--fresh] [--model <name>] [--triggers]')
})

test('--triggers requires --run: exit 2, guard message with usage', () => {
  const r = run(['test', join(FIXTURES, 'two-cases'), '--triggers'])
  expect(r.exitCode).toBe(2)
  expect(r.stderr.toString()).toContain('--triggers requires --run')
  expect(r.stderr.toString()).toContain('usage: shakespii test <path> [--json] [--run] [--fresh] [--model <name>] [--triggers]')
})

test('--fresh and --model require --run; --model requires a value', () => {
  const fresh = run(['test', join(FIXTURES, 'two-cases'), '--fresh'])
  expect(fresh.exitCode).toBe(2)
  expect(fresh.stderr.toString()).toContain('--fresh requires --run')
  const model = run(['test', join(FIXTURES, 'two-cases'), '--model', 'sonnet'])
  expect(model.exitCode).toBe(2)
  expect(model.stderr.toString()).toContain('--model requires --run')
  const noValue = run(['test', join(FIXTURES, 'two-cases'), '--run', '--model'])
  expect(noValue.exitCode).toBe(2)
  expect(noValue.stderr.toString()).toContain('--model requires a value')
})

test('missing path / extra positional: usage, exit 2', () => {
  expect(run(['test']).exitCode).toBe(2)
  expect(run(['test', 'a', 'b']).exitCode).toBe(2)
})

test('not a skill: exit 2, message on stderr, empty stdout', () => {
  const empty = mkdtempSync(join(tmpdir(), 'shakespii-test-empty-'))
  const r = run(['test', empty])
  expect(r.exitCode).toBe(2)
  expect(r.stderr.toString()).toContain('no SKILL.md')
  expect(r.stdout.toString()).toBe('')
})

test('--json stdout is pure JSON', () => {
  const r = run(['test', join(FIXTURES, 'bad-evals'), '--json'])
  expect(() => JSON.parse(r.stdout.toString())).not.toThrow()
})

test('top-level usage lists the test command', () => {
  const r = run(['--help'])
  expect(r.stdout.toString()).toContain('test <path> [--json] [--run]')
})

test('--run end to end with a failing stub claude: scenario findings, runs metadata, exit 1', () => {
  const stubDir = mkdtempSync(join(tmpdir(), 'shakespii-claude-stub-'))
  writeFileSync(join(stubDir, 'claude'), '#!/bin/sh\necho "stub cannot run" >&2\nexit 3\n')
  chmodSync(join(stubDir, 'claude'), 0o755)
  const cache = mkdtempSync(join(tmpdir(), 'shakespii-cli-cache-'))
  const r = Bun.spawnSync(['bun', CLI, 'test', join(FIXTURES, 'compress'), '--run', '--json'], {
    cwd: tmpdir(),
    env: { ...process.env, PATH: `${stubDir}:${process.env.PATH}`, SHAKESPII_CACHE_DIR: cache },
  })
  expect(r.exitCode).toBe(1)
  const rep = JSON.parse(r.stdout.toString())
  expect(rep.stages[1].status).toBe('fail')
  expect(rep.stages[1].findings[0].message).toContain('eval 1: executor nonzero-exit')
  expect(rep.stages[1].runs).toHaveLength(3)
  expect(rep.stages[2]).toEqual({ stage: 'grading', status: 'pass', findings: [], expectations: { passed: 0, total: 0 } })
})

test('--run without claude on PATH: exit 2 with the contractual message', () => {
  const emptyPath = mkdtempSync(join(tmpdir(), 'shakespii-empty-path-'))
  const cache = mkdtempSync(join(tmpdir(), 'shakespii-cli-cache2-'))
  const r = Bun.spawnSync([process.execPath, CLI, 'test', join(FIXTURES, 'compress'), '--run'], {
    cwd: tmpdir(),
    env: { ...process.env, PATH: emptyPath, SHAKESPII_CACHE_DIR: cache },
  })
  expect(r.exitCode).toBe(2)
  expect(r.stderr.toString()).toContain('test failed: claude CLI not found — install Claude Code or put claude on PATH')
})
