# Database migrations

Schema evolution for a database that lives on the user's machine and can never be
reset. This constrains what you're allowed to do more than it constrains how you do it.

Key files: [`pkg/sqlite/migrate.go`](../../pkg/sqlite/migrate.go),
[`pkg/sqlite/migrations/`](../../pkg/sqlite/migrations/),
[`pkg/sqlite/custom_migrations.go`](../../pkg/sqlite/custom_migrations.go).

## The model

Two numbers must agree:

- `appSchemaVersion` in [`pkg/sqlite/database.go`](../../pkg/sqlite/database.go) — what
  this build of the binary expects.
- The user's database schema version, tracked by `golang-migrate` in a table inside the
  database itself.

On `Database.Open`:

| Condition | Behaviour |
|---|---|
| db version == 0 | Brand new — run every migration, then `Optimise()` |
| db version > app version | `MismatchedSchemaVersionError` — a newer Stash wrote this DB; refuse |
| db version < app version | `MigrationNeededError` — **don't open connections**, let the UI offer to migrate |
| equal | Open normally |

The migration-needed case is a warning at startup, not a fatal error
([`internal/manager/init.go`](../../internal/manager/init.go)). The server runs with no
database, `db.Ready()` returns `ErrDatabaseNotInitialized`, and the frontend shows the
migration screen. The user triggers the migration through
[`resolver_mutation_migrate.go`](../../internal/api/resolver_mutation_migrate.go).

## Writing one

```
pkg/sqlite/migrations/{n}_short_description.up.sql
```

where `{n}` is one greater than the highest existing file. Then bump `appSchemaVersion`
to the same `{n}`. Those two must match or the app will loop asking to migrate.

Migrations are embedded:

```go
//go:embed migrations/*.sql
var migrationsBox embed.FS
```

`RunAllMigrations` steps one version at a time rather than jumping to the target, so that
custom Go migrations get a chance to run between SQL steps:

```go
for i := 1; i <= stepNumber; i++ {
    newVersion := databaseSchemaVersion + i
    if err := m.RunMigration(ctx, newVersion); err != nil { return err }
}
```

### The rule that matters most

**A released migration is never edited.** Users have already run it; their schema version
already records it as applied, so an edit will never execute on their database. Editing
one produces a fleet of databases whose actual schema doesn't match what the file says.

To fix a bad migration, write a new one that corrects the state. If the bad migration is
unreleased (still only on `develop` and not in any tagged build), amending it is fine —
but be sure.

There are no `.down.sql` files. Migrations are one-way. The safety net is the automatic
database backup taken before migrating, not a rollback path.

## Custom migrations

Some transformations SQL can't express — parsing a string column, reading files off disk,
rewriting the config file. Those go in Go:

```
pkg/sqlite/migrations/{n}_premigrate.go     runs BEFORE the SQL
pkg/sqlite/migrations/{n}_postmigrate.go    runs AFTER the SQL
```

Registered from an `init()` function:

```go
func init() {
    sqlite.RegisterPostMigration(45, post45)
}
```

The registry is a package-level map in
[`custom_migrations.go`](../../pkg/sqlite/custom_migrations.go), populated by the blank
import in [`internal/manager/manager.go`](../../internal/manager/manager.go):

```go
// register custom migrations
_ "github.com/stashapp/stash/pkg/sqlite/migrations"
```

**If that import is removed, custom migrations silently stop running.** Nothing fails
loudly; the SQL migrations still apply and the version still advances.

Execution order per version: pre-migrations → the `.up.sql` → post-migrations → version
recorded.

### Writing a custom migration

They receive a raw `*sqlx.DB`, not the store layer:

```go
type customMigrationFunc func(ctx context.Context, db *sqlx.DB) error
```

That's deliberate — the store layer targets the *current* schema, which by definition
doesn't match the schema mid-migration. **Never call `pkg/sqlite` stores from a
migration.** Write raw SQL against the schema as it exists at that version.

The `migrator` helper in
[`custom_migration.go`](../../pkg/sqlite/migrations/custom_migration.go) provides
`withTxn` and `execAll` for this. Note it uses its own transaction handling, not
`pkg/txn` — again because that's tied to the current schema.

Large data migrations should batch. `32_postmigrate.go` (the file/folder rework) and
`45_postmigrate.go` (blobs) are the reference examples for a migration touching every row.

### Foreign keys are off

`NewMigrator` opens its connection with `disableForeignKeys = true`. This is what makes
the standard SQLite table-rebuild dance possible:

```sql
CREATE TABLE new_x (...);
INSERT INTO new_x SELECT ... FROM x;
DROP TABLE x;
ALTER TABLE new_x RENAME TO x;
```

The flip side: nothing checks referential integrity during a migration. A migration that
leaves dangling references will fail later, at runtime, in a place that looks unrelated.

## After migrating

`PostMigrate` runs `ANALYZE` and flushes the WAL. It deliberately does **not** `VACUUM`:

```go
// don't use Optimize/vacuum as this adds a significant amount of time
// to the migration
```

`ANALYZE` matters because the build uses the `sqlite_stat4` tag — the query planner relies
on those statistics, and stale ones after a large schema change produce bad plans.

A fresh database (version 0) does get a full `Optimise()` in `Database.Open`, since
there's no data to make it slow.

## Testing

There's no migration test harness. Practical approach:

1. Copy a real database with the previous schema version.
2. Point a dev build at it (`make server-start` uses `./.local`).
3. Migrate through the UI, confirm the data is right.
4. Test the *upgrade path from several versions back*, not just from `n-1` — users skip
   releases, and pre/post migrations interleaving across several versions is where bugs
   hide.

For a migration with meaningful logic, a unit test on the extracted transformation
function (independent of the database) is worth writing even though the migration itself
isn't covered.

## Checklist

- [ ] `{n}_description.up.sql` where `{n}` = highest + 1
- [ ] `appSchemaVersion` bumped to `{n}`
- [ ] Pre/post Go migration registered via `init()` if needed
- [ ] Raw SQL only in custom migrations — no store-layer calls
- [ ] Tested from at least two prior versions with real data
- [ ] Existing migrations untouched
