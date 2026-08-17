# The frontend

React 17 + TypeScript + Apollo Client, built with Vite, served embedded in the Go binary.
Lives entirely in [`ui/v2.5`](../../ui/v2.5/).

There is a second, tiny frontend in [`ui/login`](../../ui/login/) for the login page. It's
plain static files, not React. `make ui` builds the main app *and* regenerates the login
page's locale bundle; `make ui-only` skips the latter.

## Layout

```
ui/v2.5/
├── graphql/                  GraphQL documents (source for codegen)
│   ├── queries/  mutations/  data/   subscriptions.graphql
└── src/
    ├── core/                 Apollo client, StashService, generated-graphql.ts
    ├── components/           by entity — Scenes/, Performers/, Settings/, List/, Shared/
    ├── models/list-filter/   the filter model — see below
    ├── hooks/                shared hooks
    ├── locales/              en-GB.json is the source of truth
    ├── docs/en/              in-app manual + changelog
    ├── patch.tsx             plugin patch registry
    ├── pluginApi.tsx         the API surface exposed to plugins
    └── plugins.tsx           plugin loader
```

## GraphQL: documents, never inline

Write the document in `ui/v2.5/graphql/`, then run `make generate-ui`. Codegen produces
typed hooks in `src/core/generated-graphql.ts`.

```graphql
# ui/v2.5/graphql/queries/scene.graphql
query FindScenes($filter: FindFilterType, $scene_filter: SceneFilterType) {
  findScenes(filter: $filter, scene_filter: $scene_filter) {
    count
    scenes { ...SlimSceneData }
  }
}
```

```ts
// generated
export const useFindScenesQuery = ...
```

Inlining `gql` in a component means it isn't typed and isn't discoverable. Fragments in
`graphql/data/` are the shared shapes — `SlimSceneData` for lists, `SceneData` for detail
pages. Adding a field to a fragment adds it to *every* query using it, which is usually
what you want but does affect payload size on list views.

`src/core/StashService.ts` (~3000 lines) wraps the generated hooks with the app's
conventions — filter conversion, cache updates, refetch policy. Components import from
`StashService`, not from `generated-graphql` directly.

## Apollo cache

[`createClient.ts`](../../ui/v2.5/src/core/createClient.ts) sets up the link chain (upload
link → error link → WebSocket split for subscriptions) and the type policies.

Two custom read functions worth understanding:

```ts
// Resolve findX(id:) from the normalised cache without a network round-trip
const readReference = (typename: string): FieldReadFunction =>
  (existing, { args, canRead, toReference }) =>
    canRead(existing) ? existing : toReference({ __typename: typename, id: args?.id });

// A dangling reference means the object was deleted → return null, not undefined
const readDanglingNull: FieldReadFunction = (existing, { canRead }) => {
  if (existing === undefined) return undefined;
  return canRead(existing) ? existing : null;
};
```

The first makes navigating from a list to a detail page instant. The second handles the
case where, say, a scene's studio was deleted — without it the field would read as "not
fetched" and re-query forever.

Cache invalidation after mutations goes through `evictQueries(cache, queries)` in
`StashService`, which deletes the root fields for the listed queries and runs a GC. Each
entity has a `<entity>MutationImpactedQueries` list. **If you add a query that shows data
affected by an existing mutation, add it to that list**, or the UI will show stale data
after edits.

## The list filter model

[`ListFilterModel`](../../ui/v2.5/src/models/list-filter/filter.ts) is the frontend
counterpart to [the backend filter system](query-filter-system.md). It holds search term,
page, per-page, sort, display mode, zoom, and a list of `Criterion` objects, and it can:

- **Serialise to a URL query string** (`makeQueryParameters`) — so filters are shareable
  and survive reload.
- **Parse back from one** (`configureFromQueryString`).
- **Convert to GraphQL variables** (`makeFindFilter`, `makeFilter`).
- **Round-trip to a saved filter** stored server-side.

URL encoding only emits values that differ from the defaults:

```ts
p: this.currentPage !== DEFAULT_PARAMS.currentPage ? String(this.currentPage) : undefined,
```

so a default view has a clean URL. Criteria are encoded as repeated `c=` parameters.

Each criterion type is a class in
[`criteria/`](../../ui/v2.5/src/models/list-filter/criteria/) extending `Criterion`,
responsible for its own encode/decode, its GraphQL shape, and its label. Per-entity
available criteria and sort options are declared in `scenes.ts`, `performers.ts`, etc.,
assembled by `factory.ts`.

**Adding a filter criterion is a two-sided change**: a criterion class and its
registration here, plus a handler in `pkg/sqlite/<entity>_filter.go`. See
[the recipes](recipes.md#adding-a-filter-criterion).

`components/List/` holds the generic list UI — `ItemList`, `ListFilter`,
`FilteredListToolbar`, `EditFilterDialog`, `SavedFilterList` — parameterised per entity.

## The patch system

Most top-level components are wrapped:

```tsx
const ScenePage: React.FC<IProps> = PatchComponent("ScenePage", (props) => { ... });
```

This registers the component under a string name that third-party plugins hook via
`before`/`instead`/`after`. See [plugins](plugins.md#the-patch-system) for the mechanics.

**When editing a patched component: keep the wrapper and keep the name.** Removing either
breaks plugins silently — no compile error, no runtime error, the patch just stops
running. `PatchContainerComponent` slots render nothing by themselves and exist purely as
injection points; don't delete them as dead code.

## i18n

`react-intl`, with message IDs in `src/locales/`.

- **`en-GB.json` is the only file you edit.** Alphabetical order.
- Every other locale comes from Codeberg Weblate. Add a key elsewhere only if it
  genuinely differs from en-GB.
- `custom-locales.json` lets users override strings at runtime, served by the
  `/customlocales` endpoint.

## Conventions

- **Lint/format is Biome** ([`biome.jsonc`](../../ui/v2.5/biome.jsonc)) plus stylelint for
  SCSS. Not ESLint, not Prettier.
- **There is no test runner.** `pnpm run test` does not exist despite the stale CRA text
  in the UI README. Verification is `biome` + `tsc --noEmit` + manual testing.
  `make validate-ui-quick` checks only changed files and skips `tsc`.
- **Route-level code splitting** via `lazyComponent()` around dynamic imports in
  `App.tsx`. This interacts with plugins — `pluginApi.tsx` force-loads components that a
  plugin page might need before they'd naturally be imported.
- **User-visible changes need a changelog entry** in
  `src/docs/en/Changelog/v0310.md` (highest-numbered file is the release in development;
  note `v0310` = 0.31, sorting above `v0300`).

## Where things live

| Task | Place |
|---|---|
| New page | `components/<Entity>/`, route in `App.tsx` |
| New GraphQL operation | `ui/v2.5/graphql/`, then `make generate-ui` |
| Filter criterion | `models/list-filter/criteria/` + entity filter options |
| Shared UI element | `components/Shared/` |
| Setting | `components/Settings/` |
| Cross-cutting state | `hooks/` (see `Config.tsx`, `Toast.tsx`, `Interactive/`) |
| New string | `locales/en-GB.json`, alphabetical |

## Dev loop

```bash
make server-start   # backend on :9999 with ./.local config
make ui-start       # Vite on :3000, proxying to the backend
```

Vite HMR is fast; the `RegisterComponent` duplicate check is deliberately relaxed in dev
builds so hot reload doesn't throw.
