# M3b — Corpus mode + config overrides (design)

**Date:** 2026-07-08 · **Status:** approved for planning · **Milestone:** M3b (docs/ROADMAP.md)
**Predecessor:** M3a (docs/specs/2026-07-08-m3a-rule-catalog-design.md) shipped all 24 single-skill rules; XS01/XS02 were deferred here because they need corpus context.

## §0 Scope and adjudicated decisions

M3b delivers three things: `shakespii lint --corpus <root>` with the two cross-skill rules
XS01/XS02, a `--config <file>` mechanism for profile overrides, and the two rule refinements
parked by the M3a calibration (ST04 quoted utterances, HY05 compound commands).

User adjudications from the M3b brainstorm (2026-07-08) — these are settled, not open:

| Decision | Choice |
|---|---|
| Corpus mode scope | Full lint: every discovered skill gets the complete 24-rule single-skill lint, plus XS01/XS02 across the corpus, in one invocation |
| Architecture | Approach A: thin corpus loop reusing the existing parser and engine per skill, XS rules in a separate registry with their own signature; the single-skill code path is untouched |
| Config lookup | `--config` flag only. No auto-discovery: the same input always produces the same findings unless the caller explicitly passes overrides |
| ST04 quoted utterances | Verify, then decide: an empirical check of Claude Code's `@`-expansion inside quoted text gates whether ST04 gains an exemption (§5) |
| HY05 compound commands | Segment-scan: split unfenced lines on shell operators and check each segment, without adding `cd` to the command list (§6) |

Severity policy carries over from M3a §0: no severity in `profiles/default.yaml` changes in this
milestone. The `--config` mechanism is precisely the sanctioned channel for a *user* to demote or
disable rules; the shipped defaults stay as calibrated.

## §1 Corpus discovery and parsing

`discoverSkills(root)` (new, `src/lib/corpus/discover.ts`):

- Reads the immediate children of `root`, sorted lexicographically for deterministic output. No
  recursion — both real corpus roots (`~/.claude/skills/`, the superpowers plugin skills dir) are
  flat one-level layouts.
- A child directory containing a `SKILL.md` file is a skill. Symlinked directories are followed
  (`~/.claude/skills/using-shakespii` is a symlink and must be discovered).
- A child directory without `SKILL.md` is recorded in `skipped` with reason `no SKILL.md` (the
  `personal-preferences/` precedent — benign, reported, never an error).
- Non-directory children are ignored silently.
- If `root` itself contains a `SKILL.md`, the run fails with exit 2 and the message
  `target is a single skill; drop --corpus or point at its parent directory`. An explicit contract
  beats a silent corpus-of-zero.
- If `root` does not exist or is not a directory: exit 2, `not a directory: <root>`.

Each discovered skill is parsed once with the existing `parseSkill` into the same `ParsedSkill`
the single-skill path uses, then linted with the existing `runRules(skill, profile)` — the engine,
the 24 rules, and their severities are reused without modification. If `parseSkill` or `runRules`
throws for one skill (e.g. a decode failure), that skill's entry carries a `runError` string
instead of findings, the remaining skills still lint and report, and the overall exit code is 2 —
preserving the frozen "exit 2 = lint could not run" semantics without letting one corrupt skill
abort the whole audit.

`lintCorpus(root, profile)` (new, `src/lib/corpus/index.ts`) composes discovery, per-skill lint,
and the XS pass (§2), returning a plain result object the CLI formats. It is a pure library
function over the filesystem inputs, testable without the CLI.

## §2 Cross-skill rules XS01 and XS02

New rule kind, separate from the single-skill registry:

```ts
type CorpusRule = (skills: ParsedSkill[], ctx: RuleContext) => CorpusFinding[]

interface CorpusFinding {
  ruleId: 'XS01' | 'XS02'
  severity: Severity            // stamped from the profile, same mechanism as single-skill rules
  message: string
  sites: CorpusSite[]           // always ≥ 2 distinct skills
}

interface CorpusSite {
  skill: string                 // directory name
  file: 'SKILL.md'              // M3b scope: SKILL.md body only
  startLine: number             // 1-indexed, original file coordinates
  endLine: number
}
```

