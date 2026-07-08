import type { ClaudeRunner, RunnerRequest, RunnerResult } from '../../src/lib/harness/claude-runner'

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
