import { basename } from 'node:path'
import pc from 'picocolors'
import type { HarnessFinding, StageReport, TestResult } from '../../lib/harness/types'

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

const findingLines = (findings: HarnessFinding[], lines: string[]): void => {
  for (const f of findings) {
    const sev = f.severity === 'error' ? pc.red('error') : pc.yellow('warn ')
    lines.push(`    ${sev}  ${f.file}  ${f.message}`)
  }
}

function summaryTail(scenario: StageReport, grading: StageReport, trigger?: StageReport): string {
  if (scenario.status === 'skipped') {
    const stagesWord = trigger === undefined ? 'scenario/grading' : 'scenario/grading/trigger'
    return scenario.note === 'deterministic stage failed'
      ? `${stagesWord} skipped (deterministic stage failed)`
      : `${stagesWord} skipped (pass --run)`
  }
  const runs = scenario.stage === 'scenario' && 'runs' in scenario ? scenario.runs : []
  const ok = runs.filter(r => r.status === 'ok').length
  const cached = runs.filter(r => r.cached).length
  const exp = grading.stage === 'grading' && 'expectations' in grading ? grading.expectations : { passed: 0, total: 0 }
  const runWord = runs.length === 1 ? 'run' : 'runs'
  const expWord = exp.total === 1 ? 'expectation' : 'expectations'
  let tail = `scenario: ${ok}/${runs.length} ${runWord} ok (${cached} cached) · grading: ${exp.passed}/${exp.total} ${expWord} passed`
  if (trigger !== undefined && trigger.stage === 'trigger' && trigger.status !== 'skipped') {
    const cachedReps = trigger.runs.reduce((acc, r) => acc + r.cached, 0)
    const queryWord = trigger.queries.total === 1 ? 'query' : 'queries'
    tail += ` · trigger: ${trigger.queries.passed}/${trigger.queries.total} ${queryWord} accurate (${cachedReps} cached)`
  }
  return tail
}

export function formatTestPretty(result: TestResult): string {
  const lines: string[] = [pc.underline(basename(result.skill.dir))]
  for (const s of result.stages) {
    if (s.stage === 'deterministic') {
      lines.push(`  deterministic  ${s.status === 'fail' ? pc.red('FAIL') : pc.green('PASS')}`)
      findingLines(s.findings, lines)
    } else if (s.status === 'skipped') {
      lines.push(`  ${s.stage.padEnd(13)}  ${pc.dim(`skipped (${s.note})`)}`)
    } else {
      lines.push(`  ${s.stage.padEnd(13)}  ${s.status === 'fail' ? pc.red('FAIL') : pc.green('PASS')}`)
      findingLines(s.findings, lines)
    }
  }
  lines.push('')
  const [, scenario, grading, trigger] = result.stages
  lines.push(
    pc.bold(
      `deterministic: ${plural(result.summary.errors, 'error')}, ${plural(result.summary.warnings, 'warning')} · ${summaryTail(scenario, grading, trigger)}`,
    ),
  )
  return lines.join('\n')
}
