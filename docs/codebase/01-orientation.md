# 01 — Orientation

## What kind of program is this?

A **single statically-linkable Go binary** that:

- serves an embedded React SPA,
- exposes one GraphQL API and a set of REST media routes,
- owns one SQLite database file,
- shells out to `ffmpeg`/`ffprobe` for all media work,
- runs long operations as in-process background jobs,
- and can be extended at runtime by **plugins** (external processes *and* injected JS)
  and **scrapers** (declarative YAML).

There is no separate server, worker, queue or cache process. When you're debugging, all
state lives in one process plus one `.sqlite` file plus a generated-content directory.

## Runtime topology

```
  ┌─ cmd/stash/main.go ─────────────────────────────────────────────────────────────┐
  │  parses flags, sets up logging, then hands off to internal/manager              │
  └───────────────────────────┬────────────────────────────────────────────────────┘
                              │
  ┌───────────────────────────▼──── internal/manager (the process singleton) ───────┐
  │  manager.GetInstance()  — global; holds everything below                        │
  │                                                                                 │
  │   Config          internal/manager/config    — YAML config file + UI config blob │
  │   Database        pkg/sqlite/database.go     — connection pools, migrations      │
  │   Repository      internal/manager/repository.go — all entity stores + txn mgr   │
  │   JobManager      pkg/job                    — background task queue             │
  │   PluginCache     pkg/plugin                 — loaded plugin definitions         │
  │   ScraperCache    pkg/scraper                — loaded scraper definitions        │
  │   FFMPEG/FFProbe  pkg/ffmpeg                 — resolved binary paths             │
  │   StreamManager                              — live transcode sessions           │
  └───────────────────────────┬────────────────────────────────────────────────────┘
                              │
  ┌───────────────────────────▼──── internal/api/server.go ────────────────────────┐
  │  chi router. Route table (server.go:208-264):                                   │
  │                                                                                 │
  │    /graphql           gqlgen handler  ← the entire application API              │
  │    /playground        GraphQL playground UI                                     │
  │    /scene /image /gallery /performer /studio /group /tag                        │
  │                       REST media + asset routes (routes_*.go)                   │
  │    /downloads         temporary download links                                  │
  │    /plugin            assets served by UI plugins                               │
  │    /css /javascript /customlocales    user-supplied UI overrides                │
  │    /login /logout     session auth (session.go)                                 │
  │    /custom            user-configured static folders                            │
  │    /*                 embedded SPA fallback (internal/static)                   │
  └─────────────────────────────────────────────────────────────────────────────────┘
```

**The `manager.GetInstance()` singleton is the main architectural wart.** It's a global,
initialised once at startup. Most backend code that needs config or repositories reaches
for it rather than receiving them as dependencies. When you write new code, prefer
passing what you need explicitly — resolvers already receive `r.repository`.

## The layer stack, and where the real logic lives

```
   GraphQL schema            graphql/schema/**.graphql        ← source of truth
        │  (gqlgen codegen)
        ▼
   Generated exec/models     internal/api/generated_*.go      ← never edit by hand
        │
        ▼
   Resolvers                 internal/api/resolver_*.go
        │   • translate GraphQL input → domain input
        │   • open the transaction
        │   • fire plugin hooks (after commit)
        │
        ├──────────────► Service layer    pkg/scene, pkg/gallery, pkg/image, pkg/group
        │                (only the four "complex" entities have one)
        │
        ├──────────────► Validation only  pkg/performer, pkg/studio, pkg/tag
        │                (simpler entities: resolver validates, then calls the store)
        ▼
   Store interfaces          pkg/models/repository_*.go
        │
        ▼
   SQLite stores             pkg/sqlite/*.go
        │   • CRUD + join tables via goqu  (table.go)
        │   • listing/filtering via custom SQL builder (query.go, filter.go)
        ▼
   SQLite database
```

### Why two implementation styles in `pkg/sqlite`

This trips up everyone. `pkg/sqlite` contains **two different query mechanisms** and you
need to know which one you're in:

| | `goqu` (`table.go`, `record.go`) | Custom builder (`query.go`, `filter.go`) |
|---|---|---|
| Used for | `Find`, `Create`, `Update`, join-table reads/writes | `Query`, `QueryCount` — i.e. list screens |
| Style | Typed, composable expression builder | String concatenation into `SELECT`/`WHERE`/`HAVING`/`WITH` |
| Where you'll meet it | `scene.go`, `tag.go`, `performer.go` … | `scene_filter.go`, `criterion_handlers.go` … |

