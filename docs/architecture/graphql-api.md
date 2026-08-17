# The GraphQL API layer

Everything in `internal/api`. This is the only way the frontend talks to the backend,
apart from the media-streaming routes.

Key files: [`internal/api/resolver.go`](../../internal/api/resolver.go),
[`internal/api/changeset_translator.go`](../../internal/api/changeset_translator.go),
[`internal/api/loaders/`](../../internal/api/loaders/),
[`gqlgen.yml`](../../gqlgen.yml).

## Schema to Go

The schema lives in [`graphql/schema/`](../../graphql/schema/) — `schema.graphql` for the
root `Query`/`Mutation`/`Subscription` types, and `types/*.graphql` for everything else.

`make generate-backend` runs `go generate ./cmd/stash`, which runs gqlgen and writes:

- `internal/api/generated_exec.go` — the executable schema, resolver interfaces
- `internal/api/generated_models.go` — Go structs for types **not** bound elsewhere

The binding is controlled by [`gqlgen.yml`](../../gqlgen.yml). Two mechanisms:

```yaml
autobind:
  - github.com/stashapp/stash/pkg/models     # match by name automatically

models:
  Scene:
    model: github.com/stashapp/stash/pkg/models.Scene   # explicit
```

**The failure mode to know**: if a new GraphQL type has no binding, gqlgen silently
generates a *duplicate* struct in `generated_models.go` instead of using the one in
`pkg/models`. The code compiles. Then you get confusing type mismatches at the resolver
boundary, or the resolver quietly operates on a struct that's never persisted. If you add
a type to `pkg/models` and gqlgen doesn't pick it up, check that `autobind` can see it (the
names must match exactly) or add an explicit `models:` entry.

`make generate-backend` has a `touch-ui` prerequisite that creates a stub
`ui/v2.5/build/index.html`, because the Go embed directive needs that path to exist. You
don't need a real UI build to regenerate backend code.

## The resolver structure

One root `Resolver` holds the dependencies:

```go
type Resolver struct {
    repository     models.Repository
    sceneService   manager.SceneService
    imageService   manager.ImageService
    galleryService manager.GalleryService
    groupService   manager.GroupService
    hookExecutor   hookExecutor
}
```

Every sub-resolver is a one-field struct embedding it:

```go
type mutationResolver struct{ *Resolver }
type sceneResolver struct{ *Resolver }
// ...
```

So all resolvers share the same dependency set. Files are organised by kind:

| Pattern | Contains |
|---|---|
| `resolver_query_find_*.go` | `findScene`, `findScenes`, … |
| `resolver_mutation_*.go` | create/update/destroy per entity |
| `resolver_model_*.go` | field resolvers on types (`Scene.files`, `Scene.paths`, …) |

`movieResolver` embeds `groupResolver`, not `Resolver` — Movie is the deprecated alias for
Group, and both APIs are served from the same implementation.

### Every resolver opens a transaction

The rule is absolute: a resolver wraps its data access in `withTxn` (write) or
`withReadTxn` (read).

```go
func (r *queryResolver) SceneWall(ctx context.Context, q *string) (ret []*models.Scene, err error) {
    if err := r.withReadTxn(ctx, func(ctx context.Context) error {
        ret, err = r.repository.Scene.Wall(ctx, q)
        return err
    }); err != nil {
        return nil, err
    }
    return ret, nil
}
```

Note the shadowed `ctx` inside the closure — that's the one carrying the transaction.
Using the outer `ctx` inside the closure is a real bug that compiles fine and fails at
runtime with `"not in transaction"`.

Resolvers must not contain SQL or business logic. Mutations delegate to:

- **Service layer** (`pkg/scene`, `pkg/gallery`, `pkg/image`, `pkg/group`) for entities
  with file relationships and cascading side effects.
- **Validation packages** (`pkg/performer`, `pkg/studio`, `pkg/tag`) for simpler entities —
  the resolver validates, then calls the repository directly.

That asymmetry is historical but consistent; follow whichever the neighbouring entity does.

## Partial updates: the changeset translator

This is the subtlest part of the API layer, and it's where most update bugs come from.

GraphQL can't distinguish "field absent" from "field explicitly null" using Go structs
alone — both arrive as a nil pointer. But `sceneUpdate(input: {title: null})` must *clear*
the title, while omitting `title` must *leave it alone*.

[`changeset_translator.go`](../../internal/api/changeset_translator.go) solves this by
reaching into gqlgen's field context to read the raw argument map:

```go
func getUpdateInputMap(ctx context.Context) map[string]interface{} {
    rctx := graphql.GetFieldContext(ctx)
    reqCtx := graphql.GetOperationContext(ctx)
    args := rctx.Field.ArgumentMap(reqCtx.Variables)
    // ...
}
```

