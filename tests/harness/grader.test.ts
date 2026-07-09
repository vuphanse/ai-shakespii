import { expect, test } from 'bun:test'
import {
  buildGraderPrompt,
  buildGraderRetryPrompt,
  extractGraderJson,
  gateGraderReply,
  gradingFindings,
  recomputeSummary,
} from '../../src/lib/harness/grader'

const evalCase = {
  id: 2,
  prompt: 'Compress evals/files/code-only.md.',
  expected_output: 'No material compression is possible.',
  expectations: ['The fenced code block is byte-identical after compression', 'No code content is reworded or dropped'],
}

test('buildGraderPrompt: exact contractual template', () => {
  expect(buildGraderPrompt(evalCase)).toBe(
    `You are grading a skill evaluation run. Work in the current directory.

Read transcript.md (the execution transcript). Examine the files under outputs/, ignoring outputs/.claude/ (it is the skill mount, not an artifact).

The task given to the executor:
Compress evals/files/code-only.md.

Expected outcome:
No material compression is possible.

Grade each expectation below as passed true or false, with cited evidence. The burden of proof is on the expectation: PASS only with clear evidence of genuine completion; superficial compliance (right filename, wrong content) is FAIL. No partial credit.

Expectations (grade exactly these, verbatim, in this order):
1. The fenced code block is byte-identical after compression
2. No code content is reworded or dropped

Reply with ONLY this JSON — no prose before or after:
{
  "expectations": [
    { "text": "<expectation verbatim>", "passed": true, "evidence": "<specific citation>" }
  ],
  "summary": { "passed": 0, "failed": 0, "total": 0, "pass_rate": 0 }
}`,
  )
})

test('buildGraderRetryPrompt appends diagnostics and the previous reply', () => {
  const out = buildGraderRetryPrompt('ORIGINAL', ['expectations: must be a non-empty array'], 'BAD REPLY')
  expect(out).toBe(
    `ORIGINAL

Your previous reply failed validation:
expectations: must be a non-empty array

Previous reply:
BAD REPLY

Reply again with ONLY the corrected JSON.`,
  )
})

test('extractGraderJson: bare, fenced, and fenced-with-language replies', () => {
  expect(extractGraderJson('{"a":1}')).toEqual({ a: 1 })
  expect(extractGraderJson('```\n{"a":1}\n```')).toEqual({ a: 1 })
  expect(extractGraderJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
  expect(extractGraderJson('  {"a":1}  ')).toEqual({ a: 1 })
  expect(extractGraderJson('not json')).toBeUndefined()
})

test('extractGraderJson prose tolerance (spec §6.1)', () => {
  const doc = { expectations: [], summary: { passed: 0, failed: 0, total: 0, pass_rate: 0 } }
  const json = JSON.stringify(doc)
  // observed live shapes from the M4b-2 sweep (CALIBRATION-M4B2 adjudication 2)
  expect(extractGraderJson(`Here is my grading:\n${json}`)).toEqual(doc)
  expect(extractGraderJson(`${json}\nHope that helps!`)).toEqual(doc)
  expect(extractGraderJson(`Sure — grading below.\n${json}\nLet me know.`)).toEqual(doc)
  expect(extractGraderJson(`Sure!\n\`\`\`json\n${json}\n\`\`\``)).toEqual(doc) // prose BEFORE a fence defeats the fence-unwrap; brace fallback catches it
  // nested braces stay intact under outermost-brace slicing
  const nested = { a: { b: 1 } }
  expect(extractGraderJson(`prefix ${JSON.stringify(nested)} suffix`)).toEqual(nested)
  // still undefined when there is no parsable object
  expect(extractGraderJson('no json here')).toBeUndefined()
  expect(extractGraderJson('prefix {not json} suffix')).toBeUndefined()
  expect(extractGraderJson('}{')).toBeUndefined()
})

const reply = (texts: Array<[string, boolean]>) => ({
  expectations: texts.map(([text, passed]) => ({ text, passed, evidence: 'ev' })),
  summary: { passed: 0, failed: 0, total: texts.length, pass_rate: 0 },
})

test('gateGraderReply: schema diagnostics come back as path-prefixed problems', () => {
  const problems = gateGraderReply({ expectations: [] }, evalCase.expectations)
  expect(problems.length).toBeGreaterThan(0)
  expect(problems[0]).toBe('expectations: must be a non-empty array')
})

test('gateGraderReply: rubric fidelity — count and text mismatches are named', () => {
  const wrongCount = gateGraderReply(reply([[evalCase.expectations[0], true]]), evalCase.expectations)
  expect(wrongCount).toEqual(['expectations: expected 2 graded expectations, got 1'])
  const wrongText = gateGraderReply(
    reply([[evalCase.expectations[0], true], ['an invented rubric line', false]]),
    evalCase.expectations,
  )
  expect(wrongText).toEqual(['expectations[1].text: does not match the eval\'s expectation'])
})

test('gateGraderReply: valid, faithful reply passes', () => {
  expect(gateGraderReply(reply([[evalCase.expectations[0], true], [evalCase.expectations[1], false]]), evalCase.expectations)).toEqual([])
})

test('recomputeSummary never trusts LLM arithmetic', () => {
  expect(
    recomputeSummary([
      { text: 'a', passed: true, evidence: 'e' },
      { text: 'b', passed: false, evidence: 'e' },
      { text: 'c', passed: true, evidence: 'e' },
    ]),
  ).toEqual({ passed: 2, failed: 1, total: 3, pass_rate: 0.6667 })
})

test('gradingFindings: one error per failed expectation, evidence truncated at 200', () => {
  const longEvidence = 'x'.repeat(250)
  const findings = gradingFindings(2, {
    expectations: [
      { text: 'passes', passed: true, evidence: 'fine' },
      { text: 'fails', passed: false, evidence: longEvidence },
    ],
    summary: { passed: 1, failed: 1, total: 2, pass_rate: 0.5 },
  })
  expect(findings).toEqual([
    {
      severity: 'error',
      message: `eval 2 expectation failed: "fails" — ${'x'.repeat(200)}…`,
      file: 'evals/evals.json',
      line: null,
    },
  ])
})
