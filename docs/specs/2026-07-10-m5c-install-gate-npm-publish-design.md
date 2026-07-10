# M5c — Install gate + npm publish (design)

Date: 2026-07-10
Status: approved (user, 2026-07-10)
Milestone: M5c — the full milestone: `shakespii install` gate + CI pipeline + first npm release, shipped together as v0.3.0.

## 0. Adjudications (user, 2026-07-10)

| # | Decision | Choice |
|---|---|---|
| 1 | Scope | Full M5c in one release: the install gate ships inside v0.3.0, not as a follow-up. |
| 2 | Visibility | GitHub repo flips public; package published publicly on npm. (Publishing puts the source in the tarball regardless, so public repo costs nothing extra and enables trusted publishing + provenance.) |
| 3 | Package name | `shakespii` — package name matches the CLI command. The repo keeps its `ai-shakespii` name; `package.json` `repository` points at it. |
| 4 | Release mechanics | Tag-driven CI publish: push tag `v*` → GitHub Actions gates → npm publish. No publishing from the laptop after bootstrap. |
| 5 | Gate bar | Lint **errors block** install; warnings print but never block. If `evals/evals.json` exists, the deterministic test stage must also pass. Cross-skill duplication (XS01/XS02) against the target corpus is advisory-only. |
| 6 | Bundled skills | `shakespii install <name>` resolves skills bundled in the npm package (`using-shakespii`, `authoring-skills`) as well as filesystem paths. |
| 7 | License | MIT. |
| 8 | Providers | Install targets are provider-aware, not Claude-only. Registry ships all six well-known targets: `claude`, `codex`, `cursor`, `antigravity`, `gemini`, `agents` (the tool-agnostic `~/.agents/skills` standard). `claude` stays the default. |
| 9 | ezio | The in-house agent gets a dedicated registry entry now: `ezio` → `~/.ezio/skills`. |

Standing decision honored: distribution was decided 2026-07-07 as "local `bun link` for the MVP; npm publish graduates at M5c" (M2 spec, ROADMAP open-decisions table). This milestone is that graduation.

## 1. Package shape (v0.3.0)

No build step. Bun executes TypeScript source directly; the published package ships `src/` as-is with the existing `#!/usr/bin/env bun` shebang. This preserves the frozen harness verbatim (`Bun.spawn`/`Bun.sleep` stay) and keeps `packageRoot` resolution (`src/cli/paths.ts`: `new URL('../../', import.meta.url)`) valid because the tarball layout equals the repo layout.

`package.json` changes:

- `name`: `shakespii` (verified free on npm 2026-07-10; no source or test references the old name — rename touches `package.json` only)
- `version`: `0.3.0` (bumped in the release commit, step 5 of §5)
- `license`: `MIT`
- `description`, `keywords`, `repository` / `bugs` / `homepage` → `github.com/vuphanse/ai-shakespii`
- `engines`: `{ "bun": ">=1.3.0" }` — documentation of the runtime requirement (npm does not enforce a `bun` engine; the README states it plainly)
- `files`: `["src", "templates", "profiles", "skills", "README.md", "LICENSE"]` — whitelist. `templates/` (init scaffold), `profiles/` (default lint profile, loaded via `packageRoot`), and `skills/` (bundled companion skills, §2 resolution + their evals/fixtures) are all runtime-required. Excluded: `tests/`, `docs/`, `scripts/`, `.superpowers/`, `CLAUDE.md`, `bun.lock`.
- `bin` unchanged: `{ "shakespii": "src/cli/index.ts" }`

New root files: `LICENSE` (MIT, "Copyright (c) 2026 Vu Phan"). README refresh: install section (`bun add -g shakespii`, note that `npm i -g shakespii` also works when Bun is on PATH), quickstart (init → lint → test → install), bundled-skill onboarding (`shakespii install using-shakespii`), CI + npm version badges.

Consumers install with `bun add -g shakespii` or `npm i -g shakespii`; either way the shebang resolves `bun` from PATH at run time.

## 2. `shakespii install` — the gate

```
shakespii install <path-or-name> [--provider <name>]... [--target <dir>] [--force] [--json]
```

New CLI surface; the lint / test / bench surfaces are untouched.

### 2.0 Provider registry

Skills produced by this tool are standard Agent Skills (non-negotiable decision 1), so one artifact installs into any compliant tool — only the destination differs. The registry maps provider name → user-level skills directory (resolved against the home directory at call time, so tests can redirect via a temp `HOME`):

