# Startup and wiring

How the process comes up, where dependencies are constructed, and why so much of the
codebase reaches for a global singleton.

Key files: [`cmd/stash/main.go`](../../cmd/stash/main.go),
[`internal/manager/init.go`](../../internal/manager/init.go),
[`internal/manager/manager.go`](../../internal/manager/manager.go),
[`internal/api/server.go`](../../internal/api/server.go).

## The boot sequence

`main()` is short and strictly ordered. Each step depends on the previous one having
completed.

```
1.  initLogTemp()          temporary stderr-only logger, error level
2.  config.Initialize()    find and load config.yml (or decide we're a new system)
3.  initLog(cfg)           real logger, now that we know the log file and level
4.  desktop.InitIsDesktop()
5.  manager.Initialize()   build every service; sets the `instance` global
6.  api.Initialize()       build the chi router and gqlgen handler
7.  server.Start()         in a goroutine
8.  block on the exit channel (signals, or desktop quit)
```

Two ordering constraints are load-bearing and easy to break:

**Logging is initialised twice on purpose.** Config loading can fail, and those failures
need to reach the user. `initLogTemp` gives a stderr logger before any config exists;
`initLog` replaces it once the config tells us where the log file goes. Both assign to the
package-global `logger.Logger`.

**`desktop.InitIsDesktop()` runs before ffmpeg is touched.** The comment in `main.go` says
why: ffmpeg hardware-capability probing would otherwise perturb the desktop detection.

## `Manager`: the composition root

[`manager.Initialize`](../../internal/manager/init.go) is where essentially every
long-lived object in the process gets constructed. It's a plain constructor function — no
DI framework, no reflection — building a single `Manager` struct:

```go
mgr := &Manager{
    Config: cfg,  Logger: l,  Paths: mgrPaths,
    JobManager:      initJobManager(cfg),
    ReadLockManager: fsutil.NewReadLockManager(),
    PluginCache:     pluginCache,
    ScraperCache:    scraperCache,
    DLNAService:     dlnaService,
    Database:        db,
    Repository:      repo,
    SceneService:    sceneService,   // etc.
}
instance = mgr
```

The construction order inside `Initialize` matters because of one circular-ish
dependency. `NewDatabase()` builds the store repository, and several stores need each
other, so the struct is allocated empty and then filled in place:

```go
r := &storeRepository{}
*r = storeRepository{
    Scene: NewSceneStore(r, blobStore),   // ← takes r, which is being assigned
    Image: NewImageStore(r),
    ...
}
```

That `*r = ...` rather than `r = &...` is deliberate: the stores capture the pointer `r`
before it's populated, and dereferencing later gets the filled struct. Changing this to a
plain literal assignment produces stores holding a pointer to an empty repository.

### `GetInstance()` and why it exists

```go
var instance *Manager
func GetInstance() *Manager {
    if instance == nil { panic("manager not initialized") }
    return instance
}
```

`manager.GetInstance()` is called from all over the codebase — resolvers, routes, tasks.
This is a service locator, and it is the main structural compromise in the backend. It
exists because the alternative would be threading a dozen dependencies through every
resolver constructor, and gqlgen's generated resolver interfaces don't give you a natural
place to do that.

Practical consequences when you're making changes:

- **In tests, `GetInstance()` panics** unless a manager was initialised. This is a large
  part of why so many backend tests are integration tests against a real SQLite fixture
  rather than unit tests with mocks.
- **Prefer taking what you need as a struct field** over calling `GetInstance()` in new
  code. `Resolver` already does this for `repository` and the services; the routes structs
  in `internal/api` do it for their finders. Following that pattern keeps new code
  testable.
- Some calls genuinely can't avoid it — anything reached from a plugin callback or a
  background task that wasn't given a reference.

### Two-phase initialisation

`Initialize` splits on `cfg.IsNewSystem()`:

- **Existing system**: validate config, then run `postInit`.
- **New system** (no config file): build only a temporary session store, log a warning,
  and return. The UI then shows the setup wizard, and `Manager.Setup()` writes the config
  and calls `postInit` itself.

So `postInit` is the "we now have a valid configuration" phase. It opens the database,
initialises paths, refreshes the plugin and scraper caches, starts DLNA if enabled, sets
blob storage options, and resolves ffmpeg/ffprobe.

Note what `postInit` does with a database that needs migrating:

```go
if err := s.Database.Open(s.Config.GetDatabasePath()); err != nil {
    var migrationNeededErr *sqlite.MigrationNeededError
    if errors.As(err, &migrationNeededErr) {
        logger.Warn(err)      // ← not fatal
    } else {
        return err
    }
}
```

