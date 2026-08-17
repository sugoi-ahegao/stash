# The data layer

`pkg/models` defines the contracts, `pkg/sqlite` is the only implementation. This document
covers how they fit together, the two incompatible query styles, and the relationship
loading machinery.

The filter/criterion system is complex enough to have [its own
document](query-filter-system.md).

## Layering

```
resolver                  internal/api
   │  models.Repository (interfaces)
   ▼
service / validation      pkg/scene, pkg/gallery, pkg/image, pkg/group
   │                      pkg/performer, pkg/studio, pkg/tag
   ▼
repository interface      pkg/models/repository_*.go
   ▼
store implementation      pkg/sqlite/*.go
   ▼
SQLite
```

`models.Repository` is a plain struct of interfaces, assembled by
`Database.Repository()` in [`pkg/sqlite/transaction.go`](../../pkg/sqlite/transaction.go):

```go
type Repository struct {
    TxnManager TxnManager
    Scene      SceneReaderWriter
    Image      ImageReaderWriter
    Tag        TagReaderWriter
    // ...
}
```

Each entity has `Reader`, `Writer`, and `ReaderWriter` interfaces in
`pkg/models/repository_<entity>.go`. Mocks for these are generated into
`pkg/models/mocks/` by `make generate-test-mocks` — [`.mockery.yml`](../../.mockery.yml)
matches `.*ReaderWriter` in `pkg/models`.

Anything you add to a `*ReaderWriter` interface needs a mock regeneration, or the mocks
stop satisfying the interface and unrelated tests fail to compile.

## Transactions live in the context

This is the single most important thing to internalise about this codebase.

```go
// pkg/sqlite/tx.go
func (*dbWrapperType) Get(ctx context.Context, dest interface{}, query string, args ...) error {
    tx, err := getDBReader(ctx)   // ← pulls *sqlx.Tx out of ctx
    if err != nil {
        return sqlError(err, query, args...)
    }
    ...
}
```

`Database.Begin` stores the transaction under a private context key:

```go
ctx = context.WithValue(ctx, writableKey, writable)
return context.WithValue(ctx, txnKey, tx), nil
```

Every store method takes `ctx` and pulls the transaction from it. **Stores never open
their own transaction.** The caller — always a resolver, task, or service — establishes it:

```go
err := r.repository.WithTxn(ctx, func(ctx context.Context) error {
    // this ctx has the transaction
    return r.repository.Scene.Update(ctx, scene)
})
```

Consequences:

- Calling a store method outside a transaction fails at **runtime**, not compile time,
  with `"not in transaction"`. There is no type-level protection.
- Nesting is rejected. `Begin` returns `"already in transaction"` and logs a stack trace
  if the context already carries one. You cannot open a sub-transaction; restructure
  instead.
- `WithDatabase` exists for read paths that don't need a transaction. It puts the read
  `*sqlx.DB` in the context instead, so each query runs standalone. `getDBReader` accepts
  either.

### Read vs write connections

```go
maxWriteConnections = 1
maxReadConnections  = 10
dbConnTimeout       = 30 * time.Second
```

Two separate pools ([`pkg/sqlite/database.go`](../../pkg/sqlite/database.go)):

- **Write pool: exactly one connection**, opened with `_txlock=immediate`. Every write
  transaction in the process serialises through it.
- **Read pool: ten connections**, opened `mode=ro`. Max and idle are set to the same value
  deliberately — opening connections on demand has a measurable cost.

Both use WAL journalling with `_busy_timeout=50`.

**The practical rule this implies:** never do slow work inside a write transaction.
Hashing a file, invoking ffmpeg, or making an HTTP request while holding the write
transaction blocks every other writer in the process. The scan pipeline is carefully
structured around this — see [files and scanning](files-and-scanning.md).

Idle timeout also has a side effect worth knowing: after 30s of inactivity connections
close, which lets SQLite delete the `-wal` and `-shm` files.

