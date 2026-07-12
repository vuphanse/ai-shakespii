# Skill Ownership Migration — Ecosystem Design

- **Date**: 2026-07-12
- **Status**: Approved design (umbrella spec; each sub-project gets its own spec in its own repo)
- **Decision owner**: Vu Phan
- **Context**: Follow-up to the M5d calibration campaign (see `docs/CALIBRATION-M5D.md`, local working copy)

## 1. Problem

The M5d campaign calibrated the installed skill corpus in `~/.claude/skills` and
established `~/Dev/ai-skills` as its source of truth. However, the ai-whisper-*
and ai-14all-* skills were originally shipped as product assets by their own
repos, and those repos still carry the pre-calibration templates:

- **ai-whisper** bundles 8 skills at `packages/cli/skills/`, including the four
  full near-clone skills (`ai-whisper-sdd`, `-bugfix`, `-deliberation`,
  `-ralph`) that M5d retired, and no `ai-whisper-workflow` dispatcher.
  `whisper skill install --force` copies them over the installed corpus for up
  to five provider directories (`~/.claude`, `~/.codex`, `~/.cursor`, ai-ezio,
  `~/.gemini`).
- **ai-14all** bundles 2 skills at `assets/agent-skills/` and writes `SKILL.md`
  unconditionally (no version check, no force flag) whenever the app's install
  action runs. The stale templates are also baked into built `.app` releases.

Any future install/configure action from either product silently reverts the
calibrated corpus — and in ai-whisper's case resurrects the retired clone
cluster alongside the new dispatcher, leaving both trigger sets to fight each
other.

## 2. Decision summary

Three decisions, made in order:

1. **Distribution scope** — ai-whisper and ai-14all are products used by other
   people independently; each product must carry its own self-contained skill
   set as product assets. (Rules out retiring the bundles.)
2. **Bundle architecture** — ai-whisper adopts the calibrated collapsed
   architecture upstream: the `ai-whisper-workflow` dispatcher plus four thin
   aliases replace the four full near-clone skills.
3. **Strategy** — **Approach A: one-time ownership transfer plus
   version-guarded installers.** Product repos become the source of truth for
   their companion skills; ai-skills stops owning product skills; installers
   gain a semver guard so they never silently downgrade an installed copy.
   - Approach B (ai-skills stays authoring home, products vendor from it via a
     sync script) was **rejected**: a private personal repo cannot feed public
     product assets, and the sync step reintroduces the forgot-to-resync drift
     bug class recorded in memory
     `mem-2026-07-12-calibration-loops-must-end-with-re-6af190`.
   - Approach C (shakespii-native provenance stamping respected by all
     ecosystem installers) is **parked** in the ai-shakespii tool backlog; the
     version guard covers the practical risk today.

## 3. Ownership model and governance

| Owner | Skills (dirs) | Source location |
| --- | --- | --- |
| ai-whisper | ai-whisper-workflow; ai-whisper-sdd, -bugfix, -deliberation, -ralph (thin aliases); ai-whisper-code-review; ai-whisper-plan-execution; ai-whisper-quick-task; ai-whisper-deliberation-craft — 9 | `packages/cli/skills/` |
| ai-14all | ai-14all-fix-review; ai-14all-session-status — 2 | `assets/agent-skills/` |
| ai-skills | genuinely personal skills only (currently none) | `skills/` |

Skill sources include the full evaluation suites — `evals/evals.json`,
`evals/triggers.json`, and `evals/files/` fixtures. Evals are the skills'
regression tests and travel with ownership.

