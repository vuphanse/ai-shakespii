import { expect, test } from 'bun:test'
import { createDetector } from '../../src/lib/harness/detect'

const start = (name: string) => ({
  type: 'stream_event',
  event: { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tu1', name } },
})
const delta = (partial: string) => ({
  type: 'stream_event',
  event: { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: partial } },
})
const stop = { type: 'stream_event', event: { type: 'content_block_stop', index: 0 } }
const messageStop = { type: 'stream_event', event: { type: 'message_stop' } }

test('Skill tool_use naming the skill fires at content_block_stop, split across deltas', () => {
  const d = createDetector('demo-skill')
  expect(d.feed(start('Skill'))).toBe(false)
  expect(d.feed(delta('{"skill": "demo-sk'))).toBe(false)
  expect(d.feed(delta('ill"}'))).toBe(false)
  expect(d.feed(stop)).toBe(true)
})

test('Read of the mounted SKILL.md path fires', () => {
  const d = createDetector('demo-skill')
  d.feed(start('Read'))
  d.feed(delta('{"file_path": "/w/outputs/.claude/skills/demo-skill/SKILL.md"}'))
  expect(d.feed(stop)).toBe(true)
})

test('Read of an unrelated path does not fire', () => {
  const d = createDetector('demo-skill')
  d.feed(start('Read'))
  d.feed(delta('{"file_path": "README.md"}'))
  expect(d.feed(stop)).toBe(false)
})

test('Read match is ends-with, not substring: SKILL.md.bak and nested paths do not fire (spec §6)', () => {
  const d = createDetector('demo-skill')
  d.feed(start('Read'))
  d.feed(delta('{"file_path": "/w/outputs/.claude/skills/demo-skill/SKILL.md.bak"}'))
  expect(d.feed(stop)).toBe(false)
  d.feed(start('Read'))
  d.feed(delta('{"file_path": "/w/.claude/skills/demo-skill/SKILL.md/notes.txt"}'))
  expect(d.feed(stop)).toBe(false)
})

test('fallback: assistant Read tool_use applies the same ends-with rule', () => {
  const d = createDetector('demo-skill')
  const read = (file_path: string) => ({
    type: 'assistant',
    message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path } }] },
  })
  expect(d.feed(read('/w/.claude/skills/demo-skill/SKILL.md.bak'))).toBe(false)
  expect(d.feed(read('/w/.claude/skills/demo-skill/SKILL.md'))).toBe(true)
})

test('unrelated tool_use yields no verdict and scanning continues (deviation from run_eval.py first-tool-decides)', () => {
  const d = createDetector('demo-skill')
  expect(d.feed(start('Bash'))).toBe(false)
  expect(d.feed(stop)).toBe(false)
  d.feed(start('Skill'))
  d.feed(delta('{"skill": "demo-skill"}'))
  expect(d.feed(stop)).toBe(true)
})

test('message_stop settles a pending block', () => {
  const d = createDetector('demo-skill')
  d.feed(start('Skill'))
  d.feed(delta('{"skill": "demo-skill"}'))
  expect(d.feed(messageStop)).toBe(true)
})

test('fallback: complete assistant message with a matching tool_use fires', () => {
  const d = createDetector('demo-skill')
  const ev = {
    type: 'assistant',
    message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'demo-skill' } }] },
  }
  expect(d.feed(ev)).toBe(true)
})

test('once fired, feed stays true', () => {
  const d = createDetector('demo-skill')
  d.feed(start('Skill'))
  d.feed(delta('{"skill": "demo-skill"}'))
  expect(d.feed(stop)).toBe(true)
  expect(d.feed({ type: 'result', result: 'x' })).toBe(true)
})

test('Skill exact match: compress does not fire on compress-v2', () => {
  const d = createDetector('compress')
  d.feed(start('Skill'))
  d.feed(delta('{"skill":"compress-v2"}'))
  expect(d.feed(stop)).toBe(false)
})

test('Skill exact match: fires on the exact name (parse path)', () => {
  const d = createDetector('compress')
  d.feed(start('Skill'))
  d.feed(delta('{"skill":"compress"}'))
  expect(d.feed(stop)).toBe(true)
})

test('Skill fallback: unparsable accumulation fires only on the key+value needle', () => {
  const fires = createDetector('compress')
  fires.feed(start('Skill'))
  fires.feed(delta('{"skill":"compress",')) // truncated JSON — unparsable
  expect(fires.feed(stop)).toBe(true)

  const noFire = createDetector('compress')
  noFire.feed(start('Skill'))
  noFire.feed(delta('{"skill":"compress-v2",')) // unparsable AND wrong skill
  expect(noFire.feed(stop)).toBe(false)
})

test('Skill exact match applies on the assistant-event path too', () => {
  const d = createDetector('compress')
  const assistant = (skill: string) => ({
    type: 'assistant',
    message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill } }] },
  })
  expect(d.feed(assistant('compress-v2'))).toBe(false)
  expect(d.feed(assistant('compress'))).toBe(true)
})
