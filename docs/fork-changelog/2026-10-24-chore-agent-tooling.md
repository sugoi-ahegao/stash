# CLAUDE.md, scripts/check, decision records, a fork changelog and agent guard rails

**Merged:** 2026-10-24 · no branch: 2 commits straight onto `main-sugoi-ahegao`, linked here as `bffeb8dfd` · tooling and docs only, nothing in the app changes

_Written on 2026-11-13, after the merge, from git history; the entries convention didn't
exist yet._

Nothing a stash user sees changes. It's here because it set up how the fork is worked on
from then on: the rules in `CLAUDE.md`, the "is this done" check, the decision records and
the fork's own changelog all start here.

## What changed

- **`CLAUDE.md`** (with `AGENTS.md` pointing to it): the fork's rules, its commands, and
  which doc to read for which task.
- **`scripts/check`**: one command for "is this done": regenerate if stale, gofmt, vet,
  golangci-lint, Go tests with the SQLite build tags, each UI check, the fork's migration
  rules and doc references, with a summary.
- **`scripts/doc-refs`**: fails when a `file:line` reference or a link in the fork's docs
  points at nothing or past the end of a file.
- **`scripts/changelog`** and `FORK_CHANGELOG.md`: the fork's changelog, generated from its
  conventional-commit subjects and kept apart from upstream's in-app changelog.
- **`docs/decisions/`**: seven records, 0001 to 0007, for choices already made (the
  migration stream, call sites, custom fields over schema, views apart from plays,
  production on Windows, UI ships restart, the fork changelog).
- **Skills** in `.claude/skills/`: `run-and-verify`, `add-field`, `ship-to-prod`,
  `upstream-sync`.
- **Hooks** in `.claude/hooks/`: `guard-files` refuses edits to generated code and
  upstream migrations; `guard-prod` asks before anything touches production.

## How it works

- The hooks are wired in `.claude/settings.json` and run before an agent's tool calls.
- `scripts/changelog` lists commits not reachable from `upstream/develop`, grouped by day,
  with each upstream merge as one line
  ([decision 0007](../decisions/0007-fork-changelog.md)).
- `docs/codebase/README.md` gained a map from task to doc, mirrored in `CLAUDE.md`.

## Tried and changed

- Nothing reverted shows in history. Two existing docs were found untrue and fixed in the
  same commit (below), which is where "update the docs a change makes untrue" started.
- Follow-ups the same day: `scripts/doc-refs` also checks backticked file paths without a
  line number (`aab3ff771`).
- On 2026-11-13 the changelog gained per-branch entries, this directory
  (`6ee68a5b2`, `d483e9a3b`).

## Watch out

- `FORK_CHANGELOG.md` trails each commit until `scripts/changelog` is run again;
  `scripts/check` warns rather than fails on that.
- The hooks bind agents, not people.

## Follow-ups

- None recorded.

## Docs updated

- `docs/codebase/07-this-fork.md`: it still described opening a scene as recording a play,
  which view history reversed on 2026-09-21; it now describes views.
- `ui/v2.5/src/core/hoverView.ts` (since folded into `Scenes/sceneViews.tsx`): a comment
  pointed at a doc that never existed.
- `docs/codebase/06-recipes-and-gotchas.md`, `docs/codebase/README.md`: small additions.
- `docs/decisions/`: new, as above.

## Commits

- chore: add CLAUDE.md, scripts/check, decision records and agent tooling `bffeb8dfd`
- style(ui): fix lint and formatting in fork code `69822a1dd`
  > Committed with it: an unused displayModeOptions removed, two intended !important
  > overrides marked as such, and biome formatting.

## Footprint

```
24 files changed, 1112 insertions(+), 35 deletions(-)   (bffeb8dfd)
28 files changed, 1121 insertions(+), 44 deletions(-)   (with 69822a1dd)
```
