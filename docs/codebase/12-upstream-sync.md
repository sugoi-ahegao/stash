# 12 — Keeping up with upstream

How this fork takes in upstream stash (`stashapp/stash`, branch `develop`) without its own
server and schema changes getting in the way. The goal: merging upstream is routine, the
server side rarely conflicts, and upstream's migrations always run.

```bash
scripts/upstream-sync status    # what's waiting upstream, and where merges can conflict
scripts/upstream-sync start     # merge into a fresh branch + worktree
scripts/upstream-sync finish    # (in that worktree) regenerate, check, build, test, commit
scripts/upstream-sync check     # the fork's migration rules, in any checkout
```

The `upstream` remote points at `https://github.com/stashapp/stash.git`. `origin` is the
fork. The script adds the remote if it's missing.

## Two migration streams

```
  pkg/sqlite/migrations/          upstream's       schema_migrations         appSchemaVersion
     1 … 85, 86, …                                 (one row: the version)    pkg/sqlite/database.go

  pkg/sqlite/migrations_fork/     the fork's       fork_schema_migrations    forkSchemaVersion
     1, 2, …                                                                 pkg/sqlite/fork_migrate.go
```

golang-migrate stores **one version number** per migrations table, and migrates up from
it. That's why the fork's migrations can't share upstream's table, whatever their
numbers. The fork used to number its migrations from 185 in upstream's table, so a
fork-migrated database sat at 185. When upstream added `86_scene_production_date`, that
database would have counted as past 86 and skipped it, with no error. Production would
have started up fine and failed later, on the first query that touched the new column.

So each stream has its own table and its own version:

```
  Database.Open
    ├─ prepareForkMigrations      fork: notes a new database; converts the old 185 numbering
    ├─ upstream schema check      upstream's code, unchanged:
    │     behind  → MigrationNeededError → the UI's migrate page → MigrateJob
    │     ahead   → MismatchedSchemaVersionError
    └─ initialise
          └─ runForkMigrations    fork: back up, migrate fork_schema_migrations to
                                  forkSchemaVersion, restore the backup on failure
```

`initialise` also runs after `MigrateJob` finishes (`ReInitialise`). So fork migrations
always run *after* upstream's schema is current, whichever path got it there.

Upstream's migrator (`migrate.go`, `internal/manager/task/migrate.go`) is byte-for-byte
upstream's again. The fork's whole footprint in upstream's database code is three small
hooks in `database.go`, each marked `// fork`: two calls and one struct field. Everything
else is in `fork_migrate.go`.

| Situation | What happens |
|---|---|
| New database | upstream migrations, then fork migrations. No backup (nothing to back up) |
| Upstream added a migration | stash starts on the migrate page, as stock stash does; click Migrate. Fork version untouched |
| Fork added a migration | runs at startup, after a backup to `stash-go.sqlite.fork<old>.<time>` beside the database. If it fails, the backup is restored and stash doesn't start; the error is in the log |
| Database is at the old 185 numbering | converted at open: upstream set to 85, fork to 1. Nothing else changes |
| Database has fork migrations this build lacks | stash doesn't start (`MismatchedForkSchemaVersionError` in the log) |

### Converting the old numbering

Production, dev and every worktree's library are at 185 until they're opened by a build with
this change. `prepareForkMigrations` converts them in place. It sets the fork version
first, so a crash in between leaves 185 behind and the conversion runs again next time.
Checked against a copy of the dev library: versions became 85 and 1, all 2,040 view
history rows stayed, and after merging upstream it migrated on to 86 cleanly.

⚠️ **Converted databases can't go back to an older build.** A build from before this change
reads version 85 and asks to migrate to 185. That migration fails on the existing
`scenes_viewed_dates` table, and the migrate job restores its backup. Nothing is lost, but
the old build never gets past its migrate page. Ship this change everywhere and don't go
back.

### Rules for fork migrations

They're in `pkg/sqlite/migrations_fork/README.md`. The one that matters: **only create
tables of your own, never alter upstream's.** Upstream rebuilds tables by copying the
columns it knows about into a new table (`84_folder_basename.up.sql`). A column the fork
added would be silently dropped. `scripts/upstream-sync check` enforces this, along with
the numbering. It also checks that nothing was added to upstream's migration directory,
and that `appSchemaVersion` names upstream's last migration.

## Syncing, step by step

