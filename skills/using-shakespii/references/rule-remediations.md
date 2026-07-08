# Rule remediations — rule catalog

Tracks `profiles/default.yaml` (profile `default`, M2 vintage; provenance superpowers
6.1.1). Last reviewed: 2026-07-08. When the rule catalog grows, append entries here — a
finding with no entry is fixed from its own `message`.

Every entry: what the rule demands, why it usually fires, the minimal fix, and a
before → after sketch.

## Contents

- [FM01 — frontmatter well-formed](#fm01--frontmatter-well-formed)
- [FM02 — name discipline](#fm02--name-discipline)
- [FM04 — trigger-first description](#fm04--trigger-first-description)
- [CT03 — concrete worked example](#ct03--concrete-worked-example)
- [ST02 — link targets exist](#st02--link-targets-exist)
- [PH01 — no placeholder tokens](#ph01--no-placeholder-tokens)
- [TR01 — skill ships a valid evals suite](#tr01--skill-ships-a-valid-evals-suite)
- [XS01 — duplicate block across skills (corpus mode)](#xs01--duplicate-block-across-skills-corpus-mode)
- [XS02 — near-clone skills (corpus mode)](#xs02--near-clone-skills-corpus-mode)

## FM01 — frontmatter well-formed

- Contract: `SKILL.md` opens with a YAML frontmatter block carrying `name` and
  `description`; unknown fields draw warnings.
- Common cause: missing `---` fences, tab characters inside the YAML, a misspelled or
  missing required key.
- Fix: repair the YAML syntax, add the missing key, remove (or deliberately keep and
  justify) unknown fields.
- Before → after: `descripton: skill helper` → `description: "Use when …"`.

## FM02 — name discipline

- Contract: `name` is kebab-case (lowercase words joined by hyphens), at most 64
  characters, and equal to the skill's directory name.
- Common cause: renaming the directory without the frontmatter, or vice versa;
  uppercase letters or underscores in the name.
- Fix: pick the correct identity once, then make the field and the directory agree —
  deliberately, never by changing both blindly.
- Before → after: directory `pdf-tools` with `name: PDF_Tools` → `name: pdf-tools`.

## FM04 — trigger-first description

- Contract: the description leads with a trigger phrase (for example `Use when …`) in
  third person, so an agent scanning descriptions knows when to fire the skill.
- Common cause: the description summarizes what the skill does instead of when to use
  it, or speaks in first person.
- Fix: rewrite the description to open with the trigger and keep concrete, searchable
  keywords; move any workflow summary into the body.
- Before → after: `I help you write skills` → `Use when creating a new agent skill …`.

## CT03 — concrete worked example

- Contract: the Examples section shows at least one real input→output pair with
  concrete values; a list of trigger phrases does not count, and a leftover scaffold
  placeholder in Examples also fires this rule.
- Common cause: Examples filled with quoted trigger phrases, or generic prose that
  never shows an actual input and its result.
- Fix: write one end-to-end example — the request that comes in, the action taken,
  the output produced.
- Before → after: `- "use this skill for PDFs"` → `Input: report.pdf … Output: the
  extracted tables as CSV`.

## ST02 — link targets exist

- Contract: every relative link in `SKILL.md` resolves to a file or directory inside
  the skill directory; `../` never appears in a target.
- Common cause: a referenced sibling was renamed or never created; a target path
  escapes the skill directory.
- Fix: create the missing file, correct the path, or drop the link. Keep supporting
  material inside the skill directory.
- Before → after: `[guide](docs/guide.md)` with no `docs/` directory → create
  `docs/guide.md`, or link the file that actually exists.

## PH01 — no placeholder tokens

- Contract: every occurrence of the scaffold placeholder token (`TODO(shakespii)`
  plus a trailing colon) is one finding, across `SKILL.md` and every sibling text
  file.
- Common cause: a scaffold section was skipped during authoring; a stub eval case was
  left untouched.
- Fix: replace each token with real content. Deleting the section that contains it is
  not a fix — that trades a placeholder finding for a missing-section finding.
- Before → after: a section whose only body is the scaffold placeholder line → that
  section written out with real content.

## TR01 — skill ships a valid evals suite

Finding shapes: `skill ships no evals/evals.json`, `evals/evals.json fails
validation (N errors)`, `only N eval case(s)`.

Fix: author `evals/evals.json` at the skill root in the skill-creator shape —
top-level `skill_name` (must equal the frontmatter `name`) and `evals`, an
array of at least three cases, each `{ id (unique integer), prompt,
expected_output, files (optional, paths that exist inside the skill dir),
expectations (non-empty string array) }`. Then run `shakespii test <dir>
--json` for the full diagnostic list (lint caps TR01 at one finding per
skill) and fix findings until exit 0.

## XS01 — duplicate block across skills (corpus mode)

- Contract: no block of 15+ identical non-blank lines appears in two or more skills'
  `SKILL.md` bodies; the finding lists every sharing skill in `sites`.
- Common cause: copy-pasting a shared preamble or checklist between sibling skills.
- Fix: extract the block to one shared reference file and link it from each skill,
  keeping skill-specific deviations inline.
- Before → after: the same seventy-line readiness checklist in five skills → one
  `references/readiness.md` linked five times.

## XS02 — near-clone skills (corpus mode)

- Contract: no cluster of skills whose `SKILL.md` bodies are near-identical
  (line-set similarity at or above the profile threshold).
- Common cause: forking a skill as a template and editing only a few lines.
- Fix: parameterize the shared behavior into one skill whose inputs select the
  variant, or reduce the clones to thin wrappers around one shared reference.
- Before → after: five kickoff clones sharing most of their bodies → one
  parameterized kickoff skill.
