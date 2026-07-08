# M3B calibration — corpus mode, config overrides, rule refinements

**Date:** 2026-07-08 · **Profile:** default · Corpus strictly read-only throughout.

## Predictions (written before the sweep)

Sweep command: `bun scripts/calibrate.ts` (both default roots, via `lint --corpus --json`).
Corpus strictly read-only; severity changes recorded, never made (M2/M3 protocol).

| Prediction | Evidence |
|---|---|
| XS01, personal root: **exactly one finding, five sites** — the collab-readiness block shared by the five ai-whisper kickoff skills (`ai-whisper-bugfix`, `-deliberation`, `-quick-task`, `-ralph`, `-sdd`), on the order of 70 normalized lines. Any other shape — fragmented shorter runs, extra blocks, fewer or more sites — is a deviation and gets its own adjudication row (spec §8). | docs/LINT-RULES.md XS01 evidence row (~70-line block × 5 skills) |
| XS02, personal root: exactly one cluster — the same five kickoff skills (~80% shared bodies). No other cluster on either root. | docs/LINT-RULES.md XS02 evidence row |
| Superpowers root: zero XS findings of either kind. | No known ≥15-line identical cross-skill block or ≥0.8 body pair in that corpus |
| Per-skill single-skill counts on both roots are identical to the CALIBRATION-M3 post-fix tables, with exactly two sanctioned deltas: HY05 gains one personal-root warning (compress's `cd … && python3 …` line — the M3b segment-scan closes the documented miss) and ST04 unchanged at 5 personal-root errors (Branch A: findings stand). Any other delta is a corpus-loop regression, not a finding. | Corpus mode reuses the engine unchanged (spec §8); CALIBRATION-M3 HY05/ST04 adjudication rows |
| Skipped reporting: personal root reports `personal-preferences` (`no SKILL.md`); superpowers root reports none; zero `runError` entries on either root. | M3 corpus-composition notes (14 + 14 skills, one empty dir) |

## ST04 quoted-utterance experiment (spec §5)

Protocol: two throwaway project-scoped probe skills (control: unquoted `@docs/marker.md`;
subject: the quoted-utterance form from the M3a calibration findings), each run headlessly
(`claude -p`), judged by two signals — the model's reply and, authoritatively, a sentinel
grep over the session transcript JSONL.

### Commands and verbatim evidence

Probe scaffold (fresh `mktemp -d`, never touching `~/.claude/skills/`):

```bash
SCRATCH=$(mktemp -d "${TMPDIR:-/tmp}/st04-probe-XXXXXX")
mkdir -p "$SCRATCH/control/.claude/skills/st04-probe" "$SCRATCH/control/docs"
mkdir -p "$SCRATCH/subject/.claude/skills/st04-probe" "$SCRATCH/subject/docs"
# $SCRATCH/control/docs/marker.md, $SCRATCH/control/.claude/skills/st04-probe/SKILL.md,
# $SCRATCH/subject/docs/marker.md, $SCRATCH/subject/.claude/skills/st04-probe/SKILL.md
# written per the Task 13 brief, verbatim.
```

Run (actual scratch dir: `/var/folders/56/yjhlprss5h7cptxby1rcqks40000gn/T/st04-probe-Ognwxo`):

```bash
(cd "$SCRATCH/control" && claude -p 'Use the st04-probe skill now and follow its procedure exactly.') > "$SCRATCH/control-reply.txt" 2>&1
(cd "$SCRATCH/subject" && claude -p 'Use the st04-probe skill now and follow its procedure exactly.') > "$SCRATCH/subject-reply.txt" 2>&1
```

Both invocations exited 0, well under the 5-minute-per-probe budget.

**Signal (a) — model replies, verbatim:**

Control (`control-reply.txt`):

```
ST04 token visible in context:

- `ST04-CONTROL-SENTINEL-9f27c1`

Token came from `docs/marker.md`, force-loaded by skill's @-path reference. No other ST04- tokens visible.
```

Subject (`subject-reply.txt`):

```
Probe result: one ST04- token visible in context:

ST04-SUBJECT-SENTINEL-4b81d2

(Came from Read result of `docs/marker.md` injected via system-reminder. Lowercase skill name `st04-probe` also present, but only uppercase ST04- token is that sentinel.)
```

**Signal (b) — authoritative transcript grep:**

```bash
grep -l 'ST04-CONTROL-SENTINEL-9f27c1' ~/.claude/projects/*st04-probe*/*.jsonl || echo 'CONTROL: no transcript hit'
# -> /Users/vuphan/.claude/projects/-private-var-folders-56-yjhlprss5h7cptxby1rcqks40000gn-T-st04-probe-Ognwxo-control/89cef8a2-49a5-4d7d-bd23-ca5b2920d21a.jsonl

grep -l 'ST04-SUBJECT-SENTINEL-4b81d2' ~/.claude/projects/*st04-probe*/*.jsonl || echo 'SUBJECT: no transcript hit'
# -> /Users/vuphan/.claude/projects/-private-var-folders-56-yjhlprss5h7cptxby1rcqks40000gn-T-st04-probe-Ognwxo-subject/5cd2c675-cbcf-442b-95d9-205c837f1a14.jsonl
```

Both sentinels are present in their matching probe's transcript: control hit, subject hit.

**Mechanism check (why the subject hit counts as force-load, not a deliberate Read):**
the subject's reply phrase "injected via system-reminder" prompted a closer read of the raw
transcript to rule out the model having chosen to call the `Read` tool on its own initiative
(which would not be evidence of `@`-expansion firing inside a quoted span). The transcript
shows, for both probes, an identical mechanism: immediately after the skill body is loaded
(a `user`/`isMeta:true` event carrying the raw `SKILL.md` Procedure text — quotes and all, for
the subject run), the harness emits a synthetic `attachment` event of `type: "file"` whose
`filename` is the marker file and whose `content` is the marker's full text. This attachment
event appears **before** any assistant turn and **without** any `tool_use`/`tool_result` pair
for `Read` anywhere in either transcript — i.e. it is the harness's own `@`-path scan
force-loading the file, not the model electing to read it. The subject's SKILL.md `@`-path
sits inside `*"..."*` (italic + straight quotes) and was force-loaded via this same automatic
mechanism, at the same point in the turn sequence, as the control's unquoted `@`-path.

### Verdict

Branch A: control hit, subject hit — `@`-expansion ignores quoting. The five M3a ST04
findings are true positives; no rule change; locking test added.

## Actual counts (verbatim)

<!-- pasted verbatim from `bun scripts/calibrate.ts`, first run, before any adjudication fixes -->

**Corpus composition at sweep time.** Personal root: 15 directory entries, 14 linted — unchanged
from CALIBRATION-M3's count. One thing did drift, though: `personal-preferences` is no longer the
empty real directory M2/M3 described. Between M3 and this sweep it became a symlink
(`~/.claude/skills/personal-preferences -> /Users/vuphan/Dev/assistant-preferences/skills/personal-preferences`)
whose target no longer exists on disk — a dangling symlink, drifted in the user's live corpus
outside this project's control (confirmed read-only via `ls -la`). Superpowers root is unchanged
at the pinned 6.1.1 vintage, 14 skills.

stdout, first run (`bun scripts/calibrate.ts`, both roots):

```
## /Users/vuphan/.claude/skills — 14 skills

| Rule | Errors | Warnings | Skills affected |
|---|---|---|---|
| CT01 | 13 | 0 | 13 |
| CT02 | 12 | 0 | 12 |
| CT03 | 13 | 0 | 13 |
| CT04 | 0 | 13 | 13 |
| CT05 | 0 | 13 | 13 |
| CT06 | 0 | 12 | 12 |
| CT07 | 7 | 0 | 7 |
| FM04 | 13 | 0 | 12 |
| FM05 | 13 | 0 | 13 |
| HY04 | 0 | 1 | 1 |
| HY05 | 0 | 1 | 1 |
| ST03 | 0 | 1 | 1 |
| ST04 | 5 | 0 | 5 |

### Corpus findings

- XS01 (warn): 52-line block shared by 3 skills — extract to a shared reference — sites: ai-whisper-bugfix, ai-whisper-deliberation, ai-whisper-ralph
- XS01 (warn): 54-line block shared by 2 skills — extract to a shared reference — sites: ai-whisper-bugfix, ai-whisper-ralph
- XS01 (warn): 30-line block shared by 4 skills — extract to a shared reference — sites: ai-whisper-bugfix, ai-whisper-deliberation, ai-whisper-ralph, ai-whisper-sdd
- XS01 (warn): 29-line block shared by 4 skills — extract to a shared reference — sites: ai-whisper-bugfix, ai-whisper-deliberation, ai-whisper-quick-task, ai-whisper-ralph
- XS01 (warn): 17-line block shared by 4 skills — extract to a shared reference — sites: ai-whisper-bugfix, ai-whisper-deliberation, ai-whisper-quick-task, ai-whisper-ralph
- XS01 (warn): 22-line block shared by 3 skills — extract to a shared reference — sites: ai-whisper-bugfix, ai-whisper-ralph, ai-whisper-sdd
- XS01 (warn): 21-line block shared by 5 skills — extract to a shared reference — sites: ai-whisper-bugfix, ai-whisper-deliberation, ai-whisper-quick-task, ai-whisper-ralph, ai-whisper-sdd
- XS01 (warn): 20-line block shared by 2 skills — extract to a shared reference — sites: ai-whisper-deliberation, ai-whisper-sdd
- XS01 (warn): 49-line block shared by 2 skills — extract to a shared reference — sites: ai-whisper-quick-task, ai-whisper-sdd
- XS01 (warn): 29-line block shared by 2 skills — extract to a shared reference — sites: ai-whisper-quick-task, ai-whisper-sdd

## /Users/vuphan/.claude/plugins/cache/claude-plugins-official/superpowers/6.1.1/skills — 14 skills

| Rule | Errors | Warnings | Skills affected |
|---|---|---|---|
| CT01 | 14 | 0 | 14 |
| CT02 | 14 | 0 | 14 |
| CT03 | 14 | 0 | 14 |
| CT04 | 0 | 14 | 14 |
| CT05 | 0 | 6 | 6 |
| CT06 | 0 | 4 | 4 |
| CT07 | 10 | 0 | 10 |
| FM04 | 1 | 0 | 1 |
| FM05 | 14 | 0 | 14 |
| HY03 | 0 | 1 | 1 |
| HY06 | 0 | 1 | 1 |
| ST01 | 2 | 2 | 3 |
| ST02 | 1 | 0 | 1 |
| ST03 | 0 | 13 | 6 |
| ST05 | 0 | 1 | 1 |
```

stderr, first run: **empty — zero bytes.** No `skipped` line for `personal-preferences`, no
`lint failed`/`runError` lines on either root. This is itself a deviation from the "personal root
reports `personal-preferences` skipped (`no SKILL.md`)" prediction — see Adjudications below.

### Post-fix re-verification (after the one rule-logic-bug fix, `discover.ts` below)

`bun scripts/calibrate.ts` re-run after fixing the dangling-symlink accounting gap in
`src/lib/corpus/discover.ts`; full suite green (`bun test`, 232 pass, up from 231 pre-fix).

stdout, post-fix: **byte-identical to the first run above** (diffed directly — the fix only
changes `skipped` accounting, it does not touch any rule's findings).

stderr, post-fix:

```
skipped /Users/vuphan/.claude/skills/personal-preferences — broken symlink
```

Superpowers-root `skipped` and `runError` were empty on both the first run and the post-fix
run — matching the prediction exactly, no deviation there.

## Adjudications

Protocol: every deviation from a prediction gets one row, classified `rule-logic bug` (fix code,
RED fixture first), `miscalibration` (record evidence + proposed profile-option change, never
edit `profiles/default.yaml` — Global Constraint 5, the user's decision), or `audit-miss`
(document only). Documentation over churn unless the evidence is unambiguous. Each row below was
investigated against the real corpus content (read-only) before classification.

### Confirmed predictions (no deviation — listed for completeness, not adjudicated)

Superpowers root fires zero XS findings of either kind, exactly as predicted. Per-skill
single-skill counts on both roots are identical to the CALIBRATION-M3 post-fix tables with exactly
the two sanctioned deltas and nothing else: HY05 gains its predicted one personal-root warning
(`compress/SKILL.md:26`, `unfenced command "python3" after a shell operator` — the M3b
segment-scan) and ST04 is unchanged at 5 personal-root errors (no delta, per Branch A — findings
stand). Superpowers-root `skipped`/`runError` are both empty, exactly as predicted.

### Deviations

| Deviation | Classification | Investigation and action |
|---|---|---|
| **XS01** does not fire as "one finding, five sites"; actual is **10 separate findings** across varying skill subsets (2–5 skills) and block lengths (17–54 lines), drawn entirely from the same 5 predicted skills (`ai-whisper-bugfix`, `-deliberation`, `-quick-task`, `-ralph`, `-sdd`). | audit-miss | Direct pairwise diff of each skill's "Verify collab readiness" section (read-only) shows the ~70-line block has genuinely drifted apart since the LINT-RULES evidence was recorded: `ai-whisper-sdd:62-63` and `ai-whisper-quick-task:113-114` both insert a clarifying sentence ("The `agents` array may list all supported types;") that `ai-whisper-bugfix:65`, `-deliberation`, and `-ralph` lack; separately, `ai-whisper-quick-task` has an extra step ("2. Write or resolve the brief") inserted ahead of collab-readiness, shifting every subsequent heading number and cross-reference (`ai-whisper-bugfix:98` "Proceed to step 3" / `:102` "### 3. Kick off the workflow" vs `ai-whisper-quick-task:147`/`:151` "step 4" / "### 4."). XS01 is an exact-line detector (spec §8); given real, independent edits at these points, fragmenting into multiple maximal common runs is the *correct* behavior, not a bug — and one of the ten findings (21 lines) still spans all 5 skills, confirming the algorithm found the true maximal shared block once the divergences are accounted for. The seed evidence (~70 normalized lines, LINT-RULES XS01 row) is stale relative to the corpus's current, live state; documented, not fixed — directly mirroring the M3 ST04 precedent (rule doing exactly what its contract says; the prediction's citation was the thing that was wrong). |
| **XS02** predicted one 5-skill cluster; actual is **zero clusters** — no XS02 corpus findings at all on either root. | miscalibration | Direct measurement (read-only script reusing XS02's own `bodyLines`/Jaccard formula) of all 10 pairwise similarities among the five kickoff skills gives a **maximum of 0.6964** (`ai-whisper-bugfix` vs `-ralph`; full matrix ranges 0.4564–0.6964), well under the `similarity: 0.8` threshold in `profiles/default.yaml` — which itself carries the inline comment `# calibrate in M3 vs kickoff-clone evidence`, flagging this exact number as provisional pending a run like this one. The "~80% shared bodies" evidence (LINT-RULES XS02 row) appears to describe a containment-style measure (e.g. bugfix∩ralph / bugfix-size = 78/95 = 82.1%) rather than XS02's actual intersection-over-**union** metric, which is mechanically lower whenever two similarly-sized bodies aren't near-total supersets of each other — a real metric/evidence mismatch, not a code defect (Jaccard-over-union is a deliberate, documented design choice, spec §8, and the code was not found to misimplement it). Two threshold options, both evidence-backed, are recorded here for the user's decision (Global Constraint 5 — neither applied): lowering `similarity` to **~0.65** forms one 4-skill cluster (`bugfix`/`deliberation`/`ralph`/`sdd` — all 6 pairwise edges among them are ≥0.6607; `quick-task`'s best pairing is 0.5547, still short, so it stays isolated); lowering it to **~0.45** (at or below the weakest connecting edge, `quick-task`–`deliberation`/`-ralph` at 0.4564) pulls `quick-task` in too, forming the exact 5-skill cluster the prediction named — at the cost of a much more permissive bar corpus-wide, whose precision impact on other, unrelated skill pairs is untested here. Not applied to `profiles/default.yaml`. |
| **Skipped reporting**: personal root predicted to report `personal-preferences` skipped (`no SKILL.md`); actual (pre-fix) is **zero skipped entries** on either root (empty stderr, empty JSON `skipped: []`). | rule-logic bug (fixed) | Read-only inspection of `~/.claude/skills/personal-preferences` shows it is no longer the empty real directory M2/M3 described: it is now a symlink to `/Users/vuphan/Dev/assistant-preferences/skills/personal-preferences`, and that target does not exist — a dangling symlink, drifted since M3 outside this project's control. The immediate deviation cause is environmental, but investigating `src/lib/corpus/discover.ts` uncovered a genuine, unrelated accounting bug: the `catch` branch around `statSync(dir)` (which dangling symlinks fall into) silently `continue`d, adding the entry to neither `skillDirs` nor `skipped` — contradicting the function's own documented contract ("a child directory with a SKILL.md is a skill; one without is recorded as skipped"). Any corpus root containing a dangling symlink would silently under-report its own composition, with no trace in `skipped`, `skills`, or `runError`. Fixed: RED fixture added first (`tests/corpus/discover.test.ts`, "a dangling symlink is recorded as skipped, not silently dropped" — confirmed failing pre-fix), then `discover.ts`'s catch branch now pushes `{ dir, reason: 'broken symlink' }` (or `'inaccessible'` for non-`ENOENT` stat failures, e.g. permission errors) instead of dropping the entry; `bun test` green after (232 pass, up from 231). Post-fix sweep confirms: stderr now reads `skipped /Users/vuphan/.claude/skills/personal-preferences — broken symlink`; no rule's findings changed (the fix is discovery-accounting only, confirmed by a byte-identical stdout diff pre/post-fix). Superpowers-root `skipped`/`runError` were empty on both runs, matching the prediction exactly — no deviation there. |

## Outcome

Three deviations from an explicit prediction were found and adjudicated: **one rule-logic bug
(fixed, RED fixture first)** — the `discover.ts` dangling-symlink accounting gap that silently
dropped `personal-preferences` from every report bucket instead of recording it as skipped — and
**two non-code adjudications**: XS02's zero-clusters result is a **miscalibration** (the
`similarity: 0.8` threshold in `profiles/default.yaml`, already flagged provisional by its own
inline comment, sits above the measured 0.4564–0.6964 range for the five kickoff skills; two
evidence-backed threshold options are recorded above, neither applied — user decision per Global
Constraint 5), and XS01's 10-fragment result is an **audit-miss** (the ~70-line collab-readiness
block the LINT-RULES evidence cited has genuinely drifted apart across two of the five skills
since that evidence was recorded; the exact-line detector is fragmenting correctly around real,
independent edits — one 21-line, 5-skill finding still surfaces the shared core). **Zero severity
changes** and **zero edits to `profiles/default.yaml`** — the only code change is the one
narrowly-scoped discovery-accounting fix, plus its test.

Corpus untouched: `git status --porcelain` (post-adjudication) shows only `docs/CALIBRATION-M3B.md`,
`src/lib/corpus/discover.ts`, and `tests/corpus/discover.test.ts` — no path under `~/.claude/` was
written. All reads of `~/.claude/...` content throughout this sweep and its adjudications were
read-only (`ls`, `sed`/`diff`, `grep`, a read-only Jaccard-measurement script, and the linter's own
read-only parse).

**Regression cross-check verdict: PASS.** Every single-skill rule's error/warning/skills-affected
counts on both roots match the CALIBRATION-M3 post-fix tables exactly, with precisely the two
sanctioned deltas named in the prediction and nothing else: HY05 gains its predicted one
personal-root warning (`compress/SKILL.md:26`) and ST04 stays at 5 personal-root errors (no
delta). No rule's count moved on the superpowers root. The only counts that differ from
CALIBRATION-M3 at all are XS01/XS02 (new in M3b, corpus-only, no M3 baseline to regress against)
and the `skipped` array (`personal-preferences`, addressed above) — confirming corpus mode reuses
the single-skill engine unchanged, per spec §8.
