---
name: ship-to-prod
description: Ship this checkout to the production stash (Windows stash.exe on :9999) with scripts/prod. Use only when the user asks to ship, deploy, release or update production, or to check what production is running.
---

# Ship to production

Production is the library actually in use. Shipping restarts it, and a migration in it
can't be undone. **Only ship when the user asked to in this conversation.** The
`guard-prod` hook asks them again before the command runs.

Background: [`docs/codebase/11-production-and-dev.md`](../../../docs/codebase/11-production-and-dev.md).

## Before

1. `scripts/prod status`: what production runs, and how far this checkout differs. It's
   read-only, so run it freely.
2. `scripts/check`. Don't ship a red check. If it fails, report the failures and stop.
3. Look at what's being shipped. `ship` sends **this checkout as it is, uncommitted
   changes included**. If there are uncommitted changes, tell the user and ask whether
   that's intended.
4. **Migrations.** Compare `pkg/sqlite/migrations_fork/` and `forkSchemaVersion` with
   what production has, and check whether an upstream sync brought new files to
   `pkg/sqlite/migrations/`. If either changed:
   - Ship only from the main branch (`main-sugoi-ahegao`), never from an experiment or
     worktree branch. An older build refuses a newer schema, so shipping a migration and
     then a branch without it leaves production unable to start.
   - The migration should already have run on a worktree's copy of the library.
   - Tell the user before shipping. An upstream migration stops production on the
     migrate page until they click Migrate. A fork migration runs at startup after a
     backup.

## Ship

```bash
scripts/prod ship          # picks UI-only (~25 s) or full (~3 min) from what changed
scripts/prod ship --ui     # force UI-only
scripts/prod ship --full   # force a rebuild of stash.exe
```

Both paths restart `stash.exe`. Don't skip the restart: a UI-only ship without one serves
a blank page ([decision 0006](../../../docs/decisions/0006-ui-ship-restarts.md)).

## After

- `scripts/prod status` should show the shipped commit.
- `scripts/prod logs` if it doesn't come up. A fork migration failure restores its backup
  and leaves the error there.
- Tell the user what shipped (commit, UI-only or full) and whether a migrate step is
  waiting for them.

## Never

- `scripts/prod setup` (one-time; refuses if a library exists) or `pull-data` (replaces
  the dev library) unless asked for by name.
- Edit, copy into, or delete anything under `/mnt/c/Users/*/.stash` by hand.
- Kill `stash.exe` directly. Use `scripts/prod stop` / `start`.
