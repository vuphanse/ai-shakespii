import { extractFinalText, extractUsage } from './stream-json'

export interface RunnerRequest {
  prompt: string
  cwd: string
  model: string
  timeoutMs: number
}

export type RunnerStatus = 'completed' | 'timeout' | 'nonzero-exit'

export interface RunnerResult {
  status: RunnerStatus
  finalText: string | null
  events: unknown[]
  usage: { inputTokens: number; outputTokens: number } | null
  durationSeconds: number
  errorMessage: string | null
}

export interface ClaudeRunner {
  run(req: RunnerRequest): Promise<RunnerResult>
}

export const DEFAULT_MODEL = 'sonnet'
export const RUN_TIMEOUT_MS = 300_000

export class ClaudeUnavailableError extends Error {}

const round2 = (n: number): number => Math.round(n * 100) / 100

const CLAUDE_UNAVAILABLE_MESSAGE = 'claude CLI not found — install Claude Code or put claude on PATH'

export function spawnClaudeRunner(claudeBin = 'claude'): ClaudeRunner {
  return {
    async run(req: RunnerRequest): Promise<RunnerResult> {
      const started = performance.now()
      const env = { ...process.env }
      delete env.CLAUDECODE
      let proc: ReturnType<typeof Bun.spawn>
      try {
        proc = Bun.spawn(
          [claudeBin, '-p', req.prompt, '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions', '--model', req.model],
          // detached: run in its own process group so a timeout kill can take
          // down any descendants (e.g. a wrapper script's child) with it —
          // otherwise a descendant that outlives the direct child can keep the
          // stdout/stderr pipes open indefinitely.
          { cwd: req.cwd, env, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', detached: true },
        )
      } catch {
        throw new ClaudeUnavailableError(CLAUDE_UNAVAILABLE_MESSAGE)
      }
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        try {
          process.kill(-proc.pid, 'SIGKILL')
        } catch {
          proc.kill()
        }
      }, req.timeoutMs)
      let stdout: string
      let stderr: string
      let exitCode: number
      try {
        ;[stdout, stderr, exitCode] = await Promise.all([
          new Response(proc.stdout as ReadableStream).text(),
          new Response(proc.stderr as ReadableStream).text(),
          proc.exited,
        ])
      } catch {
        clearTimeout(timer)
        throw new ClaudeUnavailableError(CLAUDE_UNAVAILABLE_MESSAGE)
      }
      clearTimeout(timer)
      const events: unknown[] = []
      for (const line of stdout.split('\n')) {
        const t = line.trim()
        if (!t) continue
        try {
          events.push(JSON.parse(t))
        } catch {
          // tolerant reader: non-JSON lines are skipped
        }
      }
      const durationSeconds = round2((performance.now() - started) / 1000)
      const finalText = extractFinalText(events)
      const usage = extractUsage(events)
      if (timedOut) {
        return { status: 'timeout', finalText, events, usage, durationSeconds, errorMessage: `timed out after ${req.timeoutMs}ms` }
      }
      if (exitCode !== 0) {
        return { status: 'nonzero-exit', finalText, events, usage, durationSeconds, errorMessage: stderr.slice(-2000) || `exit code ${exitCode}` }
      }
      return { status: 'completed', finalText, events, usage, durationSeconds, errorMessage: null }
    },
  }
}