Presence in that map means the client sent the field. The translator then produces the
`Optional*` values in the `*Partial` struct:

```go
type ScenePartial struct {
    Title    OptionalString    // has Value + Set + Null
    Rating   OptionalInt
    Organized OptionalBool
    URLs     *UpdateStrings    // nil = don't touch
    TagIDs   *UpdateIDs        // has Mode: SET / ADD / REMOVE
    // ...
}
```

Three things follow from this:

1. **`Optional*` types are not `*T`.** They carry three states: unset, set-to-value,
   set-to-null. `pkg/models/value.go` defines them.
2. **Relationship updates carry a mode.** `UpdateIDs{IDs: [...], Mode: ADD}` appends;
   `SET` replaces; `REMOVE` subtracts. The store honours the mode in
   [`pkg/sqlite/relationships.go`](../../pkg/sqlite/relationships.go).
3. **The translator depends on gqlgen's context.** It only works inside a resolver. A
   service function can't reconstruct "was this field sent" — the resolver must translate
   and pass a `*Partial` down.

When adding an updatable field, you touch: the GraphQL input type, the `*Partial` struct,
the translator call in the mutation resolver, and the store's update method.

## Dataloaders

Field resolvers cause N+1 queries by nature: rendering 40 scenes with their studio means
40 `findStudio` calls. [`internal/api/loaders`](../../internal/api/loaders/) batches these.

Loaders are generated by `dataloaden` from `//go:generate` directives at the top of
[`dataloaders.go`](../../internal/api/loaders/dataloaders.go):

```go
//go:generate go run github.com/vektah/dataloaden SceneLoader int *.../models.Scene
//go:generate go run github.com/vektah/dataloaden StudioLoader int *.../models.Studio
```

Regenerate with `make generate-dataloaders`. Batching parameters:

```go
const (
    wait     = 1 * time.Millisecond   // collect window
    maxBatch = 100
)
```

Usage in a field resolver:

```go
func (r *sceneResolver) Files(ctx context.Context, obj *models.Scene) ([]*models.VideoFile, error) {
    fileIDs, err := loaders.From(ctx).SceneFiles.Load(obj.ID)
    files, errs := loaders.From(ctx).FileByID.LoadAll(fileIDs)
    // ...
}
```

**The loaders are per-request**, injected by `dataloaders.Middleware`. They cache by key
for the request's lifetime. Two consequences:

- Don't hold a `Loaders` reference beyond the request.
- Within a request, a loader returns the *same* object for the same ID. If a mutation
  changes an entity mid-request, a subsequent load may return the stale cached value.

There's a second batching layer inside `models.RelatedIDs` — see
[data layer](data-layer.md#related-loading).

## Errors

`gqlErrorHandler` in [`error.go`](../../internal/api/error.go) is registered as gqlgen's
error presenter. It logs the field path and (at debug level) the arguments, then defers to
`graphql.DefaultErrorPresenter`. Errors are **not** transformed for the client — the raw
message goes out. There's a comment noting this may change.

Cancelled contexts are excluded from logging, so a user navigating away mid-query doesn't
produce error spam.

Three sentinel errors are defined in `resolver.go` for common cases: `ErrNotImplemented`,
`ErrNotSupported`, `ErrInput`.

A panic in a resolver is caught by the `recoverFunc` set on the gqlgen server, which logs
the stack and returns a generic "Internal system error" — the process survives.

## Subscriptions

Served over WebSocket via `gqlTransport.Websocket` with a 10s keepalive ping.
`CheckOrigin` returns true unconditionally — origin checking is not performed.

Subscriptions in use: job progress updates (`jobsSubscribe`), log entries
(`loggingSubscribe`), and scan completion. The pattern is a Go channel fanned out by a
subscription manager; see [`pkg/job/subscribe.go`](../../pkg/job/subscribe.go) and
[`internal/manager/subscribe.go`](../../internal/manager/subscribe.go).

## The optimisation hook you'll want to know about

```go
func (r *Resolver) idOnly(ctx context.Context) bool {
    fields := graphql.CollectAllFields(ctx)
    return len(fields) == 1 && fields[0] == "id"
}
```

Used to skip loading full objects when the query only asked for IDs. Worth reaching for
when adding a resolver that returns a large list.

## The raw SQL escape hatch

`ExecSQL` and `QuerySQL` mutations run arbitrary SQL against the database from the
GraphQL API. They exist for plugin authors and debugging. They run inside a normal write
transaction, so they're subject to the same single-writer constraint as everything else,
and they bypass every validation and hook in the system.