Doc 03 is entirely about the second one, because that's where the complexity is.

## Directory reading order for a newcomer

If you're trying to understand one vertical slice, read these in order — scenes is the
richest entity and the best teacher:

```
 1. graphql/schema/types/scene.graphql        what a Scene is, over the wire
 2. pkg/models/model_scene.go                 what a Scene is, in Go
 3. pkg/models/repository_scene.go            what you can ask of a Scene store
 4. internal/api/resolver_query_find_scene.go read path
 5. internal/api/resolver_mutation_scene.go   write path (and the hook/txn dance)
 6. pkg/scene/                                the service layer
 7. pkg/sqlite/scene.go                       the store
 8. pkg/sqlite/scene_filter.go                every filter a scene supports
 9. ui/v2.5/src/components/Scenes/SceneList.tsx   the frontend list
```

## The entity model

Seven first-class entities, plus files:

```
                    ┌──────────┐
                    │  Studio  │◄──── parent_id (self-hierarchy)
                    └────┬─────┘
                         │ 0..1
   ┌──────────┐     ┌────▼─────┐     ┌──────────┐
   │ Performer│◄───►│  Scene   │◄───►│   Tag    │◄──── parent/child (self-hierarchy)
   └──────────┘ M:N └────┬─────┘ M:N └──────────┘
        ▲               │ M:N
        │ M:N           ▼
        │          ┌──────────┐        ┌───────────────┐
        ├─────────►│  Group   │        │ SceneMarker   │ 1:N from Scene
        │          └──────────┘        └───────────────┘
        │           (self-hierarchy:
        │            containing/sub groups)
        │
        ├─────────►┌──────────┐◄───────┐
        │          │ Gallery  │        │ 1:N
        │          └──────────┘        │
        └─────────►┌──────────┐────────┘
                   │  Image   │
                   └──────────┘
```

**Files are separate from entities.** Since migration 32, a Scene does *not* own a path.
A Scene links to N `files` rows (one is primary) which live under `folders` rows. This is
what makes duplicate detection and file-move handling possible, and it's why
`Scene.Path`, `Scene.OSHash` and `Scene.Checksum` are *transient, derived* fields
(`pkg/models/model_scene.go:28-33`) — they're the primary file's values, not columns.

⚠️ `Group` is the same thing as the legacy `Movie`. The GraphQL schema still exposes
`Movie*` types for compatibility, mapped onto `models.Group` in `gqlgen.yml`. Any file
named `*movie*` is a compatibility shim.

## Configuration

Two distinct config surfaces that are easy to confuse:

1. **Backend config** — `internal/manager/config`. A YAML file (`config.yml`) plus env
   overrides. Holds paths, ffmpeg settings, auth, generated-content locations. Changing
   it usually needs a restart.

2. **UI config** — a free-form JSON blob stored *inside* the backend config under a `ui`
   key, typed only on the frontend as `IUIConfig` (`ui/v2.5/src/core/config.ts:43`).
   The backend treats it as an opaque map. This is where front-page layout, default
   filters, rating system, and per-view UI options live.

⚠️ Because the backend doesn't validate the UI blob, adding a UI setting requires **no
backend change at all** — just extend `IUIConfig` and write through the
`configureUI` mutation. This is the cheapest extension point in the codebase.

## Where background work happens

Long operations never run in a resolver. The mutation enqueues a job and returns a job ID
immediately; the UI subscribes for progress.

```
  mutation metadataScan
        │
        ▼
  resolver_mutation_metadata.go ── creates job ──► pkg/job.Manager queue
                                                        │
                                                        ▼
                                      internal/manager/task_scan.go  (ScanJob.Execute)
                                                        │
                                     progress ──► GraphQL subscription ──► UI progress bar
```

Job implementations all live in `internal/manager/task_*.go`. They are the only place
where it's normal to see `manager.GetInstance()` used heavily, and the only place that
opens many short transactions in a loop rather than one long one — deliberately, so a
long scan doesn't hold a write lock (see doc 04 on the single-writer constraint).
