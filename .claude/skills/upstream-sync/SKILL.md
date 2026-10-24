---
name: upstream-sync
description: Merge upstream stash (stashapp/stash develop) into this fork with scripts/upstream-sync, in its own worktree, resolving conflicts the fork's way. Use when the user asks to sync, merge or update from upstream, or asks how far behind upstream the fork is.
---

# Merge upstream stash into the fork

Full write-up: [`docs/codebase/12-upstream-sync.md`](../../../docs/codebase/12-upstream-sync.md).
Why the rules exist: decisions [0001](../../../docs/decisions/0001-fork-migration-stream.md)
and [0002](../../../docs/decisions/0002-fork-code-at-call-sites.md).

## 1. See what's waiting (read-only)

```bash
scripts/upstream-sync status
```

This shows the upstream commits and migrations waiting, and the upstream files the fork
changes, which is where conflicts will be. Summarise it for the user. Starting a sync
creates a branch and worktree, so confirm before going on unless they already asked for
the merge.

## 2. Start

From the main checkout, with a clean tree:

```bash
scripts/upstream-sync start
```

This creates branch `upstream-sync/<date>` and a worktree under `stash.worktrees/`, runs
`git merge --no-commit upstream/develop` there, and settles the generated files. It stops
if hand-written files conflict. **Do all further work in that worktree.**

## 3. Resolve conflicts

The fork's rules for a conflict:

- **Upstream's code wins, and the fork re-attaches.** Take upstream's version of the
  function, then put back the fork's `// fork` call sites. Never rewrite upstream logic to
  fit fork code. If a hook point disappeared, find the equivalent one and say so in the
  merge summary.
- Generated files are never resolved by hand. `start` and `finish` handle
  `pkg/models/mocks/`, `internal/api/loaders/*_gen.go` and `pkg/stashbox/graphql/`.
- `pkg/sqlite/migrations/` and `appSchemaVersion` are always upstream's. Fork migrations
  stay in `migrations_fork/` with their own numbering.
- `ui/v2.5/src/docs/en/Changelog/` is always upstream's.
- A conflict in fork UI code (`Landing/`, `Scenes/SceneCollectionPanel.tsx`, list-filter
  changes): keep both behaviours. If upstream changed an API the fork uses, adapt the fork
  side.

`git add` each resolved file. If a conflict needs a real design choice, stop and ask.

## 4. Finish

```bash
scripts/upstream-sync finish     # regenerate, check rules, build, go test (unit + integration), commit
```

It commits the merge. The `guard-prod` hook asks first, and the user wanted a sync, so
that's expected. If tests fail, fix them in the worktree. Don't weaken them.

Then run it: `scripts/dev server` and `scripts/dev ui` in the worktree (see the
`run-and-verify` skill). If upstream added a migration, the UI opens on the migrate page;
running it there only touches the worktree's copy.

## 5. Hand back to the user

Report: upstream commits merged, conflicts and how each was resolved, any new upstream
migration, and test results. Leave these to the user unless they ask:

```bash
git merge --ff-only upstream-sync/<date>   # in the main checkout
scripts/prod ship                           # see the ship-to-prod skill
wt rm upstream-sync/<date>                  # stop its servers first
```

After it lands, `scripts/changelog` records the sync in `FORK_CHANGELOG.md`.
