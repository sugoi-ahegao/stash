# 06 — Recipes & gotchas

## The code generation pipeline

Four independent generators. Knowing which one to run saves a lot of confusion.

```
  graphql/schema/**.graphql  ─┬─► make generate-backend ─► internal/api/generated_exec.go
   (single source of truth)   │      (go generate ./cmd/stash, i.e. gqlgen + gqlgen.yml)
                              │                            internal/api/generated_models.go
                              │
                              └─► make generate-ui ──────► ui/v2.5/src/core/generated-graphql.ts
                                     (graphql-codegen, config in ui/v2.5/codegen.ts,
                                      reads schema + ui/v2.5/graphql/**.graphql documents)

  internal/api/loaders/dataloaders.go ─► make generate-dataloaders ─► *_gen.go
                                          (vektah/dataloaden)

  graphql/stash-box/*.graphql        ─► make generate-stash-box-client ─► pkg/stashbox/graphql/
                                          (Yamashou/gqlgenc, config .gqlgenc.yml)

  .mockery.yml                       ─► make generate-test-mocks ─► pkg/models/mocks/
```

`make generate` = `generate-backend` + `generate-ui`.

⚠️ `generate-backend` depends on `touch-ui`, which creates a placeholder UI build directory.
The Go build embeds the UI via `//go:embed`, and that fails if the directory doesn't exist.
This is why `make generate` works on a fresh clone but a bare `go generate` may not.

⚠️ **Never hand-edit `generated_*.go` or `generated-graphql.ts`.** They are overwritten.
If you need a custom Go type behind a GraphQL type, bind it in `gqlgen.yml` under `models:`
— that's what the `Movie → models.Group` and `VideoFile.duration → DurationFinite` entries
do.

## Recipe: add a field to Scene, end to end

The canonical change. Say we're adding `my_field` (a nullable string).

```
 ┌─ 1. DATABASE ──────────────────────────────────────────────────────────────┐
 │  pkg/sqlite/migrations/86_scene_my_field.up.sql      ← upstream's way;     │
 │      ALTER TABLE scenes ADD COLUMN my_field VARCHAR;    not in this fork,  │
 │  pkg/sqlite/database.go       appSchemaVersion = 86     see below          │
 └────────────────────────────────────────────────────────────────────────────┘
 ┌─ 2. GO MODEL ──────────────────────────────────────────────────────────────┐
 │  pkg/models/model_scene.go                                                 │
 │      Scene struct:         MyField string `json:"my_field"`                │
 │      ScenePartial struct:  MyField OptionalString      ← REQUIRED for update│
 └────────────────────────────────────────────────────────────────────────────┘
 ┌─ 3. STORE ─────────────────────────────────────────────────────────────────┐
 │  pkg/sqlite/scene.go                                                       │
 │      add to the sceneRow struct + its fromScene()/resolve() mapping        │
 │      (the row struct is what goqu binds; missing it = silently NULL)       │
 └────────────────────────────────────────────────────────────────────────────┘
 ┌─ 4. SCHEMA ────────────────────────────────────────────────────────────────┐
 │  graphql/schema/types/scene.graphql                                        │
 │      type Scene            { ... my_field: String }                        │
 │      input SceneCreateInput{ ... my_field: String }                        │
 │      input SceneUpdateInput{ ... my_field: String }                        │
 │      input SceneFilterType { ... my_field: StringCriterionInput }  (optional)│
 │  $ make generate-backend                                                   │
 └────────────────────────────────────────────────────────────────────────────┘
 ┌─ 5. RESOLVER ──────────────────────────────────────────────────────────────┐
 │  internal/api/resolver_mutation_scene.go                                   │
 │      create:  newScene.MyField = translator.string(input.MyField)          │
 │      update:  updatedScene.MyField = translator.optionalString(            │
 │                   input.MyField, "my_field")                               │
 │      ⚠ the second arg is the JSON key — it must match the schema exactly   │
 └────────────────────────────────────────────────────────────────────────────┘
 ┌─ 6. FILTER (if wanted) ────────────────────────────────────────────────────┐
 │  pkg/sqlite/scene_filter.go → criterionHandler():                          │
 │      stringCriterionHandler(sceneFilter.MyField, "scenes.my_field"),       │
 └────────────────────────────────────────────────────────────────────────────┘
 ┌─ 7. IMPORT / EXPORT ───────────────────────────────────────────────────────┐
 │  pkg/models/jsonschema/scene.go        add the field                       │
 │  internal/manager/task_export.go / task_import.go   map it                 │
 │  ⚠ easy to forget; silently loses data on backup/restore                   │
 └────────────────────────────────────────────────────────────────────────────┘
 ┌─ 8. FRONTEND ──────────────────────────────────────────────────────────────┐
 │  ui/v2.5/graphql/data/scene.graphql       add to SceneDataFragment         │
 │       (and scene-slim.graphql if lists need it)                            │
 │  $ make generate-ui                                                        │
 │  components/Scenes/SceneDetails/…         display + edit UI                │
 │  locales/en-GB.json                       label                            │
 │  models/list-filter/… + factory.ts        filter UI (doc 05)               │
 └────────────────────────────────────────────────────────────────────────────┘
 ┌─ 9. TESTS ─────────────────────────────────────────────────────────────────┐
 │  pkg/sqlite/scene_test.go   CRUD + each filter modifier                    │
 │  $ make it                                                                 │
 └────────────────────────────────────────────────────────────────────────────┘
```