```
  main checkout (clean)                     ~/projects/stash.upstream-sync-<date>/
  ─────────────────────                     ──────────────────────────────────────
  scripts/upstream-sync start  ──────────►  branch upstream-sync/<date>, from your branch
                                            git merge --no-commit upstream/develop
                                            generated files settled (below)
                                            stops if hand-written files conflict
                                                │  resolve, git add
                                                ▼
                                            scripts/upstream-sync finish
                                              regenerate mocks · check · build ·
                                              go test (unit + integration) · commit
                                                │
                                                ▼
                                            make server-start + make ui-start
                                              runs on a copy of the dev library. If upstream
                                              added a migration, the UI asks to migrate: do
                                              it, and click around
  git merge --ff-only upstream-sync/<date>  ◄───┘
  scripts/prod ship
  open production: if upstream added a migration, it's on the migrate page; click Migrate
  wt rm upstream-sync/<date>                (stop its server first; deletes the merged branch)
```

The merge never happens in the main checkout, so a half-done sync never blocks other work.
The worktree goes where worktrunk puts its own and gets the same `scripts/worktree setup`
(own ports, own library copy), so `make server-start` runs it and `wt ls`/`wt rm` know it.
The copy is of the **dev** library, taken at `start`. To test against production's data,
run `scripts/prod pull-data` in the main checkout, then `scripts/worktree refresh` in the
sync worktree.

The test step runs the integration suite with the Makefile's SQLite tags
(`sqlite_stat4 sqlite_math_functions`). Without them, sorting tests fail with
`no such function: mod`.

### Generated files

None of these are merged by hand:

| Files | On merge | Why |
|---|---|---|
| `pkg/models/mocks/` | regenerated by `finish` (mockery) | deterministic: upstream's mocks plus the fork's methods |
| `internal/api/loaders/*_gen.go` | upstream's side if they conflict | dataloaden's output for `time.Time` loaders imports `time` twice and won't compile, so the committed files are hand-fixed and can't be regenerated blindly. The fork's loaders are separate files, so only a loader upstream changed can conflict |
| `pkg/stashbox/graphql/` | upstream's copy, always | generated from stashdb.org's *live* schema, so a fork regeneration is churn upstream will overwrite. The fork's own regeneration was reverted for this reason |
| `internal/api/generated_*.go`, `ui/v2.5/src/core/generated-graphql.ts` | not tracked | rebuilt by `make generate` on every build |

## Keeping fork code out of upstream files

A conflict needs both sides to change the same lines. So the fork's server code lives in
files of its own, and upstream files get a call site, marked `// fork`:

```go
	featured := newFeaturedTracker(r) // fork

	if err := r.withTxn(ctx, func(ctx context.Context) error {
		ret, err = featured.sceneUpdate(ctx, input, translator)
		return err
	}); err != nil {
		return nil, err
	}

	featured.generate(ctx) // fork
```

`resolver_mutation_scene.go` used to carry 163 fork lines, mostly from changing
`sceneUpdate`'s signature, which touched every return in it. Now it's 21. The featured
logic is in `scene_featured.go` (`featuredTracker`), and the view-history mutations are in
`resolver_mutation_scene_view.go`.

When you add server features:

- **New behaviour goes in a new file.** Hook it into upstream code with a call, not by
  editing the function body.
- **Don't change the signature of an upstream function.** Wrap it instead (as
  `featuredTracker.sceneUpdate` wraps `sceneUpdate`).
- **Mark each line you add to an upstream file with `// fork`**, so `grep -rn '// fork'`
  lists every hook.
- **Prefer custom fields to schema.** The featured carousel's state is custom fields and
  needs no migration.

`scripts/upstream-sync status` lists the upstream files the fork still modifies. After
these changes, the larger ones are additions to `sqlite/scene.go`, `scene_filter.go`, the
GraphQL schema files and scene import/export. They're small, but they're inside upstream
code.

## The first real sync, rehearsed

Upstream was 44 commits ahead when this was set up (2026-10-24), including migration 86. A
trial merge into a scratch copy of this branch, with all the above in place, went like this:

- **Server: no conflicts.** That includes `database.go` (now 86), the resolver,
  `sqlite/scene.go`, `scene_filter.go` and import/export.
- **UI: one conflict**, an import list in `Scenes/SceneDetails/Scene.tsx`, where keeping
  both sides was correct.
- `finish` passed: mocks regenerated, rules held, build and every test passed.
- Opening a copy of the dev library with the merged build converted it from 185, asked to
  migrate to 86, migrated, and opened. Fork version 1 and all view history were intact.

Nobody has done that merge for real yet: the scratch copy was thrown away.
