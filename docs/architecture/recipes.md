# Recipes

End-to-end walkthroughs for the changes you'll actually make. Each lists every file that
has to move together — the failure mode in this codebase is usually a missed step, not a
hard problem.

## Adding a field to an existing entity

Say a `subtitle` on Scene.

**1. Migration**

```sql
-- pkg/sqlite/migrations/86_scene_subtitle.up.sql
ALTER TABLE scenes ADD COLUMN subtitle VARCHAR(255);
```

Bump `appSchemaVersion` to `86` in [`pkg/sqlite/database.go`](../../pkg/sqlite/database.go).

**2. Model** — [`pkg/models/model_scene.go`](../../pkg/models/model_scene.go)

```go
type Scene struct {
    Title    string
    Subtitle string   // new
    ...
}

type ScenePartial struct {
    Title    OptionalString
    Subtitle OptionalString   // new — Optional, not *string
    ...
}
```

**3. Store** — [`pkg/sqlite/scene.go`](../../pkg/sqlite/scene.go)

Add to the `sceneRow` struct with its `db:` tag, and to `fromScene` / `resolve`. Because
CRUD goes through `goqu`'s `table` abstraction, no SQL string changes are needed.

**4. Schema** — `graphql/schema/types/scene.graphql`

```graphql
type Scene { subtitle: String }
input SceneUpdateInput { subtitle: String }
input SceneCreateInput { subtitle: String }
```

Then `make generate-backend`.

**5. Resolver** — the field resolves automatically from the bound struct. The *mutation*
needs the changeset translation:

```go
// internal/api/resolver_mutation_scene.go
updatedScene.Subtitle = translator.optionalString(input.Subtitle, "subtitle")
```

