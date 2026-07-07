import { unified } from 'unified'
import remarkParse from 'remark-parse'
import type { Heading, Root } from 'mdast'
import type { Section } from '../types'

export function normalizeHeading(text: string): string {
  return text
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[:.!?]+$/, '')
    .toLowerCase()
}

function nodeText(node: unknown): string {
  let out = ''
  const walk = (n: { value?: unknown; children?: unknown[] }) => {
    if (typeof n.value === 'string') out += n.value
    for (const c of n.children ?? []) walk(c as { value?: unknown; children?: unknown[] })
  }
  walk(node as { value?: unknown; children?: unknown[] })
  return out
}

function parseTree(body: string): Root {
  return unified().use(remarkParse).parse(body) as Root
}

export function extractSections(
  body: string,
  lineOffset: number,
): { h1: string | null; sections: Section[] } {
  const tree = parseTree(body)
  const bodyLines = body.split('\n')
  let h1: string | null = null
  const heads: { text: string; depth: 2 | 3; line: number }[] = []
  for (const node of tree.children) {
    if (node.type !== 'heading') continue
    const h = node as Heading
    const line = h.position?.start.line ?? 1
    const text = nodeText(h)
    if (h.depth === 1 && h1 === null) h1 = text
    if (h.depth === 2 || h.depth === 3) heads.push({ text, depth: h.depth, line })
  }
  const sections: Section[] = heads.map((h, i) => {
    const endBody = i + 1 < heads.length ? heads[i + 1].line - 1 : bodyLines.length
    return {
      heading: h.text,
      normalized: normalizeHeading(h.text),
      depth: h.depth,
      startLine: h.line + lineOffset - 1,
      endLine: endBody + lineOffset - 1,
      text: bodyLines.slice(h.line, endBody).join('\n'),
    }
  })
  return { h1, sections }
}

export function extractLinks(
  body: string,
  lineOffset: number,
): { target: string; line: number }[] {
  const out: { target: string; line: number }[] = []
  const walk = (n: {
    type?: string
    url?: string
    position?: { start: { line: number } }
    children?: unknown[]
  }) => {
    if ((n.type === 'link' || n.type === 'image') && typeof n.url === 'string') {
      out.push({ target: n.url, line: (n.position?.start.line ?? 1) + lineOffset - 1 })
    }
    for (const c of n.children ?? []) walk(c as typeof n)
  }
  walk(parseTree(body) as unknown as { children?: unknown[] })
  return out
}
