import type { EvalCase, GradingExpectation, GradingJson } from '../evals/types'
import { validateGradingJson } from '../evals/validate'
import type { HarnessFinding } from './types'

const truncate = (s: string, max: number): string => (s.length > max ? `${s.slice(0, max)}…` : s)

export function buildGraderPrompt(evalCase: EvalCase): string {
  const numbered = evalCase.expectations.map((e, i) => `${i + 1}. ${e}`).join('\n')
  return `You are grading a skill evaluation run. Work in the current directory.

Read transcript.md (the execution transcript). Examine the files under outputs/, ignoring outputs/.claude/ (it is the skill mount, not an artifact).

The task given to the executor:
${evalCase.prompt}

Expected outcome:
${evalCase.expected_output}

Grade each expectation below as passed true or false, with cited evidence. The burden of proof is on the expectation: PASS only with clear evidence of genuine completion; superficial compliance (right filename, wrong content) is FAIL. No partial credit.

Expectations (grade exactly these, verbatim, in this order):
${numbered}

Reply with ONLY this JSON — no prose before or after:
{
  "expectations": [
    { "text": "<expectation verbatim>", "passed": true, "evidence": "<specific citation>" }
  ],
  "summary": { "passed": 0, "failed": 0, "total": 0, "pass_rate": 0 }
}`
}

export function buildGraderRetryPrompt(original: string, problems: string[], previousReply: string): string {
  return `${original}

Your previous reply failed validation:
${problems.join('\n')}

Previous reply:
${previousReply}

Reply again with ONLY the corrected JSON.`
}

/** Trim; unwrap a single fenced block (with or without a language tag); JSON.parse. undefined = parse failure. */
export function extractGraderJson(finalText: string): unknown | undefined {
  let body = finalText.trim()
  if (body.startsWith('```')) {
    const firstNewline = body.indexOf('\n')
    const lastFence = body.lastIndexOf('```')
    if (firstNewline !== -1 && lastFence > firstNewline) {
      body = body.slice(firstNewline + 1, lastFence).trim()
    }
  }
  try {
    return JSON.parse(body)
  } catch {
    return undefined
  }
}

/** Gates 2 (schema) and 3 (rubric fidelity). Empty array = pass. */
export function gateGraderReply(doc: unknown, expectations: string[]): string[] {
  const diagnostics = validateGradingJson(doc)
  if (diagnostics.length > 0) return diagnostics.map(d => `${d.path}: ${d.message}`)
  const g = doc as GradingJson
  if (g.expectations.length !== expectations.length) {
    return [`expectations: expected ${expectations.length} graded expectations, got ${g.expectations.length}`]
  }
  for (let i = 0; i < expectations.length; i++) {
    if (g.expectations[i].text !== expectations[i]) {
      return [`expectations[${i}].text: does not match the eval's expectation`]
    }
  }
  return []
}

/** The grader's arithmetic is never trusted; pass_rate rounds to 4 decimals. */
export function recomputeSummary(expectations: GradingExpectation[]): GradingJson['summary'] {
  const passed = expectations.filter(e => e.passed).length
  const total = expectations.length
  return {
    passed,
    failed: total - passed,
    total,
    pass_rate: total === 0 ? 0 : Math.round((passed / total) * 10_000) / 10_000,
  }
}

export function gradingFindings(evalId: number, grading: GradingJson): HarnessFinding[] {
  return grading.expectations
    .filter(e => !e.passed)
    .map(e => ({
      severity: 'error' as const,
      message: `eval ${evalId} expectation failed: "${e.text}" — ${truncate(e.evidence, 200)}`,
      file: 'evals/evals.json',
      line: null,
    }))
}