The string `"subtitle"` must match the GraphQL field name — it's the key looked up in the
raw argument map to distinguish "absent" from "explicit null". See
[the API layer](graphql-api.md#partial-updates-the-changeset-translator).

**6. Frontend** — add to the fragment in `ui/v2.5/graphql/data/scene.graphql`, then
`make generate-ui`, then use it in the edit panel and detail view.

**7. Tests** — `pkg/sqlite/scene_test.go`, covering create, update, and partial update
leaving it untouched.

**Checklist**: migration · `appSchemaVersion` · model · partial · row struct · schema ·
translator · fragment · UI · test.

---

## Adding a filter criterion

Say filtering scenes by `subtitle`.

**Backend** — `pkg/sqlite/scene_filter.go`, in the `compoundHandler`:

```go
stringCriterionHandler(sceneFilter.Subtitle, "scenes.subtitle"),
```

If the column lives on a joined table, pass an `addJoinFn` so the join is only added when
the criterion is present:

```go
floatIntCriterionHandler(sceneFilter.Duration, "video_files.duration", qb.addVideoFilesTable),
```

Add the field to `SceneFilterType` in `graphql/schema/types/filters.graphql` and
regenerate.

**Frontend** — a criterion class in
[`models/list-filter/criteria/`](../../ui/v2.5/src/models/list-filter/criteria/) and
registration in `models/list-filter/scenes.ts`.

**Tests** — `pkg/sqlite/scene_test.go`. Test **each modifier separately**. `INCLUDES`,
`INCLUDES_ALL`, `EQUALS` and `EXCLUDES` generate structurally different SQL (joins vs
HAVING vs subqueries), so one passing test tells you nothing about the others. If your
handler adds an inner join, also test it inside an `OR` filter — `or()` demotes inner
joins to left joins and that can change results. See
[the filter system](query-filter-system.md#and--or--not-nesting).

---

## Adding a configuration setting

**1.** Key constant, default, and typed getter in
[`internal/manager/config/config.go`](../../internal/manager/config/config.go):

```go
const MyThing = "my_thing"
const myThingDefault = true

func (i *Config) GetMyThing() bool {
    return i.getBool(MyThing)
}
```

**2.** GraphQL: add to `ConfigGeneralResult` and `ConfigGeneralInput` in
`graphql/schema/types/config.graphql`; regenerate.

**3.** Resolvers: read it in
[`resolver_query_configuration.go`](../../internal/api/resolver_query_configuration.go),
write it in
[`resolver_mutation_configure.go`](../../internal/api/resolver_mutation_configure.go).

**4. If anything caches the value, call the matching `Refresh*` method** on `Manager` from
the mutation resolver. Miss this and the setting only takes effect after a restart — the
single most common bug in this area. See
[startup and wiring](startup-and-wiring.md#the-refresh-methods).

**5.** UI in `components/Settings/`, plus a label in `locales/en-GB.json`.

---

## Adding a background job

**1.** `internal/manager/task_mything.go`:

```go
type MyThingJob struct {
    input MyThingInput
}

func (j *MyThingJob) Execute(ctx context.Context, progress *job.Progress) error {
    if job.IsCancelled(ctx) { return nil }

    items, err := j.findItems(ctx)
    if err != nil { return err }

    progress.SetTotal(len(items))

    queue := job.NewTaskQueue(ctx, progress, 100000, parallelTasks)
    defer queue.Close()

    for _, item := range items {
        if job.IsCancelled(ctx) { return nil }   // check every iteration
        item := item
        queue.Add("processing "+item.Name, func(ctx context.Context) {
            j.process(ctx, item)                 // slow work: no transaction held
        })
        progress.Increment()
    }
    return nil
}
```

**2.** Entry point in
[`manager_tasks.go`](../../internal/manager/manager_tasks.go) that calls
`JobManager.Add(ctx, "Doing my thing...", &MyThingJob{...})`.

**3.** Mutation in the schema + resolver returning the job ID.

**4.** UI trigger in Settings → Tasks.

Rules: check cancellation in every loop; return `nil` (not an error) on cancellation; never
hold a write transaction across slow work. See [jobs and tasks](jobs-and-tasks.md).

---

## Adding a new entity

The largest change shape. In dependency order:

1. **Migration** — table plus any join tables.
2. **Model** — `pkg/models/model_myentity.go`: the struct, `MyEntityPartial`, and any
   `RelatedIDs` fields.
3. **Repository interface** — `pkg/models/repository_myentity.go`:
   `MyEntityReader` / `Writer` / `ReaderWriter`.
4. **Store** — `pkg/sqlite/myentity.go`: the row struct, `table` definition in
   `tables.go`, CRUD, and `Query`.
5. **Filter** — `pkg/sqlite/myentity_filter.go` if it's listable.
6. **Wiring** — add to `storeRepository` in `NewDatabase()` *and* to `models.Repository`
   in `Database.Repository()`. Both, or it compiles and is unreachable.
7. **Mocks** — `make generate-test-mocks`.
8. **Schema + resolvers** — query, mutation, and model resolver files.
9. **Fixtures** — if it appears in integration tests, add to
   [`pkg/sqlite/setup_test.go`](../../pkg/sqlite/setup_test.go). **Append** index
   constants; inserting in the middle shifts every later index and breaks unrelated tests.
10. **Frontend** — documents, list components, detail page, filter model, routes, locale
    strings.

Consider whether it needs plugin hooks (`pkg/plugin/hook/hooks.go`) and
import/export support (`task_export.go` / `task_import.go`).

---

## Debugging

**Wrong rows from a filter** — set log level to Trace. `pkg/sqlite/tx.go` logs every
statement with arguments and duration; >200ms is logged as `SLOW SQL`. Read the generated
SQL directly.

**"not in transaction"** — a store method was called outside `WithTxn`/`WithReadTxn`, or
the closure used the outer `ctx` instead of the shadowed one.

**Mutation doesn't persist a field** — the translator call is missing, or the field-name
string doesn't match the GraphQL field.

**Stale UI after a mutation** — the query isn't in the entity's
`<entity>MutationImpactedQueries` list in `StashService.ts`.

**Plugin stopped working after a refactor** — a `PatchComponent` name changed or a wrapper
was removed.

**Setting has no effect until restart** — missing `Refresh*` call in the configure
mutation.

**gqlgen generated a duplicate model** — the type isn't bound in
[`gqlgen.yml`](../../gqlgen.yml).

---

## Before opening a PR

`docs/CONTRIBUTING.md` and `docs/AI_POLICY.md` are unusually strict. In short:

- Link an open issue.
- One issue or feature per PR.
- Include tests covering the change.
- Describe the manual testing you did.
- Disclose AI assistance and its scope in the description.
- Issue and PR descriptions must be human-written.
- Large LLM-generated features aren't accepted from outside contributors.
- Branch from and target `develop`.

```bash
make validate            # what CI runs: validate-ui + lint + it
make validate-backend    # lint + integration tests only
make validate-ui-quick   # changed files, no tsc — fast inner loop
```