The corpus registry is `[XS01, XS02]` (`src/lib/rules/corpus/index.ts`). The engine gains a
`runCorpusRules(skills, profile)` counterpart that stamps profile severity and honors `off`
exactly as `runRules` does.

**Shared normalization.** Both rules operate on the SKILL.md body (post-frontmatter) as a
sequence of `(text, originalLine)` pairs where `text` is the line with trailing whitespace
stripped and blank lines are dropped. Blank lines therefore neither break a duplicate run nor
count toward thresholds, and reported line ranges map back to original file coordinates.
Frontmatter is excluded by construction (name and description legitimately differ per skill).

**XS01 — duplicate-block detection.** Options: `{ minLines: 15, minSkills: 2 }` (already in
`profiles/default.yaml`). Algorithm:

1. Build a map from line-hash to its occurrences `(skillIndex, normalizedIndex)` across all
   skills.
2. For each anchor line occurring in ≥ 2 distinct skills, extend the match forward and backward
   while the normalized lines stay identical, producing maximal shared runs.
3. Discard runs shorter than `minLines` (counted in normalized, non-blank lines) or spanning
   fewer than `minSkills` distinct skills. Duplication *within* a single skill does not count.
4. Merge overlapping/contained runs so each duplicated block yields exactly one finding whose
   `sites` list every sharing skill with its original start/end lines.

Message shape: `` `NN-line block shared by K skills — extract to a shared reference` `` where NN
is the normalized line count of the block. Evidence target: the ~70-line ai-whisper
collab-readiness block shared by the five kickoff skills must produce exactly one finding with
five sites.

**XS02 — near-clone detection.** Option: `{ similarity: 0.8 }` (already in
`profiles/default.yaml`). Algorithm:

1. Per skill, take the *set* of normalized non-blank body lines (duplicates within a skill
   collapse).
2. For each skill pair, Jaccard similarity `|A ∩ B| / |A ∪ B|`; pairs at or above `similarity`
   are clone edges. 28 corpus skills is 378 pairs — trivially cheap.
3. Union-find the edges into clusters. Each cluster yields **one** finding listing all members
   (not C(k,2) pair findings), with one site per member spanning that skill's full body range.

Message shape: `` `near-clone cluster of K skills (pairwise similarity ≥ 0.8) — consider parameterizing into one skill` ``.
Evidence target: exactly one cluster containing the five kickoff skills
(`ai-whisper-bugfix`, `-deliberation`, `-quick-task`, `-ralph`, `-sdd`); no other cluster.

XS01 and XS02 both firing on the kickoff skills is expected and correct — they prescribe
different remedies (extract the shared block vs. parameterize the whole skill).

## §3 CLI surface and output

```
shakespii lint <path> [--json] [--corpus] [--config <file>]
```

Without `--corpus`, behavior is byte-identical to M3a — same pretty output, same JSON v1 report
(`{ version: 1, skill: { dir, name }, profile, summary: { errors, warnings }, findings[] }`),
same exit codes. The frozen single-skill surface does not change; `--config` only changes
*findings* when the caller passes it (§4).

With `--corpus`, `<path>` is the corpus root.

**Human output:** per-skill sections in the existing pretty format (one header per skill
directory, findings beneath), rendered in discovery order. Each corpus finding is rendered under
*every* involved skill's section, suffixed with its partner skills (an agent fixing one skill
must see it), then a closing summary block:
`K skills linted, S skipped · E errors, W warnings (of which C corpus-level)`.

**JSON output** (new schema family, discriminated by `mode`; the single-skill report gains no
`mode` field and stays untouched):

