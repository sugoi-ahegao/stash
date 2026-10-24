# Fork migrations

This fork's schema changes. They are tracked apart from upstream's, in their own table
(`fork_schema_migrations`), and run after upstream's are current. The reason, and the code,
are in `../fork_migrate.go`. The full write-up is `docs/codebase/12-upstream-sync.md`.

## Adding one

1. Create `N_description.up.sql` here, where `N` is the next number: 1, 2, 3, ...
2. Set `forkSchemaVersion` in `pkg/sqlite/fork_migrate.go` to `N`.
3. Run `scripts/upstream-sync check`.

Never add files to `../migrations/` or change `appSchemaVersion`. Those are upstream's.

## Rules

Upstream keeps changing its own tables. A fork migration has to stay correct whatever
upstream does to them later.

- **Only create tables of your own. Never `ALTER` or `DROP` an upstream table.** Upstream
  changes a table by creating `<table>_new`, copying the columns *it knows about* across,
  dropping the original and renaming (see `84_folder_basename.up.sql`). A column the fork
  added to an upstream table would be dropped without warning the next time upstream did
  that. Put the data in a table of your own, keyed by the upstream row's id. For per-entity
  values, custom fields often need no migration at all.
- **Foreign keys into upstream tables are fine.** Upstream turns `foreign_keys` off while it
  rebuilds a table, so `ON DELETE CASCADE` doesn't fire, and the rename leaves the reference
  pointing at the rebuilt table.
- **Write each migration against upstream's schema as it is today, and read as little of
  it as you can.** On a new database, every upstream migration runs before any fork one, so
  a fork migration can meet a newer upstream schema than the one it was written for.
  Selecting a couple of stable columns, as `1_scene_view_history` does, is fine.
- **Migrations are forward-only.** A build with fewer fork migrations than the database has
  refuses to open it (`MismatchedForkSchemaVersionError`). Ship fork migrations from the
  main branch, after testing them in a preview.

`scripts/upstream-sync check` checks the first rule, and that the numbering lines up.
