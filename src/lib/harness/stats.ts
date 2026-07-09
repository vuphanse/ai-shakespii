/** Pure statistics over number arrays. Callers round; these do not. */

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

/** Sample standard deviation (n−1 denominator); 0 when n < 2 (spec pin — skill-creator defines no formula). */
export function stddev(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(xs.reduce((acc, x) => acc + (x - m) ** 2, 0) / (xs.length - 1))
}

export function min(xs: number[]): number {
  return xs.length === 0 ? 0 : Math.min(...xs)
}

export function max(xs: number[]): number {
  return xs.length === 0 ? 0 : Math.max(...xs)
}