### Transaction hooks

[`pkg/txn`](../../pkg/txn/) wraps the manager and adds a hook system:

```go
func withTxn(ctx, m, fn, writable, execCompleteOnLocked bool) error {
    txnCtx, err := begin(ctx, m, writable)
    hookMgr := hookManagerCtx(txnCtx)

    defer func() {
        if p := recover(); p != nil {
            rollback(txnCtx, m); panic(p)
        }
        if err != nil {
            rollback(txnCtx, m)
            hookMgr.executePostRollbackHooks(ctx)   // ← outer ctx
            hookMgr.executePostCompleteHooks(ctx)
        } else {
            err = commit(txnCtx, m)
            hookMgr.executePostCommitHooks(ctx)
            hookMgr.executePostCompleteHooks(ctx)
        }
    }()

    err = fn(txnCtx)
    return err
}
```

Hook points: `PreCommit`, `PostCommit`, `PostRollback`, `PostComplete`.

**Post-hooks run with the *outer* context**, deliberately — the transaction is gone by
then, so a hook that needs the database opens its own. This is how plugin post-hooks
(`Scene.Update.Post`) get to see committed data.

`txn.Retryer` retries on `SQLITE_BUSY`. Used by paths that must not fail on contention.

## Two query styles

`pkg/sqlite` contains two entirely separate ways of building SQL. They do not compose,
and choosing wrongly means fighting the framework.

### Style 1: `goqu` via the `table` abstraction

Used for CRUD, join-table maintenance, and any query whose shape is known statically.
[`pkg/sqlite/table.go`](../../pkg/sqlite/table.go) wraps `goqu`:

```go
type table struct {
    table    exp.IdentifierExpression
    idColumn exp.IdentifierExpression
}

func (t *table) insert(ctx context.Context, o interface{}) (sql.Result, error) {
    q := dialect.Insert(t.table).Prepared(true).Rows(o)
    return exec(ctx, q)
}

func (t *table) updateByID(ctx context.Context, id, o interface{}) error {
    q := dialect.Update(t.table).Prepared(true).Set(o).Where(t.byID(id))
    ...
}
```

Type-safe-ish, composable, readable. `joinTable` builds on it for many-to-many
relationships with `insertJoins`, `replaceJoins`, `modifyJoins`.

### Style 2: the hand-rolled `queryBuilder`

Used for filtered list queries — anything driven by a `*FilterType` from the UI.
[`pkg/sqlite/query.go`](../../pkg/sqlite/query.go):

```go
type queryBuilder struct {
    repository *repository
    columns []string
    from    string
    joins         joins
    whereClauses  []string
    havingClauses []string
    withClauses   []string
    recursiveWith bool
    withArgs, joinArgs, whereArgs, havingArgs []interface{}
    sortAndPagination string
}
```

It assembles raw SQL strings. Argument ordering is manual and positional — `allArgs()`
concatenates `withArgs`, `joinArgs`, `whereArgs`, `havingArgs` **in that order**, matching
the order the clauses appear in the generated SQL. Add a clause in the wrong bucket and
you get silently mismatched placeholders.

Why it exists: the filter system needs to conditionally add joins, deduplicate them, mix
WHERE/HAVING/CTE clauses, and support recursive hierarchy traversal. `goqu` was found not
to express that cleanly.

**Rule of thumb**: follow the neighbouring code. A new field on an existing entity's filter
goes in the `queryBuilder` path; a new column read/written by CRUD goes through `table`.

### How a list query executes

`SceneStore.Query` is the canonical example:

```go
func (qb *SceneStore) Query(ctx, options) (*models.SceneQueryResult, error) {
    query, err := qb.makeQuery(ctx, options.SceneFilter, options.FindFilter)
    result, err := qb.queryGroupedFields(ctx, options, *query)   // count/duration/size
    idsResult, err := query.findIDs(ctx)
    result.IDs = idsResult
    return result, nil
}
```

