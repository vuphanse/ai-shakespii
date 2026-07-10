# M5c release notes — v0.3.0

Date: 2026-07-10
Status: **published.** `shakespii@0.3.0` is live on npm (token bootstrap path, release run green on the re-fired tag at 271220c) and the onboarding verification passed end to end on the development machine — see "Publish execution" below. The resume runbook that follows is preserved as the historical record of the credential escalation; steps 1–5 are executed, step 6 (switch to trusted publishing) and step 7 are done or folded into the roadmap.

## Resume runbook (one-time setup, then one command)

1. Create a granular automation token on npmjs.com (packages-and-scopes: read/write, or at minimum publish rights for new package `shakespii`).
2. `gh secret set NPM_TOKEN` (paste the token).
3. `git tag v0.3.0 && git push origin v0.3.0` — this fires `.github/workflows/release.yml`: full gates → version guard → `npm publish --access public`.
4. Verify: the run goes green (`gh run watch`), then `npm view shakespii version` → `0.3.0`.
5. Onboarding verification (spec §8 acceptance 5, deferred here because it needs the published package):
   ```bash
   bun add -g shakespii
   shakespii --version                          # → 0.3.0
   shakespii install using-shakespii --force    # replaces the repo symlink with the published copy
   shakespii install authoring-skills
   shakespii install authoring-skills --provider codex
   shakespii lint ~/.claude/skills/using-shakespii   # exits 0 from the installed copy
   ```
6. After the first publish exists: configure a GitHub Actions trusted publisher for `shakespii` on npmjs.com (repository `vuphanse/ai-shakespii`, workflow `release.yml`), then the `NODE_AUTH_TOKEN` env line in the Publish step can be removed and the token revoked — OIDC takes over for every later release.
7. Check off the ROADMAP M5c publish item.

## Publish execution (2026-07-10, post-escalation)

- Operator set the `NPM_TOKEN` granular automation secret; controller fired `git tag v0.3.0 && git push origin v0.3.0`.
- **Release run 1 (tag at 59c6740): failure.** The workflow's `npm install -g npm@latest` step corrupted the hosted runner's own npm tree — `libnpmpublish` could no longer resolve its `sigstore` dependency, and since `publish.js` requires `provenance.js` unconditionally, every publish died with `MODULE_NOT_FOUND` regardless of provenance settings. Tag rolled back cleanly (nothing published), upgrade step removed with an inline comment pointing the future OIDC migration at a newer bundled-npm node version instead of self-upgrading in place (271220c).
- **Release run 2 (tag at 271220c): success.** Gates → version guard → `npm publish --access public` with `NODE_AUTH_TOKEN`; `npm view shakespii version` → `0.3.0`.
- **Onboarding verification (spec §8 acceptance 5): all green.** `bun add -g shakespii` resolves the published package (`~/.bun/bin/shakespii` → `install/global/node_modules/shakespii/src/cli/index.ts`); `shakespii --version` → 0.3.0; `shakespii install using-shakespii --force` gate-passed (lint 0/0, deterministic pass, advisory `[]` = ran clean against the live corpus) and replaced the dev symlink with the published copy, now `version: 0.7.0` in `~/.claude/skills`; `shakespii install authoring-skills` landed in `~/.claude/skills`; `shakespii install authoring-skills --provider codex` landed in `~/.codex/skills`; `shakespii lint ~/.claude/skills/using-shakespii` exited 0 from the installed CLI — templates and profile resolve from the tarball layout.
- Follow-up now unlocked: configure the GitHub Actions trusted publisher for `shakespii` on npmjs.com and revoke the bootstrap token; the `NODE_AUTH_TOKEN` env line comes out at the same time.

## Publish-auth path (spec §4 record)

- Preflight on the development machine (2026-07-10): no `NPM_TOKEN` repo secret, `npm whoami` not logged in, no `//registry.npmjs.org/:_authToken` in npm config — paths (a) and (b) of the plan's autonomous preflight unavailable.
- Task 8's documentation check (docs.npmjs.com/trusted-publishers) established that a trusted publisher can only be configured on an **existing** package — npm has no PyPI-style pending publisher for unpublished names. A preconfigured-OIDC first publish is therefore impossible, and the plan's blind-OIDC attempt (path c) was skipped as known-futile rather than burning a tag cycle.
- Terminal escalation (path d) taken: release staged (version bump + `NODE_AUTH_TOKEN` env line, commit d853873), tag withheld, this runbook written.

## First-CI-run observations (spec §10 record)

- Run 1 (commit fa7650b): **failure.** GitHub Actions sets `CI=true`, which flips picocolors into color mode inside the test process; four formatter byte-pin tests (test-pretty frozen-surface pins among them) received ANSI-decorated output that local runs never produce. Reproduced locally with `CI=true bun test` (same failures) and verified green with `CI=true NO_COLOR=1`.
- Fix (commit 1a23420): `NO_COLOR: "1"` pinned at job level in both `ci.yml` and `release.yml` (gate-mirror preserved). The suite's contract is uncolored output.
- Run 2 (commit 1a23420): **success.** No other Linux-vs-macOS portability issue surfaced — 530/530 tests, typecheck, self-lint, deterministic eval checks, and the tarball guard (`pack ok: 100 files`) all passed on ubuntu-latest.

## Patch-release backlog (final whole-branch review, all accept-for-now)

None of these touch INSTALL_REPORT v1 or any frozen surface; suggested for 0.3.1 or alongside M5d:

1. Stale-staging sweep: remove `.<name>.shakespii-staging-*` for any pid before staging, and/or skip `.shakespii-staging-` basenames in discovery — a crash-orphaned staging dir currently pollutes later XS advisories and corpus lint.
2. Stage the fresh-install path too (currently only the `--force` swap stages first).
3. Wrap `runCorpusRules` inside `advisoryFor`'s try/catch (advisory is best-effort by contract).
4. Rename-aside swap (dest → `.old`, staged → dest, rm `.old`) to shrink the non-atomic removal window.
5. Positive path-over-bundled precedence test (behavior verified live in review; untested in suite).
6. `--target ~` bare-tilde expansion; skip-note wording on occupied/write-failed targets; dead `claude === null` branch → throw; version guard `node -p` → `bun -p`.

## Deviation from the plan's Task 9 sequence

Step 6 (onboarding verification) could not run pre-publish and moved into the resume runbook above. Step 4 resolved to escalation path (d) with path (c) skipped on Task 8's evidence — disclosed here rather than silently reordered.