| Provider | Root (detection) | Skills dir |
|---|---|---|
| `claude` | `~/.claude` | `~/.claude/skills` |
| `codex` | `~/.codex` | `~/.codex/skills` |
| `cursor` | `~/.cursor` | `~/.cursor/skills` |
| `antigravity` | `~/.gemini` | `~/.gemini/config/skills` |
| `gemini` | `~/.gemini` | `~/.gemini/skills` |
| `agents` | `~/.agents` | `~/.agents/skills` |
| `ezio` | `~/.ezio` | `~/.ezio/skills` |

Sources for the third-party paths: Cursor docs (cursor.com/docs/skills), the Codex skills ecosystem docs, and the Antigravity/Gemini skills-location guide; `codex` additionally verified on this machine (`~/.codex/skills` exists). The implementer re-verifies each path against current provider docs at build time. Two operational notes: Cursor also reads `~/.claude/skills` and `~/.codex/skills` directly, so a `claude` install already covers Cursor; `antigravity` and `gemini` share the `~/.gemini` root but use different skills dirs.

Target selection:

- `--provider <name>`, repeatable — install into each named provider's skills dir. Unknown name → exit 2 listing the registry.
- `--provider all` — every provider whose root directory exists on the machine ("detected"). Detection is deliberately loose for the shared `~/.gemini` root; explicit `--provider` works regardless of detection.
- `--target <dir>` — raw directory escape hatch (e.g. a project-level `.claude/skills`, or a stopgap for an unregistered tool). Mutually exclusive with `--provider` (exit 2 if both).
- Default when neither flag is given: `claude`.

### 2.1 Source resolution

1. If the argument resolves to an existing directory (relative or absolute), it is a **path install**. Path takes precedence over name on collision.
2. Else, if `<packageRoot>/skills/<arg>/SKILL.md` exists, it is a **bundled install**.
3. Else: exit 2 with a message naming both resolution attempts.

### 2.2 Gate sequence (read-only until pass)

The source gate (steps 1–2) runs **once per invocation**; step 3 runs **per target**.

1. **Lint** the source skill standalone with the same profile-resolution semantics as `shakespii lint <path>`. Any `error`-severity finding blocks all targets (exit 1). Warnings are reported but never block.
2. **Deterministic test stage**, only if `evals/evals.json` exists: schema validation, cross-document checks, fixture resolution — the tokenless stage of `shakespii test`. Any failure blocks all targets (exit 1). No LLM stage ever runs during install.
3. **Corpus advisory**, per target: assemble the corpus context as that target directory's existing skills plus the candidate (in memory, via the pure lib — rules never touch disk, so no staging copy is needed) and run the cross-skill rules. XS findings involving the candidate are reported as advisory; they never block. If a target directory is missing or has no skills, the advisory step is skipped for that target and the report says so.

### 2.3 Install action (per target)

- Destination: `<skills-dir>/<name>/` where `<name>` is the frontmatter `name` field (guaranteed present once lint passes), not the source directory basename. Skills directories are created with `mkdir -p` semantics if absent (installing to an explicitly named provider that has no skills dir yet — e.g. cursor today — is correct behavior, not an error).
- Copy: full recursive copy of the source skill directory (SKILL.md, references, evals, fixtures — the skill directory is the unit).
- Occupied destination (directory, file, or **symlink** — detected with `lstat`, never followed): that target is refused without `--force` (message says what occupies the slot). With `--force`: stage the copy in a temp sibling inside the target, remove the old entry (a symlink is removed as a link; its referent is never touched), rename the staged copy into place. The staged-then-swap order guarantees a completed copy exists before anything is removed.
- Multi-target outcomes are independent: one occupied target does not stop the others. The exit code aggregates: `0` only when every requested target installed; `1` when the source gate blocked or any target was refused; re-running with `--force` is idempotent.

### 2.4 Report contract

`--json` emits a new versioned install report (INSTALL_REPORT `"version": 1`), pure stdout, pinned key order, following the lint `--json` conventions:

```json
{
  "version": 1,
  "skill": "<frontmatter name, or null when lint could not parse it>",
  "source": { "kind": "path" | "bundled", "path": "<absolute source dir>" },
  "gate": {
    "lint": { "status": "pass" | "fail", "errors": 0, "warnings": 0, "findings": [] },
    "test": { "status": "pass" | "fail" | "skipped", "failures": [] }
  },
  "targets": [
    {
      "provider": "claude",
      "path": "<absolute destination dir>",
      "advisory": [],
      "installed": true,
      "forced": false,
      "reason": null
    }
  ]
}
```