```json
{
  "version": 1,
  "mode": "corpus",
  "profile": "default",
  "root": "/abs/path/to/root",
  "skills": [
    {
      "skill": { "dir": "/abs/path/to/root/foo", "name": "foo" },
      "summary": { "errors": 2, "warnings": 1 },
      "findings": [ { "ruleId": "FM05", "severity": "error", "file": "SKILL.md", "line": 1, "message": "…" } ]
    },
    { "skill": { "dir": "/abs/path/to/root/broken", "name": null }, "runError": "…" }
  ],
  "corpusFindings": [
    {
      "ruleId": "XS01", "severity": "warn",
      "message": "72-line block shared by 5 skills — extract to a shared reference",
      "sites": [ { "skill": "ai-whisper-sdd", "file": "SKILL.md", "startLine": 41, "endLine": 118 } ]
    }
  ],
  "skipped": [ { "dir": "/abs/path/to/root/personal-preferences", "reason": "no SKILL.md" } ],
  "summary": { "skills": 14, "skipped": 1, "errors": 60, "warnings": 57 }
}
```

The per-skill entries reuse the v1 inner shapes verbatim (`skill`, `summary`, `findings` with
`ruleId`/`severity`/`file`/`line`/`message`). The top-level `summary.errors`/`summary.warnings`
count each corpus finding **exactly once** (not once per site, not once per involved skill), so
`sum(skills[].summary) + count(corpusFindings by severity) = summary` is a verifiable identity.

**Exit codes** (unchanged semantics): `0` — no error-severity findings anywhere (XS warns do not
flip it); `1` — at least one error finding (per-skill or corpus); `2` — the run itself failed
(root unreadable, root-is-a-skill, unreadable config, or any per-skill `runError`).

## §4 Config overrides (`--config <file>`)

A YAML file expressing a *partial profile*, deep-merged over `profiles/default.yaml` at load
time. Applies identically to single-skill and corpus modes.

**Overridable:**

- `rules.<ID>`: either a severity shorthand (`HY04: off`) or an object
  (`FM03: { severity: warn, options: { warnChars: 800 } }`). Object form merges key-wise:
  omitted `severity` keeps the default severity, `options` merges over default options key by
  key.
- `anatomy.<key>.level`: replaces the default level.
- `anatomy.<key>.aliases`: **replaces the default alias list wholesale** when present — merging
  alias lists is unpredictable; what you wrote is what matches.

