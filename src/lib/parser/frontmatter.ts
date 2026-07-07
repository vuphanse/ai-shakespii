import { parse as parseYaml } from 'yaml'
import type { FrontmatterInfo } from '../types'

export function splitFrontmatter(raw: string): {
  fm: FrontmatterInfo
  body: string
  bodyLineOffset: number
} {
  const lines = raw.split('\n')
  if (lines[0] !== '---') {
    return { fm: { raw: null, parsed: null, error: null }, body: raw, bodyLineOffset: 1 }
  }
  const closing = lines.indexOf('---', 1)
  if (closing === -1) {
    return {
      fm: { raw: null, parsed: null, error: { message: 'unterminated frontmatter fence', line: 1 } },
      body: '',
      bodyLineOffset: lines.length + 1,
    }
  }
  const fmText = lines.slice(1, closing).join('\n')
  const body = lines.slice(closing + 1).join('\n')
  const bodyLineOffset = closing + 2
  try {
    const parsed: unknown = parseYaml(fmText)
    if (parsed === null || parsed === undefined) {
      return { fm: { raw: fmText, parsed: {}, error: null }, body, bodyLineOffset }
    }
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        fm: { raw: fmText, parsed: null, error: { message: 'frontmatter is not a YAML mapping', line: 2 } },
        body,
        bodyLineOffset,
      }
    }
    return { fm: { raw: fmText, parsed: parsed as Record<string, unknown>, error: null }, body, bodyLineOffset }
  } catch (e) {
    const err = e as { message: string; linePos?: [{ line: number }, ...unknown[]] }
    const line = (err.linePos?.[0]?.line ?? 1) + 1
    return {
      fm: { raw: fmText, parsed: null, error: { message: err.message.split('\n')[0], line } },
      body,
      bodyLineOffset,
    }
  }
}
