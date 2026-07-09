import { expect, spyOn, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runBench } from '../../src/cli/bench'
import type { EvalsJson } from '../../src/lib/evals/types'
import { completed, fakeRunner, failed, gradingReply, makeBenchSkillDir, resultEvent } from '../harness/helpers'
import type { FakeScript } from '../harness/helpers'

const CLI = join(import.meta.dir, '../../src/cli/index.ts')
const FIXTURES = join(import.meta.dir, '../fixtures/harness')
const spawn = (args: string[]) => Bun.spawnSync(['bun', CLI, ...args], { cwd: tmpdir() })

const BENCH_USAGE = 'usage: shakespii bench <path> [--json] [--runs <n>] [--model <name>] [--fresh]'

test('guards: --runs value shapes', () => {
  for (const [args, msg] of [
    [['bench', join(FIXTURES, 'compress'), '--runs'], '--runs requires a value'],
    [['bench', join(FIXTURES, 'compress'), '--runs', '0'], '--runs must be a positive integer'],
    [['bench', join(FIXTURES, 'compress'), '--runs', '-1'], '--runs must be a positive integer'],
    [['bench', join(FIXTURES, 'compress'), '--runs', '1.5'], '--runs must be a positive integer'],
    [['bench', join(FIXTURES, 'compress'), '--runs', 'many'], '--runs must be a positive integer'],
    [['bench', join(FIXTURES, 'compress'), '--model'], '--model requires a value'],
    [['bench', join(FIXTURES, 'compress'), '--wat'], 'unknown option: --wat'],
  ] as const) {
    const r = spawn([...args])
    expect(r.exitCode).toBe(2)
    expect(r.stderr.toString()).toContain(msg)
    expect(r.stderr.toString()).toContain(BENCH_USAGE)
  }
})

test('guards: not a directory / not a skill / missing positional', () => {
  expect(spawn(['bench']).exitCode).toBe(2)
  const r = spawn(['bench', join(FIXTURES, 'compress/SKILL.md')])
  expect(r.exitCode).toBe(2)
  expect(r.stderr.toString()).toContain('not a directory:')
})

test('deterministic gate: findings printed, contractual message, exit 2, nothing spawned', () => {
  const r = spawn(['bench', join(FIXTURES, 'bad-evals')])
  expect(r.exitCode).toBe(2)
  const errText = r.stderr.toString()
  expect(errText).toContain('bench requires a valid eval suite — fix the findings above first')
  expect(errText).toContain('evals/evals.json')
})

test('deterministic gate blocks on warn-only findings too (spec §3.2: any finding)', () => {
  const r = spawn(['bench', join(FIXTURES, 'two-cases')])
  expect(r.exitCode).toBe(2)
  expect(r.stderr.toString()).toContain('bench requires a valid eval suite — fix the findings above first')
})

// --- in-process pipeline tests: on-disk 3-eval skill, injected FakeRunner (mirrors tests/harness/bench.test.ts style) ---

const CONFIGS = ['with_skill', 'without_skill'] as const

const EVALS: EvalsJson = {
  skill_name: 'demo-skill',
  evals: [
    { id: 1, prompt: 'Case one.', expected_output: 'Out.', expectations: ['ok'] },
    { id: 2, prompt: 'Case two.', expected_output: 'Out.', expectations: ['ok'] },
    { id: 3, prompt: 'Case three.', expected_output: 'Out.', expectations: ['ok'] },
  ],
}

const executorOk = () => completed('did the task')
const graderOk = () => completed(gradingReply([{ text: 'ok', passed: true }]))

function makeSkillDir(): { skillDir: string; cacheRoot: string } {
  const { dir, cacheRoot } = makeBenchSkillDir(EVALS, 'shakespii-bench-cli-skill-')
  return { skillDir: dir, cacheRoot }
}

/** Every eval/config/run-1 sample passes — used where the pass pattern itself is not under test. */
function allPassScript(): FakeScript {
  const script: FakeScript = []
  for (const _evalCase of EVALS.evals) {
    for (const _config of CONFIGS) {
      script.push(executorOk())
      script.push(graderOk())
    }
  }
  return script
}

