import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ClaudeRunner, RunnerRequest, RunnerResult } from '../../src/lib/harness/claude-runner'
import type { EvalsJson } from '../../src/lib/evals/types'

export type FakeScript = Array<RunnerResult | ((req: RunnerRequest) => RunnerResult)>

export interface FakeRunner extends ClaudeRunner {
  requests: RunnerRequest[]
}

export function fakeRunner(script: FakeScript): FakeRunner {
  const queue = [...script]
  const requests: RunnerRequest[] = []
  return {
    requests,
    async run(req: RunnerRequest): Promise<RunnerResult> {
      requests.push(req)
      const next = queue.shift()
      if (next === undefined) throw new Error(`FakeRunner script exhausted at call ${requests.length}`)
      return typeof next === 'function' ? next(req) : next
    },
  }
}

export const resultEvent = (text: string): unknown => ({
  type: 'result',
  result: text,
  usage: { input_tokens: 5, output_tokens: 7 },
  num_turns: 1,
  duration_ms: 100,
  is_error: false,
})

export const completed = (finalText: string | null, overrides: Partial<RunnerResult> = {}): RunnerResult => ({
  status: 'completed',
  finalText,
  events: finalText === null ? [] : [resultEvent(finalText)],
  usage: { inputTokens: 5, outputTokens: 7 },
  durationSeconds: 1.5,
  errorMessage: null,
  ...overrides,
})

export const detected = (triggered: boolean, overrides: Partial<RunnerResult> = {}): RunnerResult => ({
  ...completed('(trigger probe complete)'),
  triggered,
  ...overrides,
})

export const failed = (status: 'timeout' | 'nonzero-exit', errorMessage: string): RunnerResult => ({
  status,
  finalText: null,
  events: [],
  usage: null,
  durationSeconds: 0.5,
  errorMessage,
})

export const gradingReply = (expectations: Array<{ text: string; passed: boolean; evidence?: string }>): string =>
  JSON.stringify(
    {
      expectations: expectations.map(e => ({ text: e.text, passed: e.passed, evidence: e.evidence ?? 'seen in transcript' })),
      summary: {
        passed: expectations.filter(e => e.passed).length,
        failed: expectations.filter(e => !e.passed).length,
        total: expectations.length,
        pass_rate: expectations.length === 0 ? 0 : expectations.filter(e => e.passed).length / expectations.length,
      },
    },
    null,
    2,
  )

/** On-disk demo-skill fixture shared by the bench pipeline and bench CLI tests. */
export function makeBenchSkillDir(evalsDoc: EvalsJson, prefix = 'shakespii-bench-skill-'): { dir: string; cacheRoot: string } {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  writeFileSync(join(dir, 'SKILL.md'), '---\nname: demo-skill\ndescription: Use when testing bench pipeline plumbing.\nversion: 1.0.0\n---\n\n# Demo\n')
  mkdirSync(join(dir, 'evals'), { recursive: true })
  writeFileSync(join(dir, 'evals/evals.json'), JSON.stringify(evalsDoc))
  return { dir, cacheRoot: mkdtempSync(join(tmpdir(), 'shakespii-bench-cache-')) }
}
