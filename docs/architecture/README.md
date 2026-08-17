# Stash internals

Deep-dive documentation on how Stash actually works, intended for people changing the
code rather than using the app.

[`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) is the high-level tour — repository layout,
what each package is for, the broad request lifecycle. Read that first if you're new.
These documents pick up where it stops: they explain the *mechanisms*, the invariants you
can't see from a single file, and the places where the obvious change is the wrong one.

## Reading order

If you're getting oriented, read in this order. Each builds on the previous.

| # | Document | What it covers |
|---|---|---|
| 1 | [Startup and wiring](startup-and-wiring.md) | Process bootstrap, the `Manager` singleton, config, how dependencies get built and injected |
| 2 | [GraphQL API layer](graphql-api.md) | Schema → codegen → resolvers, dataloaders, partial updates, errors, subscriptions |
| 3 | [Data layer](data-layer.md) | Repository interfaces, stores, the two query styles, transactions-in-context, relationship loading |
| 4 | [Query and filter system](query-filter-system.md) | How a `SceneFilterType` becomes SQL. The densest subsystem in the codebase |
| 5 | [Migrations](migrations.md) | Schema versioning, pre/post migrations, what you can't undo |
| 6 | [Files and scanning](files-and-scanning.md) | The file/folder abstraction, the scanner, fingerprints, rename detection |
| 7 | [Jobs and tasks](jobs-and-tasks.md) | Job manager, progress reporting, the task queue, cancellation |
| 8 | [Plugins](plugins.md) | Plugin config, the four execution backends, hooks, UI plugins and CSP |
| 9 | [Scrapers](scrapers.md) | Scraper definitions, scrape types, post-processing, stash-box |
| 10 | [Frontend](frontend.md) | App shell, Apollo, the patch system, list filters, i18n |
| 11 | [Recipes](recipes.md) | End-to-end walkthroughs for the changes you'll actually make |

## The shape of the system in one page

Stash is a single Go binary with the React UI embedded in it. There is no separate API
server, no external database, no message broker. Everything below runs in one process.

```
                     browser
                        │
                        │  GraphQL over HTTP + WebSocket
                        ▼
        ┌───────────────────────────────────┐
        │  internal/api                     │   chi router, gqlgen handler,
        │  resolvers + REST-ish media routes│   dataloaders, auth middleware
        └───────────────────────────────────┘
                        │
        ┌───────────────┴───────────────┐
        ▼                               ▼
┌───────────────────┐         ┌───────────────────────┐
│ pkg/{scene,image, │         │ internal/manager      │
│ gallery,group}    │         │ Manager singleton:    │
│ service layer     │         │ config, jobs, caches, │
│                   │         │ ffmpeg, DLNA, tasks   │
└───────────────────┘         └───────────────────────┘
        │                               │
        │                               ├──► pkg/job        background work
        │                               ├──► pkg/plugin     hooks, tasks, UI injection
        │                               ├──► pkg/scraper    metadata from the web
        │                               └──► pkg/file       scanning the filesystem
        ▼
┌───────────────────────────────────────────┐
│ pkg/models — repository interfaces        │
│ pkg/sqlite — the only implementation      │
└───────────────────────────────────────────┘
                        │
                        ▼
                  SQLite (WAL)
             1 write conn, 10 read conns
```

## Five things that will surprise you

These are the assumptions most likely to cost you an afternoon. Each is expanded in the
linked document.

**1. The transaction lives in the `context.Context`, not in a receiver.**
`repo.Scene.Find(ctx, id)` works because `ctx` carries an open `*sqlx.Tx`. A repository
method called outside `WithTxn`/`WithReadTxn` returns `"not in transaction"` at runtime —
there is no compile-time protection. See [data layer](data-layer.md#transactions-live-in-the-context).

**2. There are two completely separate query styles in `pkg/sqlite`,** and which one you
use is decided by what you're doing, not by preference. CRUD and join tables use `goqu`
via the `table` abstraction; filtered list queries use a hand-rolled string builder.
They don't compose. See [data layer](data-layer.md#two-query-styles).

**3. Only one writer exists, ever.** `maxWriteConnections = 1` in
[`pkg/sqlite/database.go`](../../pkg/sqlite/database.go). Every write transaction in the
process serialises through a single connection. Holding a write transaction open while
doing slow work (hashing, ffmpeg, HTTP) stalls every other writer in the app.

**4. Most frontend components are wrapped in `PatchComponent`,** which registers them in a
global registry that third-party plugins hook into. Renaming or unwrapping one silently
breaks plugins with no build error. See [frontend](frontend.md#the-patch-system).

**5. Migrations are immutable after release.** A released `.up.sql` file is never edited,
because users' databases have already run it. Fixing a bad migration means writing a new
one. See [migrations](migrations.md).

## Conventions used in these docs

- File references are clickable relative links, e.g.
  [`pkg/sqlite/scene.go`](../../pkg/sqlite/scene.go).
- Line numbers are omitted deliberately — they go stale. Function and type names are
  given instead, so `grep` will find them after the code moves.
- Code excerpts are trimmed for clarity; they are illustrative, not literal.
- Where a design is awkward and there's a reason for it, the reason is stated. Where it's
  awkward and there isn't one, that's said too.
