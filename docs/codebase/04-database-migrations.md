# 04 — Database & migrations

## Connection model — one writer, ten readers

`pkg/sqlite/database.go:20-27, 239-297`

```
                         ┌──────────────────────────────┐
   read  transactions ──►│  readDB   pool: 10 conns     │──┐
                         └──────────────────────────────┘  │
                                                           ├──► stash-go.sqlite
                         ┌──────────────────────────────┐  │      (WAL mode)
   write transactions ──►│  writeDB  pool: 1 conn       │──┘
                         └──────────────────────────────┘
```

Connection string: `file:<path>?_journal=WAL&_sync=NORMAL&_busy_timeout=50`
(plus `&_cache_size=` from `STASH_SQLITE_CACHE_SIZE` if set). Idle connections are reaped
after `dbConnTimeout` (30 seconds, `database.go:31`).

**`maxWriteConnections = 1` is the most important constraint in the backend.** It is not a
tuning choice — it serialises all writes so SQLite never hits a write-write conflict. The
consequences:

- ⚠️ A long write transaction **blocks every other write in the process**. This is why
  background tasks commit frequently in small batches instead of wrapping a whole scan in
  one transaction.
- ⚠️ Never call a plugin, an HTTP request, or `ffmpeg` from inside a write transaction.
  The transaction is holding the only write connection while you wait on the network.
- ⚠️ Nested `withTxn` inside another `withTxn` on a different goroutine deadlocks. The
  `txn.Manager` guards the common case, but don't invent new concurrency around writes.
- WAL mode means readers are never blocked by the writer, so read concurrency is genuinely
  parallel.

`busy_timeout=50` (milliseconds) is deliberately short — the code prefers to surface a
lock error and let `txn` retry logic handle it over silently stalling.

## Schema shape

Current versions: upstream **`appSchemaVersion = 85`** (`pkg/sqlite/database.go:37`), and
the fork's **`forkSchemaVersion = 1`** (`pkg/sqlite/fork_migrate.go`).

⚠️ **This fork's migrations are a separate stream.** They live in
`pkg/sqlite/migrations_fork/`, numbered from 1, and are recorded in their own table,
`fork_schema_migrations`. They run once upstream's schema is current. Sharing upstream's
table, under any numbering, would make a fork-migrated database skip migrations upstream
adds later. Doc 12 explains why and how it works.

### Core entity tables

```
  scenes  images  galleries  performers  studios  tags  groups  scene_markers
```

### The file/folder abstraction (migration 32 — the big one)

```
   ┌──────────┐   parent_folder_id   ┌──────────┐
   │ folders  │◄─────────────────────│ folders  │   (self-referential tree)
   └────┬─────┘                      └──────────┘
        │ parent_folder_id
        ▼
   ┌──────────┐        ┌────────────────────┐
   │  files   │───1:1──►│ video_files        │   (subtype tables: duration,
   │          │         │ image_files        │    codec, width, height, …)
   └────┬─────┘         └────────────────────┘
        │
        │ 1:N
        ▼
   ┌─────────────────────┐
   │ files_fingerprints  │   type ∈ {oshash, md5, phash}, one row per (file, type)
   └─────────────────────┘
        ▲
        │
   ┌────┴──────────┐
   │ scenes_files  │   join table; one row flagged primary
   │ images_files  │
   │ galleries_files│
   └───────────────┘
```

Why this matters constantly:

- A Scene has **N files**, not a path. `Scene.Path`, `Scene.OSHash`, `Scene.Checksum` are
  transient fields derived from the primary file (`pkg/models/model_scene.go:28-33`) —
  they are **not columns** and cannot be filtered or sorted on directly.
- Filtering by path means joining `scenes_files → files → folders` and comparing
  `folders.path || '/' || files.basename`. That's what `pathCriterionHandler` does.
- Moving a file on disk updates one `files` row; every scene linking to it follows
  automatically. This is the whole point of the abstraction.

### Join tables (M:N)

```
  performers_scenes    performers_images    performers_galleries
  scenes_tags          images_tags          galleries_tags
  performers_tags      studios_tags         groups_tags
  scene_markers_tags   groups_scenes
```

### Self-hierarchies

```
  tags_relations   (parent_id, child_id)      → tag trees
  groups_relations (containing_id, sub_id)    → group nesting
  studios.parent_id                           → studio trees
```

These are what the recursive-CTE filters in doc 03 walk.

### Multi-value scalar tables

Because SQLite has no array type, repeated scalars get their own tables:

```
  scene_urls  performer_urls  studio_urls  group_urls  tag_aliases  performer_aliases
```

### Blobs

`pkg/sqlite/blob.go`. Cover images, sprites and other binaries are content-addressed by
checksum. Storage backend is configurable:

```
  Database filesystem  → blobs table, BLOB column
  Filesystem           → <blobs dir>/xx/yy/<checksum>   (2-level fanout)
```

⚠️ Blobs are **reference-counted by their referring rows**, not by a counter column. The
`Optimise` task is what actually reclaims orphans. Deleting a scene doesn't immediately
free its cover.

### Custom fields

