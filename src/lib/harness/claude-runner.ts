import { createDetector } from './detect'
import { extractFinalText, extractUsage } from './stream-json'

export interface RunnerRequest {
  prompt: string
  cwd: string
  model: string
  timeoutMs: number
  detect?: { skillName: string }
}

export type RunnerStatus = 'completed' | 'timeout' | 'nonzero-exit'

export interface RunnerResult {
  status: RunnerStatus
  finalText: string | null
  events: unknown[]
  usage: { inputTokens: number; outputTokens: number } | null
  durationSeconds: number
  errorMessage: string | null
  /** Present iff detect was requested AND status is 'completed'. */
  triggered?: boolean
}

export interface ClaudeRunner {
  run(req: RunnerRequest): Promise<RunnerResult>
}

export const DEFAULT_MODEL = 'sonnet'
export const RUN_TIMEOUT_MS = 300_000

export class ClaudeUnavailableError extends Error {}

const round2 = (n: number): number => Math.round(n * 100) / 100

const CLAUDE_UNAVAILABLE_MESSAGE = 'claude CLI not found — install Claude Code or put claude on PATH'

const DRAIN_GRACE_MS = 2000
export const SETTLE_OUTER_BOUND_MS = 10_000

// Once the process has exited, its pipe write-ends are already closed, so a
// pending read should settle almost immediately with `done: true`. Observed
// empirically: after a detached process group has been SIGKILLed more than
// once within the same Bun runtime, the stdout/stderr ReadableStream readers
// can fail to report that EOF and hang indefinitely. Bound the wait and
// force-cancel to unblock; if even the cancel hangs, the outer bound returns
// the fallback rather than hanging the run (spec §8).
export async function settleWithGrace<T>(
  work: Promise<T>,
  reader: { cancel(): Promise<void> },
  fallback: T,
  graceMs = DRAIN_GRACE_MS,
  outerBoundMs = SETTLE_OUTER_BOUND_MS,
): Promise<T> {
  const sequence = async (): Promise<T> => {
    let settled = false
    work.then(
      () => {
        settled = true
      },
      () => {
        settled = true
      },
    )
    await Promise.race([work.then(() => {}, () => {}), Bun.sleep(graceMs)])
    if (!settled) {
      try {
        await reader.cancel()
      } catch {
        // reader may already be closed
      }
    }
    try {
      return await work
    } catch {
      return fallback
    }
  }
  return Promise.race([sequence(), Bun.sleep(outerBoundMs).then(() => fallback)])
}

export function spawnClaudeRunner(claudeBin = 'claude'): ClaudeRunner {
  return {
    async run(req: RunnerRequest): Promise<RunnerResult> {
      const started = performance.now()
      const env = { ...process.env }
      delete env.CLAUDECODE
      const argv = [claudeBin, '-p', req.prompt, '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions', '--model', req.model, '--setting-sources', 'project,local']
      if (req.detect) argv.push('--include-partial-messages')
      let proc: ReturnType<typeof Bun.spawn>
      try {
        proc = Bun.spawn(
          argv,
          // detached: run in its own process group so a timeout kill can take
          // down any descendants (e.g. a wrapper script's child) with it —
          // otherwise a descendant that outlives the direct child can keep the
          // stdout/stderr pipes open indefinitely.
          { cwd: req.cwd, env, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', detached: true },
        )
      } catch {
        throw new ClaudeUnavailableError(CLAUDE_UNAVAILABLE_MESSAGE)
      }
      const killGroup = (): void => {
        try {
          process.kill(-proc.pid, 'SIGKILL')
        } catch {
          proc.kill()
        }
      }
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        killGroup()
      }, req.timeoutMs)
      const detector = req.detect ? createDetector(req.detect.skillName) : null
      let earlyKilled = false
      const events: unknown[] = []
      const handleLine = (line: string): void => {
        const t = line.trim()
        if (!t) return
        let event: unknown
        try {
          event = JSON.parse(t)
        } catch {
          // tolerant reader: non-JSON lines are skipped
          return
        }
        events.push(event)
        if (detector !== null && !earlyKilled && detector.feed(event)) {
          earlyKilled = true
          killGroup()
        }
      }
      let stderr: string
      let exitCode: number
      try {
        const stdoutReader = (proc.stdout as ReadableStream<Uint8Array>).getReader()
        const stderrReader = (proc.stderr as ReadableStream<Uint8Array>).getReader()
        const readStdout = async (): Promise<void> => {
          const decoder = new TextDecoder()
          let buffer = ''
          while (true) {
            const { done, value } = await stdoutReader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            let nl = buffer.indexOf('\n')
            while (nl !== -1) {
              handleLine(buffer.slice(0, nl))
              buffer = buffer.slice(nl + 1)
              nl = buffer.indexOf('\n')
            }
          }
          buffer += decoder.decode()
          if (buffer.trim()) handleLine(buffer)
        }
        const readStderr = async (): Promise<string> => {
          const decoder = new TextDecoder()
          let out = ''
          while (true) {
            const { done, value } = await stderrReader.read()
            if (done) break
            out += decoder.decode(value, { stream: true })
          }
          return out + decoder.decode()
        }
        const stdoutPromise = readStdout()
        const stderrPromise = readStderr()
        stdoutPromise.catch(() => {})
        stderrPromise.catch(() => {})
        exitCode = await proc.exited
        await settleWithGrace(stdoutPromise, stdoutReader, undefined)
        stderr = await settleWithGrace(stderrPromise, stderrReader, '')
      } catch {
        clearTimeout(timer)
        throw new ClaudeUnavailableError(CLAUDE_UNAVAILABLE_MESSAGE)
      }
      clearTimeout(timer)
      const durationSeconds = round2((performance.now() - started) / 1000)
      const finalText = extractFinalText(events)
      const usage = extractUsage(events)
      if (earlyKilled) {
        return { status: 'completed', finalText, events, usage, durationSeconds, errorMessage: null, triggered: true }
      }
      if (timedOut) {
        return { status: 'timeout', finalText, events, usage, durationSeconds, errorMessage: `timed out after ${req.timeoutMs}ms` }
      }
      if (exitCode !== 0) {
        return { status: 'nonzero-exit', finalText, events, usage, durationSeconds, errorMessage: stderr.slice(-2000) || `exit code ${exitCode}` }
      }
      if (detector !== null) {
        return { status: 'completed', finalText, events, usage, durationSeconds, errorMessage: null, triggered: false }
      }
      return { status: 'completed', finalText, events, usage, durationSeconds, errorMessage: null }
    },
  }
}
