# 05 — Frontend architecture (`ui/v2.5`)

React 18 + TypeScript + Vite + Apollo Client + React-Bootstrap + SCSS + react-intl.
Routing is `react-router-dom` v5 (note: **v5**, so `Switch`/`component=`, not v6 `Routes`).

> This doc covers the frontend's **frameworks**. For the **component inventory** — page
> archetypes, the card system, the player, dialogs, and the Apollo cache-invalidation
> contract — see [doc 08](08-frontend-components.md).

## Build & dev

```
  make pre-ui      pnpm install (once)
  make generate-ui regenerate src/core/generated-graphql.ts from the schema + documents
  make ui          production build → embedded into the Go binary
  make ui-start    Vite dev server on :3000, proxying to a Stash server on :9999
  make validate-ui lint + typecheck + tests (biome + tsc)
  make fmt-ui      format
```

⚠️ `make ui-start` **cannot send auth credentials** (cross-origin cookie restriction). Run
your dev server with authentication disabled.

## Application shell

```
  index.tsx
    └─ App.tsx
         ├─ ApolloProvider          createClient.ts — HTTP link + WS link + upload link
         ├─ IntlProvider            locales/*.json, en-GB is the source of truth
         ├─ ConfigurationProvider   hooks/Config.tsx — server config + UI config blob
         ├─ ToastProvider, LightboxProvider, InteractiveProvider
         ├─ MainNavbar
         └─ <Switch>                App.tsx:255-280
               /scenes /images /galleries /performers /tags /studios /groups
               /stats /settings /setup /migrate /sceneFilenameParser ...
               (all lazy-loaded via lazyComponent())
```

Every top-level page is code-split (`utils/lazyComponent.ts`). If you add a route, add it
lazily — the bundle is already large.

## The list framework — the heart of the UI

Seven entity pages share one composition of contexts. Understanding this once explains
`SceneList.tsx`, `PerformerList.tsx`, `TagList.tsx` and the rest.

```
  ┌─ FilterContext ──────────────────────────────────────── FilterProvider.tsx ─┐
  │   { filter: ListFilterModel, setFilter }                                    │
  │   SetFilterURL wraps setFilter so every change writes the URL query string  │
  │                                                                             │
  │  ┌─ QueryResultContext ───────────────────────────────── ListProvider.tsx ─┐ │
  │  │   effectiveFilter  = filterHook?.(filter.clone()) ?? filter             │ │
  │  │   result           = useResult(effectiveFilter)      ← the Apollo query │ │
  │  │   cachedResult     = last non-loading result         ← stops flicker    │ │
  │  │   items, totalCount                                                     │ │
  │  │                                                                         │ │
  │  │  ┌─ ListContext ──────────────────────────────────── ListProvider.tsx ─┐│ │
  │  │  │   selection state: selectedIds, onSelectChange, onSelectAll, ...    ││ │
  │  │  │                                                                     ││ │
  │  │  │   <FilteredListToolbar/>  <FilterTags/>  <Pagination/>              ││ │
  │  │  │   <PagedList> → SceneCardGrid | SceneListTable | SceneWallPanel     ││ │
  │  │  └─────────────────────────────────────────────────────────────────────┘│ │
  │  └─────────────────────────────────────────────────────────────────────────┘ │
  └─────────────────────────────────────────────────────────────────────────────┘
```

`useFilteredItemList` (`components/List/ItemList.tsx:29`) is the hook that wires all of
this together and additionally provides: selection helpers, modal state, page-change
scroll-to-top, `useEnsureValidPage` (clamps the page when the result shrinks), and the
list keyboard shortcuts.

### `filterHook` — the sub-list mechanism

`QueryResultContext` accepts a `filterHook` that transforms the filter before querying.
This is how "the scenes tab on a performer page" works: same list machinery, but the hook
injects a `performers: { value: [id] }` criterion. Look at the `View.PerformerScenes` etc.
values in `components/List/views.ts` — each is a distinct *saved-UI-options key* so a
sub-list remembers its own sort and zoom separately from the main list.

⚠️ When you add a new list context, add a `View` enum value for it. Without one, it shares
persisted UI options with whatever view it inherits, and users see confusing state bleed.

### `cachedResult` vs `result`

`result` is the live Apollo result and goes `loading: true` on every filter change.
`cachedResult` retains the previous data so pagination and counts don't flash empty.
**Use `items` for rendering rows, `totalCount` for the pager** — they're already wired to
the right one.

