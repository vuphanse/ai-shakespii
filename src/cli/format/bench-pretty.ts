import type { BenchmarkConfigSummary, BenchmarkJson } from '../../lib/evals/types'

const configLine = (label: string, s: BenchmarkConfigSummary): string =>
  `  ${label.padEnd(16)}pass_rate ${s.pass_rate.mean.toFixed(2)} ±${s.pass_rate.stddev.toFixed(2)} · time ${s.time_seconds.mean.toFixed(1)}s · tokens ${Math.round(s.tokens.mean)}`

export function formatBenchPretty(doc: BenchmarkJson, cachedRuns: number, totalRuns: number): string {
  const meta = doc.metadata as { skill_name?: unknown; model?: unknown; runs_per_configuration?: unknown }
  const delta = doc.run_summary.delta
  return [
    `bench ${String(meta.skill_name)} · model ${String(meta.model)} · ${String(meta.runs_per_configuration)} run(s)/config`,
    configLine('with_skill', doc.run_summary.with_skill),
    configLine('without_skill', doc.run_summary.without_skill),
    `  ${'delta'.padEnd(16)}pass_rate ${delta.pass_rate} · time ${delta.time_seconds}s · tokens ${delta.tokens}`,
    `${cachedRuns}/${totalRuns} run(s) cached`,
  ].join('\n')
}