`targets` has one entry per requested target, in request order; `provider` is `null` for a raw `--target` install; `reason` is `null` when installed, else a short block reason (e.g. `"occupied: symlink"`, `"gate: lint errors"`). Finding objects inside `gate.lint.findings` and each target's `advisory` reuse the lint `--json` v1 finding shape verbatim (same serializer); `gate.test.failures` reuses the deterministic-stage failure shape from `shakespii test --json`. The install report is a thin envelope over existing serializers, not a new schema for findings.

Human (non-`--json`) output mirrors the lint output style: gate results per step, then one action line per target (`installed <name> → <path>`, or the block reason).

Exit codes, matching lint conventions: `0` gate passed and every target installed; `1` gate blocked, or any destination occupied without `--force`; `2` usage error (unresolvable source, unknown provider, `--provider` with `--target`, bad flags).

### 2.5 Implementation shape

Gate decision (findings + test result + destination state → verdict) is a pure function in `src/lib`; all I/O (resolution, copy, swap) lives in `src/cli/install.ts`. TDD with fixture skills and temp target directories.

### 2.6 Companion-skill update: using-shakespii v0.7.0

Per the agent-first interface decision (2026-07-07), every CLI capability is taught by the companion skill. using-shakespii gets a body-only update teaching the install loop: when to use `shakespii install` (gate semantics, what blocks vs. advises), provider selection (`--provider`, the registry, `all`, the `--target` escape hatch), `--force` over an occupied slot, bundled-name onboarding, and reading the INSTALL_REPORT. The **description does not change** — it stays frozen at the M5b-measured wording (trigger accuracy 0.80–0.95 band), so no live trigger re-measurement is needed. Version bumps to 0.7.0; the weld-test re-pins for the version string are sanctioned.

## 3. CI workflow — `.github/workflows/ci.yml`

Triggers: push to `master`, pull requests. Single job on `ubuntu-latest`:

1. checkout; `oven-sh/setup-bun` pinned to the local family (bun 1.3.x; local is 1.3.14)
2. `bun install --frozen-lockfile`
3. `bun run typecheck`
4. `bun test` (hermetic — no test spawns a real `claude`; CI carries no API key)
5. Self-dogfood gates: `bun src/cli/index.ts lint skills/using-shakespii --json` and `... lint skills/authoring-skills --json` must exit 0; `bun src/cli/index.ts test skills/using-shakespii` and `... test skills/authoring-skills` (deterministic stage) must exit 0
6. Tarball sanity: `npm pack --dry-run --json` checked by `scripts/check-pack.ts` — asserts presence of `src/cli/index.ts`, `templates/skill/*`, `profiles/default.yaml`, both bundled `SKILL.md`s, `LICENSE`; asserts absence of `tests/`, `docs/`, `.superpowers/`

macOS-vs-Linux portability of the suite is verified by the first CI run (temp-dir handling already goes through `os.tmpdir()`).

## 4. Release workflow — `.github/workflows/release.yml`

Trigger: push of tag `v*`. Permissions: `contents: read`, `id-token: write`.

1. Same gates as CI (steps 1–6 above)
2. Version guard: tag `vX.Y.Z` must equal `package.json` `version`, else fail before publish
3. Publish: **target state is npm trusted publishing** (OIDC) with provenance — no long-lived token secret. Known bootstrap wrinkle: npm may require a package to exist before a trusted publisher can be configured for it. The implementer verifies current npm docs at build time; if first-time publish via OIDC is unsupported, the bootstrap release publishes with a granular automation token in an `NPM_TOKEN` repo secret, and the workflow flips to trusted publishing immediately after v0.3.0 exists. Which path was used gets recorded in the M5c closeout notes. Provenance is attempted once the repo is public; if any provenance requirement is unmet at bootstrap, publish without it and enable on the next release.

## 5. Order of operations (runbook)

1. `LICENSE` + `package.json` metadata (name/license/repository/engines/files — everything except the version bump) + README refresh — commit
2. Install gate, TDD (the bulk of the milestone) — commits per the implementation plan
3. Workflows (`ci.yml`, `release.yml`) + `scripts/check-pack.ts` — commit; verify CI green on push
4. Flip repo public: `gh repo edit vuphanse/ai-shakespii --visibility public` (adjudication 2; note: this publishes the full git history — calibration docs, specs, audit references to personal skill names; user reviewed and accepted)
5. Configure npm auth (trusted publisher or bootstrap token per §4), bump version 0.2.0 → 0.3.0, tag `v0.3.0`, push tag → CI publishes
6. User onboarding (the dogfood start): `bun add -g shakespii`; `shakespii install using-shakespii --force` (replaces the current repo symlink in `~/.claude/skills` with the published copy); `shakespii install authoring-skills`; optionally fan out to other tools, e.g. `shakespii install authoring-skills --provider codex` or `--provider all`