**Governance amendment** (supersedes the M5d rule "live copies change only via
`shakespii install --force` from ai-skills"): live `~/.claude/skills` copies of
product skills change via each product's own installer, or via
`shakespii install --force` from a product repo checkout during calibration
work. Installed skills are still never hand-edited.

**Calibration workflow going forward**: check out the owning product repo →
edit skills there → run `shakespii lint`/`shakespii test` from there → PR
upstream → product installer distributes. ai-skills is no longer in the loop
for product skills.

**Version continuity**: upstream copies land with their calibrated `version`
frontmatter values unchanged; content is bit-for-bit what M5d measured. From
then on, any content edit to a skill in a product repo must bump `version` —
otherwise guarded installers will silently skip the change. This rule is
written into each product repo's AGENTS.md.

## 4. Migration content mapping

**ai-whisper bundle reshape** (8 dirs → 9):

- Delete: full `ai-whisper-sdd`, `-bugfix`, `-deliberation`, `-ralph` (the
  XS02 near-clone cluster).
- Add: `ai-whisper-workflow` (dispatcher, `references/workflow-types.md`,
  fixtures) and the four thin aliases. Aliases deliberately reuse the deleted
  fulls' directory names — see the upgrade story below.
- Replace content: `ai-whisper-code-review`, `-plan-execution`, `-quick-task`,
  `-deliberation-craft`.
- Everything is copied as full directories from the calibrated versions at
  ai-skills commit `91890bb`.

**ai-14all**: replace both `SKILL.md` files with calibrated content; add the
calibrated `evals/` directories to the repo (new — the product repo currently
ships none). The installer keeps writing `SKILL.md` only (evals are dev/CI
assets, not runtime assets); whether the packaged `.app` excludes evals from
`assets/agent-skills/` is a packaging detail for the ai-14all sub-spec.

**Upgrade story for existing users**: old installs contain the four full
clones with no `version` frontmatter. The guard treats a missing version as
older, so the next install upgrades them in place to the aliases and adds the
dispatcher. Machines already at calibrated versions compare equal and skip —
the migration is a no-op there.

## 5. Installer guard semantics

One rule, implemented independently in each repo (small, no shared
dependency). Compare the bundled skill's frontmatter `version` against the
installed `SKILL.md` at the destination, semver ordering:

| Condition | Action |
| --- | --- |
| destination missing | install |
| bundled > installed | install (upgrade) |
| bundled == installed | skip, report "up to date" |
| bundled < installed | skip, report "newer version installed — use `--force` to downgrade" |
| installed SKILL.md unreadable or no version field | treat as older → install |
| `--force` | always install, log what was replaced |

Parsing is a minimal frontmatter scan for the `version:` line — no YAML
library dependency; malformed frontmatter falls into "treat as older".

**ai-whisper** (`runSkillInstall` in
`packages/cli/src/commands/skill/install.ts`):

- The current throw-on-existing-destination behavior is replaced by the table
  above; a plain `whisper skill install` becomes safe and idempotent to run
  repeatedly.
- Results are reported per skill and per target (installed / up-to-date /
  skipped-newer) instead of aborting on the first conflict.
- The guard applies uniformly across all five provider targets.

**ai-14all** (`services/review/agent-skill-installer/`):

- Guard check before `writeSkill` in each provider (claude, codex, ezio). The
  app UI has no force concept: a skip surfaces as "skipped — newer installed"
  in the per-provider status message. A deliberate downgrade path, if ever
  wanted, is a later UI decision outside this migration.
- **Uninstall softening**: the current `rm -rf` of the whole skill directory
  deletes files the app never wrote (for example, locally installed evals).
  New behavior: remove only `SKILL.md`, then remove the directory only if it
  is empty — symmetric with what install writes.

**Failure honesty rule** (both): a skip is reported as a skip, never as a
successful install.

## 6. Product CI

Both product repos add a skills QA job:

- `shakespii lint <skill-dir> --json` for every bundled skill — errors fail
  the build, warnings are reported. shakespii is consumed from npm
  (`shakespii@^0.3.1`, public) as a devDependency; no private-repo dependency.
- `shakespii test <skill-dir>` deterministic checks only (structure and eval
  schema validation). Live trigger/grading sweeps are explicitly out of CI —
  they spend real model sessions and remain manual calibration campaigns run
  from the product repo when content meaningfully changes.
- A changed-content-needs-new-version assertion: if a bundled skill
  directory's content changed since the last release but its `version` did
  not, CI fails. Exact mechanism (git diff against tag) is a sub-spec detail.
- ai-whisper covers all 9 bundled dirs; ai-14all covers both of its skills and
  keeps the existing `skill-asset` unit tests. The installer guard gets unit
  tests in both repos.

## 7. ai-skills wind-down

- **Timing**: the 11 product skills leave ai-skills only after both upstream
  migrations are merged and verified installed (recursive diff clean against
  the live corpus). There is no window in which content exists nowhere.
- Retirement is a normal commit; history stays intact (the full M5d record,
  `62bd07e` → `91890bb`). The pre-M5d corpus backup tarball remains a second
  safety net.
- README is rewritten to the new role: home for genuinely personal skills,
  plus the documented calibration procedure for product skills (Section 3).
- The repo stays private — correct, since nothing product-owned lives there
  anymore.

## 8. Sub-project decomposition and order

Each sub-project runs in its own repo with its own spec → plan →
implementation cycle:

1. **ai-whisper** — bundle reshape with calibrated content, installer version
   guard, per-skill result reporting, CI job, AGENTS.md version-bump rule.
   First because it holds the worst clobber vector (`--force` resurrects the
   clone cluster).
2. **ai-14all** — calibrated assets and evals into the repo, provider guard
   before `writeSkill`, uninstall softening, CI job, then an app re-release to
   swap the baked-in assets.
3. **ai-skills** — retirement commit and README rewrite, only after 1 and 2
   are verified.
4. **ai-shakespii** — governance closure: AGENTS.md Live Corpus rewrite,
   amend/deprecate the M5d source-of-truth memories, park Approach C in the
   tool backlog.

## 9. Accepted risks

- **Old released `.app` clobber window**: already-built ai-14all releases
  carry stale assets and no guard; an install click from an old app version
  still overwrites `SKILL.md` until the app is updated. The user controls
  their own app usage; recovery is a re-install from the product repo. This
  motivates doing sub-project 2 promptly.
- **Hand-edited pre-versioning copies are overwritten**: a user who customized
  an old versionless skill loses those edits on upgrade (missing version is
  treated as older by design). Standard product-upgrade semantics.
- **Version-bump discipline is human**: an edit without a bump means
  installers skip it silently. Mitigated by the CI assertion and the AGENTS.md
  rule; residual risk accepted.
- **Multi-provider blind spot**: calibration measured Claude Code only; the
  same content ships to codex, cursor, ezio, and gemini unmeasured. Out of
  scope; noted for a future campaign.
- **Bundle rides CLI dist**: ai-whisper skills ship via `pnpm build` output,
  so a stale local build serves stale skills. Existing behavior, unchanged.

## 10. Out of scope

- shakespii provenance stamping (Approach C) — parked in the ai-shakespii
  backlog.
- Any change to skill content beyond what M5d calibrated (the parked
  deliberation-craft anti-pattern sharpening and workflow scope clause remain
  parked and would ship as normal versioned product edits later).
- Multi-provider trigger calibration.
