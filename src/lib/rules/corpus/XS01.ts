import type { CorpusRule, CorpusRuleFinding, CorpusSite } from '../../types'
import { bodyLines } from './normalize'

const bySkillThenLine = (x: CorpusSite, y: CorpusSite): number =>
  x.skill < y.skill ? -1 : x.skill > y.skill ? 1 : x.startLine - y.startLine

export const XS01: CorpusRule = {
  id: 'XS01',
  check(skills, ctx) {
    const minLines = ctx.options['minLines'] as number
    const minSkills = ctx.options['minSkills'] as number
    const seqs = skills.map(s => ({ name: s.dirName, lines: bodyLines(s) }))

    // blockKey (joined normalized text) -> siteKey -> site
    const blocks = new Map<string, Map<string, CorpusSite>>()
    for (let i = 0; i < seqs.length; i++) {
      for (let j = i + 1; j < seqs.length; j++) {
        const a = seqs[i].lines
        const b = seqs[j].lines
        for (let ai = 0; ai < a.length; ai++) {
          for (let bi = 0; bi < b.length; bi++) {
            if (a[ai].text !== b[bi].text) continue
            // only start at run starts — interior anchors are covered by extension
            if (ai > 0 && bi > 0 && a[ai - 1].text === b[bi - 1].text) continue
            let len = 0
            while (ai + len < a.length && bi + len < b.length && a[ai + len].text === b[bi + len].text) len++
            if (len < minLines) continue
            const key = a.slice(ai, ai + len).map(l => l.text).join('\n')
            const sites = blocks.get(key) ?? new Map<string, CorpusSite>()
            for (const [seq, at] of [
              [seqs[i], ai],
              [seqs[j], bi],
            ] as const) {
              const site: CorpusSite = {
                skill: seq.name,
                file: 'SKILL.md',
                startLine: seq.lines[at].line,
                endLine: seq.lines[at + len - 1].line,
              }
              sites.set(`${site.skill}:${site.startLine}`, site)
            }
            blocks.set(key, sites)
          }
        }
      }
    }

    const keys = [...blocks.keys()]
    const out: CorpusRuleFinding[] = []
    for (const key of keys) {
      const sites = [...blocks.get(key)!.values()]
      const skillSet = new Set(sites.map(s => s.skill))
      if (skillSet.size < minSkills) continue
      // containment: a shorter block inside a longer reported block covering
      // the same skills is the same duplication, not a second finding
      const contained = keys.some(other => {
        if (other === key || other.length <= key.length || !other.includes(key)) return false
        const otherSkills = new Set([...blocks.get(other)!.values()].map(s => s.skill))
        if (otherSkills.size < minSkills) return false
        return [...skillSet].every(s => otherSkills.has(s))
      })
      if (contained) continue
      out.push({
        message: `${key.split('\n').length}-line block shared by ${skillSet.size} skills — extract to a shared reference`,
        sites: sites.sort(bySkillThenLine),
      })
    }
    return out.sort((x, y) => bySkillThenLine(x.sites[0], y.sites[0]))
  },
}