test('success: --json prints the document verbatim, exit 0', async () => {
  const { skillDir, cacheRoot } = makeSkillDir()
  const runner = fakeRunner(allPassScript())
  const log = spyOn(console, 'log').mockImplementation(() => {})
  try {
    const code = await runBench([skillDir, '--json', '--runs', '1'], { runner, cacheRoot })
    expect(code).toBe(0)
    const doc = JSON.parse(log.mock.calls[0][0] as string)
    expect(doc.metadata.runs_per_configuration).toBe(1)
  } finally {
    log.mockRestore()
  }
})

test('run failure: pretty prints only the failure message, exit 1', async () => {
  const { skillDir, cacheRoot } = makeSkillDir()
  const failingRunner = fakeRunner([failed('timeout', 'hung'), failed('timeout', 'hung again')])
  const log = spyOn(console, 'log').mockImplementation(() => {})
  try {
    const code = await runBench([skillDir, '--runs', '1'], { runner: failingRunner, cacheRoot })
    expect(code).toBe(1)
    expect(log.mock.calls).toHaveLength(1)
    expect(log.mock.calls[0][0]).toBe('bench run failed (eval 1, with_skill, run 1): executor timeout — hung again')
  } finally {
    log.mockRestore()
  }
})

test('run failure with --json: single-line {"error": ...}, exit 1', async () => {
  const { skillDir, cacheRoot } = makeSkillDir()
  const failingRunner2 = fakeRunner([failed('timeout', 'hung'), failed('timeout', 'hung again')])
  const log = spyOn(console, 'log').mockImplementation(() => {})
  try {
    const code = await runBench([skillDir, '--json', '--runs', '1'], { runner: failingRunner2, cacheRoot })
    expect(code).toBe(1)
    expect(log.mock.calls).toHaveLength(1)
    expect(log.mock.calls[0][0]).toBe(JSON.stringify({ error: 'bench run failed (eval 1, with_skill, run 1): executor timeout — hung again' }))
  } finally {
    log.mockRestore()
  }
})

test('contamination with --json: warnings on stderr, stdout document byte-pure', async () => {
  const { skillDir, cacheRoot } = makeSkillDir()
  const script: FakeScript = []
  for (const _evalCase of EVALS.evals) {
    script.push(executorOk())
    script.push(graderOk())
    script.push(completed('did the task', {
      events: [
        { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'compress' } }] } },
        resultEvent('did the task'),
      ],
    }))
    script.push(graderOk())
  }
  const log = spyOn(console, 'log').mockImplementation(() => {})
  const err = spyOn(console, 'error').mockImplementation(() => {})
  try {
    const code = await runBench([skillDir, '--json', '--runs', '1'], { runner: fakeRunner(script), cacheRoot })
    expect(code).toBe(0)
    expect(log.mock.calls).toHaveLength(1)
    const doc = JSON.parse(log.mock.calls[0][0] as string)
    expect(JSON.stringify(doc)).not.toContain('contamination')
    expect(err.mock.calls.map(c => c[0])).toEqual([
      'warn contamination: without_skill eval 1 run 1 invoked non-target skill "compress" (1 invocation(s))',
      'warn contamination: without_skill eval 2 run 1 invoked non-target skill "compress" (1 invocation(s))',
      'warn contamination: without_skill eval 3 run 1 invoked non-target skill "compress" (1 invocation(s))',
    ])
  } finally {
    log.mockRestore()
    err.mockRestore()
  }
})

test('deterministic gate: injected runner is never called', async () => {
  const runner = fakeRunner([])
  const err = spyOn(console, 'error').mockImplementation(() => {})
  try {
    const code = await runBench([join(FIXTURES, 'bad-evals')], { runner, cacheRoot: mkdtempSync(join(tmpdir(), 'shakespii-bench-gate-')) })
    expect(code).toBe(2)
    expect(runner.requests).toHaveLength(0)
  } finally {
    err.mockRestore()
  }
})
