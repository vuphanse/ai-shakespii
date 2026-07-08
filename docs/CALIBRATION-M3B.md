# M3B calibration — corpus mode, config overrides, rule refinements

**Date:** 2026-07-08 · **Profile:** default · Corpus strictly read-only throughout.

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
