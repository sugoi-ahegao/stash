# 0001 — Fork migrations are a stream of their own

Date: 2026-10-24 · Status: accepted

## Context

golang-migrate stores one version number per migrations table and migrates up from it. The
fork first numbered its migrations from 185 in upstream's table. A fork-migrated database
then sat at 185, so when upstream added `86_scene_production_date` it counted as already
applied and was skipped with no error. Production would have started fine and failed on
the first query that touched the new column.

## Decision

Fork migrations live in `pkg/sqlite/migrations_fork/`, numbered from 1, tracked in their
own table (`fork_schema_migrations`, version `forkSchemaVersion`), and run after
upstream's schema is current, with a backup that's restored on failure. Upstream's
migrator stays byte-for-byte upstream's; the fork's footprint in `database.go` is three
`// fork` lines.

Fork migrations only create tables of their own. They never `ALTER` or `DROP` an upstream
table, because upstream rebuilds tables by copying the columns *it* knows about, and a
fork column would be silently dropped.

## Consequences

- Upstream migrations always run, whatever the fork has added.
- Per-entity fork data goes in fork-owned tables keyed by the upstream id, or in custom
  fields ([0003](0003-custom-fields-over-schema.md)).
- Converted databases can't go back to a build from before this change.
- Enforced by `scripts/upstream-sync check` (also run by `scripts/check`), and the agent
  hook in `.claude/hooks/guard-files` refuses edits to `pkg/sqlite/migrations/`.
- Full write-up: [`docs/codebase/12-upstream-sync.md`](../codebase/12-upstream-sync.md),
  rules: [`pkg/sqlite/migrations_fork/README.md`](../../pkg/sqlite/migrations_fork/README.md).