## `ListFilterModel` — the filter object

`src/models/list-filter/filter.ts:44`. One class, instantiated per list, holding:

```
  mode          FilterMode (Scenes | Performers | ...)
  searchTerm    the free-text q
  criteria      Criterion[]         ← the structured filters
  sortBy, sortDirection
  currentPage, itemsPerPage
  displayMode   Grid | List | Wall | Tagger
  zoomIndex
  randomSeed    stable seed for "Random" sort across pages
```

It is treated as **immutable by convention**: mutating methods are called on a `clone()`
and the clone is handed to `setFilter`. Follow this — React state identity depends on it.

### Three serialisation targets

```
                        ┌──────────────────────────────────────────┐
   ListFilterModel ────►│ makeFindFilter() / makeFilter()          │──► GraphQL variables
                        ├──────────────────────────────────────────┤
                        │ getEncodedParams() / makeQueryParameters()│──► URL query string
                        ├──────────────────────────────────────────┤
                        │ makeSavedFilter() / makeSavedUIOptions()  │──► saved_filters row
                        └──────────────────────────────────────────┘

   and back in:  configureFromQueryString()  configureFromSavedFilter()
                 configureFromDecodedParams()
```

⚠️ **All three must round-trip.** If you add a property to `ListFilterModel`, you have
four places to touch: `getEncodedParams`, `configureFromDecodedParams`,
`makeSavedFilter`/`makeSavedUIOptions`, and `clone()`. Miss `clone()` and the value
silently resets on the next filter change — the single most common bug in this file.

### URL encoding quirks

`getEncodedParams` (`filter.ts:345`) JSON-encodes each criterion, then `encodeURI`s it, then
hand-escapes only `? # & ; = +`. This keeps URLs mostly human-readable (you can eyeball a
filter in the address bar) at the cost of a custom decoder. `translateJSON`
(`filter.ts:220`) handles a legacy key-shortening scheme for backwards compatibility with
old bookmarks — don't "clean this up" without accepting that you break saved links.

Defaults are **omitted** from the URL (`perPage`, `disp`, `p`, `z` only appear when they
differ from `DEFAULT_PARAMS`), which is why a fresh list has a clean URL.

## Criteria — the filter type system

`src/models/list-filter/criteria/`. Each criterion type is a class pair:

```
  CriterionOption   describes the filter: its type key, label, input widget,
                    which modifiers it supports
        │
        ▼
  Criterion         an instance: option + modifier + value
                    knows how to encode itself to query params, to GraphQL,
                    and to a human-readable label
```

```
  Criterion (abstract)                        criterion.ts:63
    └─ ModifierCriterion<V>                   criterion.ts:101   adds a CriterionModifier
         ├─ StringCriterion                   text
         │    ├─ BooleanCriterion
         │    └─ StringBooleanCriterion
         ├─ MultiStringCriterion              lists of strings
         ├─ NumberCriterion                   INumberValue {value, value2}
         │    └─ DurationCriterion            seconds, rendered as HH:MM:SS
         ├─ DateCriterion                     IDateValue
         ├─ TimestampCriterion                ITimestampValue
         ├─ ILabeledIdCriterion               performers, groups — id+label pairs
         └─ IHierarchicalLabeledIdCriterion   tags, studios — adds depth + excludes
```

Registration happens per entity in `src/models/list-filter/scenes.ts` (and siblings), which
build the `criterionOptions` array consumed by `filter-options.ts` and `factory.ts`.

⚠️ `UnsupportedCriterion` (`criterion.ts:1241`) exists so that a saved filter referencing a
criterion this build doesn't know about degrades gracefully instead of crashing the page.
If you rename a criterion type key, every saved filter using it becomes "unsupported".
Treat type keys as a persisted format.

### Adding a frontend filter

```
 1. criteria/my-thing.ts     — define MyThingCriterionOption + MyThingCriterion
                               (or reuse createStringCriterionOption / createNumberCriterionOption…)
 2. models/list-filter/scenes.ts  — add the option to the entity's criterionOptions
 3. models/list-filter/factory.ts — map the type key → your Criterion class
 4. locales/en-GB.json       — add the label under `criterion.*`
 5. (optional) components/List/Filters/MyThingFilter.tsx — a custom editor widget,
                               plus a Sidebar* variant if it belongs in the filter sidebar
```