A pending migration is a *warning*, not a startup failure. The server comes up with no
open database connection and serves the migration UI. Any code path that assumes
`Database` is usable at startup must handle this; `db.Ready()` returns
`ErrDatabaseNotInitialized` in that state.

### The `Refresh*` methods

`RefreshConfig`, `RefreshPluginCache`, `RefreshScraperCache`, `RefreshStreamManager`,
`RefreshDLNA`, `RefreshFFMpeg`, `SetBlobStoreOptions` all exist so that changing settings
at runtime doesn't require a restart. They're called from `postInit` at startup and again
from the configuration mutation resolvers.

If you add a setting that something caches, you almost certainly need to add a refresh
call to the corresponding resolver in
[`internal/api/resolver_mutation_configure.go`](../../internal/api/resolver_mutation_configure.go).
Forgetting this is the classic "my setting only takes effect after a restart" bug.

## The HTTP server

[`api.Initialize`](../../internal/api/server.go) builds a `chi` router. Middleware order
is significant — it's applied outermost-first:

```
Heartbeat("/healthz")     → cheap liveness, before anything expensive
cors.AllowAll
RequestIPMiddleware       → stashes the client IP in context
authenticateHandler       → session/API-key auth; 401s here
VisitedPluginHandler
Recoverer
[httplog]                 → only if GetLogAccess()
SecurityHeadersMiddleware
Compress(4)
StripSlashes
BaseURLMiddleware         → computes base URL, honouring X-Forwarded-Prefix
dataloaders.Middleware    → fresh dataloaders per request
```

`dataloaders.Middleware` must run per-request and must be inside auth. Dataloaders cache
by ID for the lifetime of the request; a loader shared across requests would leak data
between users. See [GraphQL API](graphql-api.md#dataloaders).

### Route groups

Beyond `/graphql`, the server mounts a set of media-serving routes that are *not*
GraphQL — they stream bytes, so they bypass the GraphQL layer entirely:

| Mount | Serves |
|---|---|
| `/scene` | video streams, transcodes, sprites, VTT, markers, captions |
| `/image`, `/gallery` | image data, thumbnails, zip entries |
| `/performer`, `/studio`, `/group`, `/tag` | images |
| `/downloads` | temporary export/download files |
| `/plugin` | plugin-hosted static assets |
| `/css`, `/javascript`, `/customlocales` | user customisation files |
| `/*` | the embedded React app |

Each `get*Routes()` method on `Server` builds its route struct with the *narrowest*
interfaces it needs — `sceneRoutes` takes a `sceneFinder`, `fileGetter`, `captionFinder`
and so on, not the whole repository. This is a good pattern to copy for new routes.

### HTTP/2 is deliberately disabled

```go
TLSNextProto: make(map[string]func(*http.Server, *tls.Conn, http.Handler)),
```

The comment explains: with HTTP/2 the server can't hijack and forcibly close a connection,
which is required to stop an in-flight video stream when its scene file is deleted. Don't
"fix" this.

### Content Security Policy is computed from installed plugins

`setPageSecurityHeaders` builds the CSP header dynamically, walking every enabled plugin
and merging its declared `ExternalScript`, `ExternalCSS`, and explicit `CSP` entries into
the directive. This is why a plugin that loads a remote script must declare it in its YAML
— otherwise the browser blocks it and the failure looks like a plugin bug.

## Configuration

[`internal/manager/config/config.go`](../../internal/manager/config/config.go) is ~2000
lines wrapping Viper. The important characteristics:

- Every setting has a typed getter (`GetParallelTasks()`, `GetBlobsStorage()`, …). Reads
  go through these, never through Viper keys directly.
- Config resolution order is: environment variable override → config file → default.
- `HasOverride(key)` reports whether a value was explicitly set, which the setup flow uses
  to avoid clobbering user-supplied paths with defaults.
- `config.GetInstance()` is another global, for the same reasons as `Manager`.

When adding a setting you touch: the key constant and getter in `config.go`, the GraphQL
`ConfigResult` type and its resolver, the mutation input, and the UI settings component.
[Recipes](recipes.md#adding-a-configuration-setting) walks through it.

## Shutdown

`Manager.Shutdown()` stops the stream manager and closes the database. `Server.Shutdown()`
gracefully drains HTTP connections. Both are `defer`red in `main`, and the process blocks
on `exit` until a signal arrives or the desktop integration requests quit.

The `TODO` on `Manager.Shutdown` is honest: running jobs are not gracefully drained. A
scan interrupted by SIGTERM stops wherever it is. This is survivable because the scanner
commits incrementally per file, but it means there's no "clean shutdown" guarantee for
background work.