`pkg/sqlite/custom_fields.go` — an EAV table (`scenes_custom_fields`, and per migration 83
`images_custom_fields`) holding arbitrary user-defined key/value pairs per entity.
Values are stored JSON-typed. This is the intended extension point for **per-item metadata
that doesn't warrant a schema change** — the fork on this branch uses it for
`featured_added_at` / `feature_unlocked_at` (doc 07).

Custom fields are loaded through their own dataloader (`CustomFieldsLoader`) and are
filterable via `custom-fields.ts` criteria on the frontend.

`SetCustomFields` takes a `CustomFieldsInput` with three modes, and the choice matters:
`full` **replaces the entire map**, `partial` merges only the listed keys, and `remove`
deletes keys. `full` and `partial` are mutually exclusive (`full` wins); either may be
combined with `remove` in one call, but a key may not appear in both — that's a
validation error, not a silent precedence rule.

## Migrations

```
  pkg/sqlite/migrations/
    ├── 1_initial.up.sql
    ├── ...
    ├── 32_files.up.sql            ← file/folder abstraction
    ├── 32_premigrate.go           ← Go code run BEFORE 32's SQL
    ├── 32_postmigrate.go          ← Go code run AFTER 32's SQL
    ├── 45_blobs.up.sql
    ├── 71_custom_fields.up.sql
    ├── 83_image_custom_fields.up.sql
    ├── 84_folder_basename.up.sql
    └── 85_performer_career_dates.up.sql   ← last upstream migration

  pkg/sqlite/migrations_fork/              ← this fork's, tracked in fork_schema_migrations
    ├── README.md                          ← the rules fork migrations follow
    └── 1_scene_view_history.up.sql
```

Files are embedded with `//go:embed migrations/*.sql` and executed by
`golang-migrate/migrate` through `pkg/sqlite/migrate.go`. The fork's are embedded and run
by `pkg/sqlite/fork_migrate.go`.

### The per-version cycle

```
  for v := current + 1 ; v <= appSchemaVersion ; v++ {

        ┌── premigrate  (optional Go)   e.g. read data that the SQL is about to destroy
        │
        ├── <v>_*.up.sql               the schema change itself
        │
        └── postmigrate (optional Go)  e.g. backfill new columns from data captured above
  }
```

Upstream versions are contiguous, and `RunMigration` insists on `current + 1`.

Fork migrations have no pre/post Go hooks. `runForkMigrations` backs the database up, runs
every pending fork migration with `Migrate(forkSchemaVersion)`, and restores the backup if
one fails.

Pre/post migration Go exists because some transformations are impossible in SQLite SQL —
particularly anything requiring hashing, filesystem access, or parsing.

⚠️ **There are no `.down.sql` files.** Migrations are forward-only. A user who runs a newer
Stash and then downgrades gets a hard error (`database.go:168`), not a rollback. The same
goes for fork migrations (`MismatchedForkSchemaVersionError`). Design
accordingly: a migration must be safe on every real-world database, because it can't be
undone.

⚠️ **SQLite cannot `ALTER TABLE ... DROP COLUMN` on older versions, and can't alter
constraints at all.** The established pattern in this repo for a non-trivial table change
is: create `<table>_new`, copy data across, drop the old, rename. Look at
`32_files.up.sql` for the full-scale version.

### Adding a migration

In this fork, a migration is a **fork migration**. Upstream's directory and
`appSchemaVersion` belong to upstream.

```
 1. Create pkg/sqlite/migrations_fork/2_my_change.up.sql   ← next fork number
 2. Set   forkSchemaVersion = 2   in pkg/sqlite/fork_migrate.go
 3. scripts/upstream-sync check   ← own tables only; numbering lines up
 4. Update the affected store in pkg/sqlite/<entity>.go (columns list, scan targets)
 5. Update pkg/models/model_<entity>.go and the *Partial struct
 6. Update graphql/schema/types/<entity>.graphql, then `make generate-backend`
 7. Test on a COPY of a real database, not just a fresh one — the interesting failures
    are all in data that already exists. A preview gives you one (doc 11).
```

⚠️ **A fork migration must not `ALTER` an upstream table.** Upstream rebuilds tables by
copying the columns it knows about, so a fork column would vanish on upstream's next rebuild.
Add a table of your own instead, keyed by the upstream row's id, or use custom fields.
`pkg/sqlite/migrations_fork/README.md` has the full rules.

Also check whether your change needs to appear in:

- `pkg/sqlite/anonymise.go` — the anonymiser used for bug-report databases. New
  user-identifying text columns should be scrubbed here.
- `pkg/models/jsonschema/` + `internal/manager/task_export.go` / `task_import.go` — the
  JSON export format. New persisted fields usually need to round-trip through export.

⚠️ Forgetting the export/import side is a common miss. It doesn't break the build, and it
doesn't break the UI — it silently loses the field on backup/restore.

## Testing against the database

`pkg/sqlite/setup_test.go` builds a real temporary SQLite database and populates it with a
fixture set before running the store tests. These are integration tests, not unit tests,
and they're the only reliable check on generated SQL.

```bash
make it                      # all unit + integration tests
go test ./pkg/sqlite/...     # just the database layer
```

The filter tests (`scene_test.go`, `performer_test.go`, …) are table-driven with one case
per criterion/modifier combination. When you add a filter, add cases there — including the
`IS_NULL` / `NOT_NULL` pair, which is where join-type bugs surface.