The backend half is doc 03.

## Data access

```
  graphql/
    data/*.graphql          fragments (SceneDataFragment, SceneSlimDataFragment, …)
    queries/*.graphql       queries
    mutations/*.graphql     mutations
    subscriptions.graphql   job progress, logging
          │
          │  make generate-ui   (graphql-codegen, config in codegen.ts)
          ▼
  src/core/generated-graphql.ts    types + useXxxQuery / useXxxMutation hooks
          │
          ▼
  src/core/StashService.ts         thin wrappers adding cache-eviction & refetch policy
```

⚠️ **Never import generated hooks directly for mutations.** Go through `StashService.ts` —
it centralises Apollo cache invalidation. A mutation that bypasses it leaves stale lists on
screen until a hard refresh. The mechanics (`evictQueries` / `evictTypeFields` /
`deleteObject` / `updateStats`, and how to work out a mutation's blast radius) are in
[doc 08](08-frontend-components.md#the-interaction-that-bites-apollo-cache-invalidation).

⚠️ `*_slim` fragments exist for list views and omit expensive relationships. Adding a field
to the full fragment does *not* add it to the slim one. Check which the list query uses
before wondering why your field is undefined.

### Fragments and `onFieldTypeConflict`

`codegen.ts` sets `onFieldTypeConflict: (_existing, other) => other`, i.e. later
definitions win rather than erroring. This makes the codegen tolerant, but it also means a
genuine fragment conflict fails silently at codegen time and shows up as a wrong TypeScript
type. If a generated type looks wrong, suspect a duplicated field name across fragments.

## Configuration on the frontend

```
  useConfigurationContext()          hooks/Config.tsx
      ├─ configuration.general       backend settings (paths, ffmpeg, …)
      ├─ configuration.interface     interface settings the backend knows about
      ├─ configuration.ui            ← the free-form blob, typed as IUIConfig
      └─ configuration.plugins
```

`IUIConfig` (`src/core/config.ts:43`) is the **cheapest place to add a persisted setting**:
the backend stores it as an opaque map, so adding a key needs no Go change, no migration,
and no schema change. Write with the `configureUI` mutation.

It holds `frontPageContent`, `defaultFilters` (per `View`), rating system options, preview
volume, and per-view saved UI options.

⚠️ Comment in `config.ts:14`: *"double capitals aren't converted correctly in the backend"*.
Avoid keys like `showURLs` — use `showUrls`.

## The plugin patch system

`src/patch.tsx` — this is how community UI plugins modify the app without forking it, and
it constrains how you write components.

```
  PatchComponent("SceneCard", SceneCard)
        │
        ├─ wraps the component in a Proxy
        └─ registers it in the global `components` registry

  A plugin can then call:
        before("SceneCard", fn)    → transform the props before render
        instead("SceneCard", fn)   → replace it (fn receives args + next())
        after("SceneCard", fn)     → transform the returned element
```

`PatchFunction` (`patch.tsx:83`) applies all three in order. `instead` handlers chain via
`runInstead` — each must call the supplied `next()` or the chain stops.

`src/pluginApi.tsx` exposes the module surface plugins may use (React, Apollo, Bootstrap,
GQL, StashService, the patch functions, common hooks). Plugins get these off a global
rather than bundling their own copies.

⚠️ **Consequences for your code:**
- A component registered with `PatchComponent` has a **stable public name** that plugins
  depend on. Renaming or removing one is a breaking change for the plugin ecosystem.
- `PatchComponent` throws on duplicate registration in production builds (it's permitted in
  dev to allow hot reload) — so a component name must be unique app-wide.
- Use `PatchContainerComponent` for components whose *children* plugins want to extend
  (e.g. adding a nav item or a settings section).

## Styling

Global SCSS entry: `src/index.scss`, which imports per-area stylesheets
(`components/Scenes/styles.scss`, etc.). Bootstrap variables are overridden in
`src/styles/`. There is **no CSS module or CSS-in-JS** — class names are global, so prefix
new ones with the component area.

Themes are user-supplied CSS injected via the `/css` route, meaning **your class names are
a public API too**. Community themes target them.

## i18n

`src/locales/en-GB.json` is the source; every other locale is translated on Weblate and
should not be hand-edited in PRs. Add new strings to `en-GB.json` only, and use
`<FormattedMessage id="..."/>` or `useIntl().formatMessage`.