## 6. Testing strategy

Fixture-driven, TDD. **Tests never touch the real `~/.claude/skills`** — every install test passes an explicit temp `--target`. The read-only-corpus constraint holds; the only writes to the live corpus are the user's own install commands (step 6 of §5).

Required coverage:

- using-shakespii v0.7.0 weld tests: version re-pin, install-loop section present, description byte-unchanged from the measured wording
- clean skill → installed, exit 0, report `installed: true`
- skill with a lint error → blocked, exit 1, nothing written
- skill with warnings only → installed, warnings in report
- skill with `evals/evals.json` failing the deterministic stage → blocked, exit 1
- skill without `evals/` → `gate.test.status: "skipped"`, installable
- bundled-name resolution (both bundled skills); unresolvable arg → exit 2; path-over-name precedence
- occupied destination: directory without `--force` → exit 1; symlink without `--force` → exit 1; `--force` over directory and over symlink → replaced, referent untouched
- provider registry: each name resolves to its documented skills dir under an injected temp `HOME`; unknown provider → exit 2; `--provider` repeated → both targets; `--provider all` under a temp `HOME` with a subset of roots → only detected providers; `--provider` + `--target` together → exit 2
- multi-target partial outcome: two temp providers, one occupied → occupied target blocked with reason, other installed, exit 1
- corpus advisory: duplicate-heavy candidate against a populated temp corpus → advisory findings present, install still proceeds; empty target → advisory skipped
- `--json` byte-shape pin (key order, INSTALL_REPORT version 1); exit-code triple
- gate decision pure-function unit tests (lib)
- `scripts/check-pack.ts` inclusion/exclusion assertions (exercised locally and in CI)

## 7. Frozen surfaces (unchanged by this milestone)

Lint CLI + JSON v1; flagless `test` byte-identical; bench schema and stdout purity; grading contract; trigger report key orders; `HARNESS_SCHEMA_VERSION = 1`; `RUN_CACHE_VERSION = 2`; all harness constants; no harness code changes. `shakespii install` and its INSTALL_REPORT v1 are a new surface, frozen from v0.3.0 onward under the same discipline.

## 8. Acceptance criteria

1. `bun test` and `bun run typecheck` green at every commit; new install coverage from §6 present
2. CI workflow green on `master`
3. Repo public; `LICENSE` present
4. Tag `v0.3.0` push produces a successful npm publish of `shakespii@0.3.0`; `npm view shakespii version` returns `0.3.0`
5. On the user's machine: `bun add -g shakespii` succeeds; `shakespii install using-shakespii --force` and `shakespii install authoring-skills` both gate-pass and land copies in `~/.claude/skills/`; at least one non-claude provider install verified live (e.g. `--provider codex` → `~/.codex/skills/`); the installed using-shakespii is v0.7.0 (teaches the install loop, §2.6); the installed CLI runs `lint` / `test` / `init` from the published package (templates + profile resolve from the tarball layout)
6. ROADMAP M5c section checked off with commit hashes; closeout notes record the publish-auth path used (§4)

## 9. Out of scope

- **Workspace-escape mitigations** (CALIBRATION-M5B adjudication 7 recorded these as M5c candidates; parked here with user visibility at spec review): jailing/sandboxing executor writes, and extending the contamination scan to flag out-of-workspace Write/Bash mutations. Neither affects `shakespii install` (the gate runs no LLM stage) or CI (no live sessions). Revisit condition: before the M5d migration's live sweeps, or a dedicated hardening milestone. Until then the HARNESS.md operational rule stands: clean tree before sweeps, check `git status` + both doc roots after.
- M5d personal-skill migration (uses this gate later)
- Node-runtime support (porting `Bun.spawn`/`Bun.sleep` off Bun) — revisit only on real demand
- Release automation bots (release-please/changesets)
- Private registry / scoped-package variants
- ai-cortex promotion path (deferred post-dogfood, M5b §0)

## 10. Documentation deliverables

- This spec (repo `docs/specs/` mirror + canonical copy under `~/.ai-pref-nsync/local-docs/ai-shakespii/specs/`)
- README refresh (§1)
- ROADMAP M5c closeout at milestone end
- M5c closeout notes: publish-auth path, first-CI-run observations, any portability fixes
