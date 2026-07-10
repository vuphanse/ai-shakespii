import { expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { contaminationMessage, readPersistedEvents, scanContamination } from '../../src/lib/harness/contamination'

const skillUse = (skill: string) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill } }] } })
const readUse = { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/x/SKILL.md' } }] } }
const resultEvt = { type: 'result', result: 'done' }

test('clean run: no assistant Skill invocations → no hits', () => {
  expect(scanContamination([readUse, resultEvt], [])).toEqual([])
})

test('target invocation is allowed; foreign is a hit', () => {
  const events = [skillUse('demo-skill'), skillUse('compress')]
  expect(scanContamination(events, ['demo-skill'])).toEqual([{ skill: 'compress', count: 1 }])
})

test('empty allowed set: ANY Skill invocation is contamination (without_skill)', () => {
  expect(scanContamination([skillUse('compress')], [])).toEqual([{ skill: 'compress', count: 1 }])
})

test('dedupe with counts, first-occurrence order', () => {
  const events = [skillUse('b-skill'), skillUse('a-skill'), skillUse('b-skill')]
  expect(scanContamination(events, [])).toEqual([
    { skill: 'b-skill', count: 2 },
    { skill: 'a-skill', count: 1 },
  ])
})

test('exact match: compress-v2 is NOT covered by allowing compress', () => {
  expect(scanContamination([skillUse('compress-v2')], ['compress'])).toEqual([{ skill: 'compress-v2', count: 1 }])
})

test('tolerant: malformed events and non-string skill inputs are skipped, never throw', () => {
  const events: unknown[] = [
    null, 42, 'text',
    { type: 'assistant' },
    { type: 'assistant', message: { content: 'not-an-array' } },
    { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 7 } }] } },
    { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill' }] } },
    { type: 'stream_event', event: { type: 'content_block_start', content_block: { type: 'tool_use', name: 'Skill' } } },
    skillUse('compress'),
  ]
  expect(scanContamination(events, [])).toEqual([{ skill: 'compress', count: 1 }])
})

test('stream_event partials are ignored (assistant events only — no double counting)', () => {
  const partial = { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{"skill":"compress"}' } } }
  expect(scanContamination([partial], [])).toEqual([])
})

test('contaminationMessage formats are contractual', () => {
  expect(contaminationMessage({ skill: 'compress', count: 2 }, 'eval 3')).toBe(
    'contamination: session invoked non-target skill "compress" (2 invocation(s)) [eval 3]',
  )
  expect(contaminationMessage({ skill: 'compress', count: 1 }, 'query 7 rep 2')).toBe(
    'contamination: session invoked non-target skill "compress" (1 invocation(s)) [query 7 rep 2]',
  )
})

test('readPersistedEvents: parses events.jsonl, skips unparseable lines, [] when absent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-contamination-'))
  expect(readPersistedEvents(dir)).toEqual([])
  writeFileSync(join(dir, 'events.jsonl'), `${JSON.stringify(skillUse('compress'))}\nnot-json\n\n${JSON.stringify(resultEvt)}\n`)
  const events = readPersistedEvents(dir)
  expect(events).toHaveLength(2)
  expect(scanContamination(events, [])).toEqual([{ skill: 'compress', count: 1 }])
})

test('readPersistedEvents: unreadable events.jsonl (a directory) yields [] instead of throwing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-contamination-'))
  mkdirSync(join(dir, 'events.jsonl'))
  expect(readPersistedEvents(dir)).toEqual([])
})

test('two Skill blocks in one assistant message count 2', () => {
  const event = {
    type: 'assistant',
    message: {
      content: [
        { type: 'tool_use', name: 'Skill', input: { skill: 'compress' } },
        { type: 'tool_use', name: 'Skill', input: { skill: 'compress' } },
      ],
    },
  }
  expect(scanContamination([event], [])).toEqual([{ skill: 'compress', count: 2 }])
})
