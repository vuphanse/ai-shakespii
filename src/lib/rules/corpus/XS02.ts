import type { CorpusRule, CorpusRuleFinding, CorpusSite } from '../../types'
import { bodyLines } from './normalize'

export const XS02: CorpusRule = {
  id: 'XS02',
  check(skills, ctx) {
    const threshold = ctx.options['similarity'] as number
    const entries = skills.map(s => {
      const lines = bodyLines(s)
      return {
        name: s.dirName,
        set: new Set(lines.map(l => l.text)),
        startLine: lines[0]?.line ?? 1,
        endLine: lines[lines.length - 1]?.line ?? 1,
      }
    })

    const parent = entries.map((_, i) => i)
    const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])))
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i].set
        const b = entries[j].set
        if (a.size === 0 || b.size === 0) continue
        let inter = 0
        for (const t of a) if (b.has(t)) inter++
        const union = a.size + b.size - inter
        if (union > 0 && inter / union >= threshold) parent[find(i)] = find(j)
      }
    }

    const clusters = new Map<number, number[]>()
    entries.forEach((_, i) => {
      const root = find(i)
      clusters.set(root, [...(clusters.get(root) ?? []), i])
    })

    const out: CorpusRuleFinding[] = []
    for (const members of clusters.values()) {
      if (members.length < 2) continue
      const sites: CorpusSite[] = members
        .map(i => ({
          skill: entries[i].name,
          file: 'SKILL.md' as const,
          startLine: entries[i].startLine,
          endLine: entries[i].endLine,
        }))
        .sort((x, y) => (x.skill < y.skill ? -1 : x.skill > y.skill ? 1 : 0))
      out.push({
        message: `near-clone cluster of ${members.length} skills (pairwise similarity ≥ ${threshold}) — consider parameterizing into one skill`,
        sites,
      })
    }
    return out.sort((x, y) => (x.sites[0].skill < y.sites[0].skill ? -1 : x.sites[0].skill > y.sites[0].skill ? 1 : 0))
  },
}