Three points:

1. **The query returns IDs, not rows.** Objects are fetched afterwards by ID. This keeps
   the filter query free of the wide column list and avoids row explosion from joins.
2. **Aggregates run as a separate wrapping query.** `queryGroupedFields` nests the filter
   query as `(...) as temp` and sums over it. The `#5503` comment explains why the file ID
   is selected into that subquery: without it, `DISTINCT` collapses two equal-sized files
   and the total is wrong.
3. **`distinctIDs(&query, sceneTable)`** is called at the top of `makeQuery`. Joins to
   many-to-many tables multiply rows; the DISTINCT is what keeps the result correct.

## Related loading

Entities carry their relationships in `RelatedIDs` / `RelatedGroups` wrappers
([`pkg/models/relationships.go`](../../pkg/models/relationships.go)) rather than plain
slices. These are lazy:

```go
type RelatedIDs struct {
    list []int
}
func (r RelatedIDs) Loaded() bool
func (r *RelatedIDs) load(fn func() ([]int, error)) error
```

`Loaded()` distinguishes "no related IDs" from "not fetched yet". This matters on write:

```go
func (s *idRelationshipStore) createRelationships(ctx, id int, fkIDs models.RelatedIDs) error {
    if fkIDs.Loaded() {                    // ← only touch joins that were loaded
        return s.joinTable.insertJoins(ctx, id, fkIDs.List())
    }
    return nil
}
```

Without that guard, saving a partially-loaded entity would wipe relationships that were
simply never fetched. **If you construct an entity by hand and save it, unloaded
relationships are left alone, not cleared.**

Loading is driven by small interfaces (`TagIDLoader`, `PerformerIDLoader`,
`SceneGroupLoader`, …) so a service can load relationships without depending on the
concrete store.

## Adding a new entity or field

Field on an existing entity:

1. Migration adding the column (see [migrations](migrations.md)).
2. Field on the model struct in `pkg/models/model_<entity>.go`, and on `<Entity>Partial`
   if updatable (as an `Optional*`).
3. Store: add to the row struct and the `fromEntity`/`resolve` conversions in
   `pkg/sqlite/<entity>.go`.
4. GraphQL schema + `make generate-backend`, then the resolver.
5. Filter support if it should be queryable — see
   [query and filter system](query-filter-system.md).
6. Frontend document + `make generate-ui`.

New entity: additionally a repository interface, a store, a `storeRepository` entry in
`NewDatabase()`, a `models.Repository` entry in `Database.Repository()`, mock
regeneration, and — if it appears in integration test fixtures — an entry in
[`pkg/sqlite/setup_test.go`](../../pkg/sqlite/setup_test.go).

## Testing

Most of `pkg/sqlite` is behind `//go:build integration` and invisible to plain `go test`:

```bash
go test -tags "sqlite_stat4 sqlite_math_functions integration" ./pkg/sqlite -run TestSceneQuery
```

Tests build a real SQLite database from a shared fixture set in `setup_test.go`. Fixtures
are addressed by **ordinal index constants** (`sceneIdxWithTwoTags`,
`performerIdxWithGallery`, …):

```go
const (
    sceneIdxWithGroup = iota
    sceneIdxWithGallery
    sceneIdxWithPerformer
    // ...
)
```

Inserting a new constant in the middle shifts every subsequent index and breaks unrelated
tests across the whole package. **Append to the end.**

## Blob storage

Cover images and similar binaries go through `BlobStore`
([`pkg/sqlite/blob.go`](../../pkg/sqlite/blob.go)), which stores either in a BLOB column
or on the filesystem, per `BlobStoreOptions`. Blobs are content-addressed by checksum and
reference-counted, so the same image referenced by two entities is stored once. Deleting
the last reference deletes the blob.

`SupplementaryPaths` allows reading from additional directories — used when migrating
storage location without moving files.