⚠️ **In this fork, step 1 is different.** The recipe above is how upstream adds a field. A
fork migration must not alter an upstream table: upstream's next rebuild of `scenes` would
copy only the columns it knows about, and `my_field` would disappear. Put the value in a
table of your own (`migrations_fork/2_scene_my_field.up.sql`, keyed by `scene_id`, as
`scenes_viewed_dates` is), or use custom fields. Doc 12 and
`pkg/sqlite/migrations_fork/README.md` have the rules.

**If you only need per-item metadata and not a real column**, stop at step 0 and use
**custom fields** instead (doc 04) — no migration, no schema change, no codegen. That's the
right tool for experimental or user-specific data.

**If you only need a persisted UI preference**, use the `IUIConfig` blob (doc 05) — no
backend change at all.

## Recipe: add a background task

```
 1. internal/manager/task_my_thing.go
        type MyThingJob struct { ... }
        func (j *MyThingJob) Execute(ctx context.Context, progress *job.Progress)
            progress.SetTotal(n) / progress.Increment() / progress.SetPercent()
            check ctx.Err() regularly — cancellation is cooperative
 2. graphql/schema/types/metadata.graphql   add the mutation
 3. internal/api/resolver_mutation_metadata.go
        enqueue via manager.GetInstance().JobManager.Add(...), return the job ID
 4. UI: components/Settings/Tasks/  — a button that fires the mutation;
        job progress arrives automatically over the existing subscription
```

⚠️ Inside a task, commit in **small batches**. One transaction spanning a whole scan holds
the single write connection and blocks the entire application (doc 04).

## Recipe: add a page / route

```
 1. ui/v2.5/src/components/MyThing/MyThing.tsx
 2. App.tsx:  const MyThing = lazyComponent(() => import("./components/MyThing/MyThing"));
              <Route path="/mything" component={MyThing} />
 3. MainNavbar.tsx: add the nav entry (respect the existing menuItems structure)
 4. locales/en-GB.json: the nav label
 5. If it shows a list, add a View enum value in components/List/views.ts
```

## Gotchas index

### Backend

| ⚠️ | Symptom | Cause |
|---|---|---|
| `panic: list has not been loaded` | crash reading `scene.TagIDs.List()` | relationship not loaded — call the `Load*` method or check `Loaded()` (doc 02) |
| A field never persists on update | no error, value ignored | missing `Optional*` field on the `*Partial` struct, or missing `translator.optional*` call |
| Filter returns wrong rows | plausible but incorrect results | argument added to the wrong slice — `addArg` vs `addHavingArg` (doc 03) |
| Untagged items disappear under an OR filter | | an inner join not routed through `filterBuilder`, so `innerJoinsToLeftJoins` never ran |
| Two joins collapse into one | missing data | both used the same alias — `joins.addUnique` dedupes by alias (doc 03) |
| Deadlock / "database is locked" | request hangs | long work (plugin, HTTP, ffmpeg) inside a write transaction |
| Plugin hook sees stale data | | hooks fired inside the transaction instead of after commit |
| Field lost on export/import | backup round-trip drops it | `pkg/models/jsonschema` + `task_export.go`/`task_import.go` not updated |
| Downgrade fails hard | user complaint | migrations are forward-only, by design |

### Frontend

| ⚠️ | Symptom | Cause |
|---|---|---|
| Filter property resets on any change | | `ListFilterModel.clone()` doesn't copy it |
| Bookmarked filter URLs break | | changed a criterion **type key** — those are a persisted format |
| Saved filter shows "unsupported criterion" | | same cause as above |
| Field is `undefined` in a list but fine on the detail page | | added to the full fragment but not the `*_slim` one |
| List doesn't refresh after a mutation | stale rows until reload | used a generated mutation hook directly instead of `StashService.ts` |
| Sub-list remembers the wrong sort/zoom | | no dedicated `View` enum value |
| Duplicate component registration error in prod | build works in dev, breaks in prod | two `PatchComponent` calls with the same name |
| A community plugin breaks after your refactor | | you renamed or removed a `PatchComponent` name — that's a public API |
| Config key doesn't round-trip | | double capitals in an `IUIConfig` key (`showURLs` → use `showUrls`) |
| Dev server can't log in | 401s on `make ui-start` | cross-origin cookies; disable auth on the dev server |

## Validation before you push

```bash
make validate          # everything: validate-ui + lint + it
# or piecemeal:
make lint              # golangci-lint (config in .golangci.yml)
make it                # unit + integration tests (integration build tag)
make validate-ui       # biome lint + tsc + UI tests
make fmt fmt-ui        # formatters
```

`make validate-ui-quick` / `fmt-ui-quick` operate only on changed files — useful locally,
but run the full `validate-ui` before pushing.

## Project norms worth internalising

From [`docs/CONTRIBUTING.md`](../CONTRIBUTING.md), the parts that most affect how you should
scope work:

- **One PR, one concern.** Multi-purpose PRs get rejected outright.
- **Large features need maintainer discussion first.** Build the prototype, then open the
  discussion before the PR.
- **Tests are required**, and you must describe the manual testing you did.
- Stash's stated design vision is *"minimal, but highly extensible"* — features are
  explicitly evaluated against "could this be a plugin instead?" DLNA and the filename
  parser are named in the docs as examples of features they'd rather not have added.

That last point is the single most useful thing to know before proposing a major change
upstream: **the plugin API, the `IUIConfig` blob, and custom fields are the sanctioned
extension surfaces**, and a design that uses them will be received very differently from one
that adds core schema and UI.

There is also an [AI usage policy](../AI_POLICY.md) governing contributions — read it before
submitting anything upstream.
