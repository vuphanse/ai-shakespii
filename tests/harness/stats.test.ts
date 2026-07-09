import { expect, test } from 'bun:test'
import { max, mean, min, stddev } from '../../src/lib/harness/stats'

test('mean of hand-computed fixtures', () => {
  expect(mean([0.5, 1, 0.75])).toBeCloseTo(0.75, 10)
  expect(mean([2, 4])).toBe(3)
  expect(mean([])).toBe(0)
})

test('sample stddev (n−1): hand-computed', () => {
  // [2, 4, 4, 4, 5, 5, 7, 9]: mean 5, sum sq dev 32, 32/7 ≈ 4.5714, sqrt ≈ 2.13809
  expect(stddev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(Math.sqrt(32 / 7), 10)
  expect(stddev([0.5, 1, 0.75])).toBeCloseTo(0.25, 10)
})

test('stddev is 0 when n < 2 (spec §2 pin — skill-creator defines no formula)', () => {
  expect(stddev([42])).toBe(0)
  expect(stddev([])).toBe(0)
})

test('min and max', () => {
  expect(min([3, 1, 2])).toBe(1)
  expect(max([3, 1, 2])).toBe(3)
  expect(min([])).toBe(0)
  expect(max([])).toBe(0)
})