**Not overridable:** `anatomy.<key>.canonical` (the anatomy contract's identity), `profile`,
`provenance`, and adding new rule IDs. Config tunes existing rules; it never extends the catalog.

**Severity domain:** `error | warn | off`. `off` means the engine never invokes the rule (both
`runRules` and `runCorpusRules` honor it).

**Fail-loud validation** — exit 2 with a message naming the offending key, never silent
no-ops: unknown top-level key (only `rules` and `anatomy` are legal), unknown rule ID
(`unknown rule in config: HY4`), unknown anatomy key, invalid severity value, attempts to set
`canonical`, malformed YAML, unreadable file. A typo that silently changes nothing is the failure
mode this section exists to prevent.

Implementation: `mergeProfile(base, overrides)` in `src/lib/profile/` beside the existing
loader; `runLint` grows `--config <file>` argument parsing.

## §5 ST04 — quoted-utterance verification, then decide

The M3a calibration found five ST04 errors on the ai-whisper kickoff skills, each a hypothetical
user utterance in a "Match phrases like" list (e.g. `- *"run SDD on the spec @docs/spec.md"*`).
Whether these are true positives depends on a runtime fact nobody has verified: does Claude
Code's `@`-expansion force-load the referenced file even when the `@`-path sits inside quoted
illustrative text?

**Experiment protocol (operator-assisted — needs a live Claude Code session, not
subagent-runnable):**

1. Create a throwaway project directory with a *project-scoped* probe skill
   (`<scratch>/.claude/skills/st04-probe/SKILL.md`) whose body contains exactly one
   quoted-utterance line with an `@`-path pointing at a marker file carrying a distinctive
   sentinel string. `~/.claude/skills/` is never touched — the probe loads through Claude Code's
   project skill root.
2. Trigger the probe skill in a live session started in that directory; inspect whether the
   sentinel content entered the context.
3. Record the observed behavior verbatim (what was injected, under which mechanic) in
   docs/LINT-RULES.md's ST04 evidence row and in the M3b calibration doc.

**Decision gate:**

- **Expansion fires inside quotes** → the five findings are true positives. No code change.
  Remediation for the kickoff skills is backticking the paths — a corpus edit, which stays the
  user's call outside this milestone (corpus is read-only during calibration).
- **Expansion does not fire** → implement a narrow exemption: an `@`-token inside a quoted span
  (straight `"…"` or curly `“…”` quotes) on the same line does not fire. TDD: RED fixture for
  the exemption plus a still-fires regression (unquoted `@`-link on the same line as a quoted
  phrase) before the code change.

Either branch ends with the outcome documented; the rule's contract in docs/LINT-RULES.md is
updated to state the verified behavior rather than an assumption.

## §6 HY05 — compound-command segment scan

The M3a calibration documented a miss: `cd <dir> && python3 -m scripts <file>` (compress, the
audit's cited offender) never fires because the line-start anchor only sees `cd`, which is not in
`COMMANDS`. Adjudicated fix: segment scanning.

- Split each unfenced candidate line on the shell operators `&&`, `||`, and `;`. Left-trim each
  segment and apply the existing case-sensitive command anchor to every segment (the optional
  `$ ` prefix remains legal only on the first segment, i.e. at true line start).
- `COMMANDS` is unchanged — in particular `cd` stays out, so prose like
  "cd to the repo, then run the tests" still cannot fire (a comma is not an operator and "to" is
  not a command).
- **Deliberately not splitting on `|`**: an unfenced markdown table row like
  `| git status | shows the working tree |` would segment into `git status` and false-positive on
  every table that documents commands. Pipe-chained real commands almost always start with a
  listed command anyway (`git log | head` fires on segment one). This recall sacrifice is
  documented in the rule source and docs/LINT-RULES.md.
- TDD fixtures (RED first): the compress-style compound line fires; the cd-prose line does not;
  a command-documenting table row does not; the four existing HY05 fixtures stay untouched.

## §7 Testing

- **Fixture mini-corpora** under `tests/fixtures/corpus/`: a clone pair (XS02 fires), a
  shared-block trio (XS01 fires once with three sites), a clean pair (zero XS findings), a root
  with a skipped non-skill directory, a root containing one broken skill (`runError`, exit 2),
  and a root that is itself a skill (exit 2). Fixtures are minimal — blocks just over/under
  `minLines`, similarity just over/under `0.8`.
- **Unit tests** for XS01/XS02 as pure functions over in-memory `ParsedSkill[]`, via an
  extension of the existing `tests/helpers/skill.ts` trio (`skillFromRaw` already builds a
  single `ParsedSkill`; a thin `corpusFromRaws` helper builds the array).
- **CLI tests**: `--corpus` JSON shape (including the summary identity from §3), exit codes
  0/1/2, pretty output rendering XS findings under each involved skill; `--config` severity
  demotion, `off`, options override, alias replacement, and every fail-loud validation case
  from §4 exiting 2.
- **Corpus keystone**: the mini-corpus fixtures' expected finding counts are locked the same way
  the scaffold keystone locks the raw-scaffold's 20 errors — deltas require adjudication, never
  a silent re-lock.
- **Existing invariants untouched**: the scaffold keystone (exactly 20 errors: 18 PH01, 1 FM04,
  1 CT03), the using-shakespii weld (`{errors: 0, warnings: 0}`), and the frozen single-skill
  CLI surface all continue to hold because the default profile and the single-skill code path do
  not change. The weld test re-verifies after the §9 companion-skill edits.

## §8 Calibration (M3b sweep)

Same protocol as M2/M3a (docs/CALIBRATION-M3.md): predictions committed **before** the sweep
(commit order is the integrity evidence), verbatim counts pasted, one adjudication row per
deviation classified `rule-logic bug` / `miscalibration` / `audit-miss`, corpus strictly
read-only, severity changes recorded-not-made.

Seed predictions:

| Prediction | Evidence |
|---|---|
| XS01 fires exactly once on the personal root: the collab-readiness block, one finding, five sites (the five ai-whisper kickoff skills) | docs/LINT-RULES.md XS01 evidence row (~70-line block × 5 skills) |
| XS02 yields exactly one cluster on the personal root: the five kickoff skills; no other cluster on either root | docs/LINT-RULES.md XS02 evidence row (~80% shared bodies) |
| Superpowers root: zero XS findings | no known ≥15-line identical block or ≥0.8 clone pair in that corpus |
| Per-skill counts across both roots are identical to the CALIBRATION-M3 post-fix tables | corpus mode reuses the engine unchanged; any delta is a regression, not a finding |
| HY05 post-segment-scan: fires exactly once on the personal root (compress's compound line); superpowers root unchanged at zero | CALIBRATION-M3 HY05 adjudication row |

The fourth row makes the sweep double as a regression gate for the corpus loop itself. The sweep
runs via `shakespii lint --corpus` on each of the two roots (one invocation per root — multi-root
is a non-goal), and `scripts/calibrate.ts` is refactored to drive `lintCorpus` directly, deleting
its hand-rolled two-root walking logic — the calibration script becomes the first dogfood
consumer of the new API. ST04's post-experiment behavior (§5) is recorded in the same doc
(docs/CALIBRATION-M3B.md).

## §9 Companion skill and documentation updates

`skills/using-shakespii/SKILL.md` currently teaches "There is no corpus-wide lint mode; audit
multiple skills one directory at a time" (Anti-patterns) — true at M2.5, false after M3b. Ship
with:

- Anti-patterns line replaced with the real constraint: "Pointing `--corpus` at a single skill
  directory — corpus mode takes the *parent* directory; lint a single skill without the flag."
- Procedure gains the corpus-audit path: `shakespii lint <root> --corpus --json`, iterate
  per-skill findings, treat `corpusFindings` as refactor suggestions spanning skills.
- `references/rule-remediations.md` gains XS01/XS02 entries (extract shared reference /
  parameterize clones).
- `version` bumps 0.1.0 → 0.2.0 (FM05 keeps it honest).
- The weld test must stay `{errors: 0, warnings: 0}` after the edits.

Repo docs: docs/LINT-RULES.md XS rows gain "Shipped detection (M3b)" notes plus the ST04
outcome and HY05 segment-scan note; docs/ROADMAP.md ticks M3b when done; README's CLI usage
gains `--corpus` and `--config`. Dual-location sync applies to every doc in this list (canonical
`~/.ai-pref-nsync/local-docs/ai-shakespii/`, repo mirror, cmp-verified).

## §10 Non-goals

- Multi-root invocation (`--corpus` twice, or a list) — calibration simply runs twice.
- Recursive discovery below one level.
- Auto-discovered config files (revisit only if the flag proves annoying in practice).
- XS severity changes — both stay `warn` as calibrated in the default profile.
- XS scope beyond SKILL.md bodies (reference-file dedup is a future candidate).
- Score model work (decided 2026-07-08: severity counts only).
- TR01/TR02 (M4, harness-backed).
- Corpus edits: the dogfood corpus stays read-only throughout, including the five kickoff
  skills' ST04 remediation if §5 confirms true positives — that is the user's separate
  personal-skill-migration decision (docs/ROADMAP.md open decisions).
