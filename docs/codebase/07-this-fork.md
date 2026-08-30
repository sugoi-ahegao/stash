# 07 — This fork (`main-sugoi-ahegao`)

Everything that diverges from upstream `develop` on this branch, why it works the way it
does, and what's load-bearing if you build on it.

```
$ git diff --stat develop...HEAD
 20 files changed, 1326 insertions(+), 34 deletions(-)
```

**The divergence is almost entirely frontend.** No Go source, no GraphQL schema, no
migration. The one backend file touched (`pkg/stashbox/graphql/generated_models.go`) is a
regeneration artefact, not a hand edit.

That's a deliberate and comfortable position to be in: rebasing onto upstream `develop`
should rarely conflict outside `ui/v2.5`.

## What was added

```
  NEW  ui/v2.5/src/components/Landing/
         Landing.tsx           the /landing page
         FeaturedCarousel.tsx  the carousel + hold-to-reveal slide  (337 lines)
         featuredGroup.ts      constants: group id + custom-field names
         featuredPolicy.ts     the unlock/removal rules
         styles.scss           carousel styling (296 lines)

  MOD  App.tsx, MainNavbar.tsx, List/views.ts    wire up the /landing route
  MOD  graphql/queries/scene.graphql             2 new queries
  MOD  Scenes/SceneDetails/Scene.tsx             stamp custom fields on featured toggle
  MOD  List/ListViewOptions.tsx,                 thumbnail visibility toggle
       List/FilteredListToolbar.tsx,
       Scenes/SceneList.tsx, Scenes/styles.scss
  MOD  utils/text.ts, criteria/criterion.ts,     relative date expressions in filters
       List/Filters/TimestampFilter.tsx
  MOD  locales/en-GB.json, index.scss
```

Three independent features. Take them one at a time.

---

## Feature 1 — The featured carousel

### The data model, and its one hardcoded assumption

There is no new schema. The feature is built entirely on **an existing Group** plus **two
custom fields** — exactly the "use the sanctioned extension surfaces" approach from doc 06.

`featuredGroup.ts`:

```ts
export const FEATURED_GROUP_ID = "25";                          // ⚠️ hardcoded
export const FEATURED_ADDED_AT_FIELD = "featured_added_at";
export const FEATURE_UNLOCKED_AT_FIELD = "feature_unlocked_at";
```

⚠️ **`FEATURED_GROUP_ID = "25"` is a hardcoded row ID in one specific library.** The file
says so honestly. This is the single biggest portability blocker: the branch will show an
empty carousel on any other database. The obvious fix is an `IUIConfig` key
(`featuredGroupId?: string`) — which needs no backend change at all (doc 05), just a
Settings control and a fallback.

A scene's carousel state lives in its custom fields:

```
   featured_added_at    ISO timestamp   set when the scene joins the featured group
                                        → drives carousel ordering
   feature_unlocked_at  ISO timestamp   set when hold-to-reveal completes
                                        → absent/null means the slide is still frosted
```

### Lifecycle

```
   ┌──────────────────────────────────────────────────────────────────────┐
   │  User adds a scene to the "featured" group on the scene detail page  │
   └───────────────────────────────┬──────────────────────────────────────┘
                                   │  Scene.tsx onSave() diffs groups before/after
                                   ▼
              stamps custom_fields.featured_added_at = now
              + fires mutateMetadataGenerate for that scene
                (sprites, phashes, previews, covers, markers — no overwrite,
                 so the carousel always has a preview video to play)
                                   │
                                   ▼
   ┌──────────────────────────────────────────────────────────────────────┐
   │  /landing → FeaturedCarousel                                         │
   │    FindFeaturedScenes(groups INCLUDES 25, per_page: -1)              │
   │    sort client-side by featured_added_at desc, take 10               │
   └───────────────────────────────┬──────────────────────────────────────┘
                                   │
              ┌────────────────────┴────────────────────┐
              ▼                                         ▼
   ┌────────────────────────┐              ┌────────────────────────────┐
   │  Slide is LOCKED       │              │  Slide is UNLOCKED         │
   │  (no feature_unlocked_at)│            │  frosted glass removed     │
   │  frosted <SlideGlass/>  │             │  after 1s, preview video   │
   │  hold 2s to reveal ────►│             │  autoplays                 │
   └────────────────────────┘              └────────────────────────────┘
                                   │
                                   ▼
   ┌──────────────────────────────────────────────────────────────────────┐
   │  Removal sweep (lazy, on every carousel render)                      │
   │    shouldRemoveFromFeatured(scene):                                  │
   │      • scene has a rating          → remove (it served its purpose)  │
   │      • unlocked, unrated, > 7 days → remove (had its chance)         │
   │    → removes from group + deletes BOTH custom fields                 │
   └──────────────────────────────────────────────────────────────────────┘
```

### The unlock budget

`MAX_UNLOCKS_PER_DAY` (`featuredPolicy.ts`) — nominally `3`; currently raised, with a
`TEMP` comment marking it for revert. Enforced by counting, not by storing a counter:

```
   unlockedToday = CountScenesByCustomField(
                     feature_unlocked_at GREATER_THAN startOfToday()
                   ).count                       ← library-wide, survives reload
                 + unlockedThisSession           ← local, covers query-cache lag
```

That second term is the interesting bit. The count query won't have refetched immediately
after an unlock, so the component tracks in-session unlocks separately and adds them. It's
a deliberate belt-and-braces against double-spending the daily budget.

⚠️ Counting *library-wide* rather than *within the group* is intentional: a scene can be
unlocked and then removed by policy, and it should still count against the day.

### Design notes worth preserving

- **Lazy enforcement.** There is no background job. Removal rules run in a `useEffect`
  when someone visits the carousel. `removedRef` (a `Set` of scene IDs) guards against
  firing the same mutation twice within a session, and the ID is removed from the set if
  the mutation fails so it can retry. Simple, and correct for a single-user app.
- **Extensible policy.** `removalRules: RemovalRule[]` — a scene leaves the group as soon
  as *any* rule matches. Adding a rule is a one-line append. The two tunables
  (`MAX_UNLOCKS_PER_DAY`, `UNRATED_EXPIRY_DAYS`) are called out at the top of the file —
which is what makes it easy to raise the limit temporarily while testing.
- **react-slick clone workaround.** `FeaturedCarousel` wraps each `<FeaturedSlide>` in a
  bare `<div key>`, because react-slick clones its direct children and injects inline
  `width`/`display` onto them. The comment in the source explains it; don't flatten that
  extra div.
- **Preview video discipline.** `preload="none"`, plays only when the slide is `active`
  **and** `revealed`, after a 1s delay, and rewinds to 0 on pause. Ten autoplaying video
  elements would otherwise be a real performance problem.
- **Custom field update modes.** Note the two different shapes used:
  `custom_fields: { partial: {...} }` to set one key (on unlock),
  `custom_fields: { full: {...} }` to replace the map (in `Scene.tsx`), and
  `custom_fields: { remove: [...] }` to delete keys (in the removal sweep). Picking the
  wrong one silently clobbers unrelated fields.

### Known rough edges

| | |
|---|---|
| ⚠️ | `FEATURED_GROUP_ID` hardcoded to `"25"` — not portable |
| ⚠️ | `per_page: -1` fetches **every** scene in the group, then slices to 10 client-side. Fine at current group sizes; it's an unbounded query as the group grows. Sorting server-side isn't possible today because the sort key is a custom field. |
| ⚠️ | Several `.catch(() => {})` swallow mutation failures silently — an unlock that fails to persist still looks unlocked until reload |
| ⚠️ | `mutateMetadataGenerate` is fired and forgotten on featuring a scene; if generation fails the slide falls back to the screenshot with no preview |
| ⚠️ | `Landing.tsx` renders a full `SceneList` under the carousel with `View.Landing`, so it has its own persisted sort/zoom — that part is correctly done |

---

## Feature 2 — Thumbnail visibility toggle

An eye/eye-slash button in the list view options that hides scene grid thumbnails.

```
  SceneList.tsx        useState(showThumbnails)  ← local state, default false
        │
        ├─ className: "hide-thumbnails" on .item-list-container
        │       └─ Scenes/styles.scss does the actual hiding + hover reveal
        │
        └─ passes showThumbnails / onSetShowThumbnails down through
              FilteredListToolbar → ListViewOptions → ThumbnailToggleButton
                 (rendered only when displayMode === DisplayMode.Grid)
```

The plumbing is written generically — `ListViewOptions` and `FilteredListToolbar` take
optional props and render the button only when both are supplied — so other entity lists
can opt in by adding the same two props.

⚠️ **The state is component-local and resets on navigation.** If it should persist, it
belongs in `IUIConfig` (per-view, alongside zoom and display mode) rather than `useState` —
see doc 05 on saved UI options. This is the natural next step for the feature.

---

## Feature 3 — Relative date expressions in timestamp filters

Lets you type `today - 30 days` into any timestamp filter instead of an absolute date.

```
  utils/text.ts                    resolveRelativeDate(input): Date | null
        │   /^(today|now|yesterday|tomorrow)\s*(?:([+-])\s*(\d+)\s*(unit))?$/i
        │   units: day|d, week|w, month|mo, year|y  (singular/plural)
        │
        ▼
  criteria/criterion.ts            TimestampCriterion.transformValueToInput()
        │   tries resolveRelativeDate FIRST, falls back to the existing
        │   ISO-format regex — so absolute dates keep working unchanged
        ▼
  List/Filters/TimestampFilter.tsx placeholder hints show the syntax
```

⚠️ **The expression is resolved to a concrete timestamp at entry time, not stored as an
expression.** So a saved filter for `today - 30 days` freezes to the date it was created —
it does not stay relative. Making it stay relative would mean persisting the expression in
the criterion value and resolving it at query time, which is a meaningfully larger change
(it touches the URL/saved-filter round-trip described in doc 05).

⚠️ The hint string in `TimestampFilter.tsx` is a hardcoded English literal, not an i18n
message. It should move to `locales/en-GB.json` before this goes anywhere near upstream.

---

## If you're taking this upstream

Read the "Project norms" section of doc 06 first. Against Stash's stated design vision:

- **Feature 3 (relative dates)** is the most upstreamable — small, general, improves an
  existing filter. Needs the i18n fix and tests.
- **Feature 2 (thumbnail toggle)** is plausible — but expect a request to persist it in
  UI config and to apply it consistently across entity lists rather than scenes only.
- **Feature 1 (featured carousel)** is the hardest sell as core: it's opinionated,
  library-specific, and the docs explicitly say superfluous features should be
  "considered for third-party plugins instead". The good news is that it is *already*
  written the way a plugin would be — group + custom fields + UI only, no schema — so
  porting it to the plugin API (`PatchComponent`, `registerRoute`, `IUIConfig` for the
  group ID) is a realistic path rather than a rewrite.

## Rebasing onto upstream

The files most likely to conflict, in order:

```
  ui/v2.5/src/components/Scenes/SceneList.tsx        large, actively developed upstream
  ui/v2.5/src/components/List/ListViewOptions.tsx    ditto
  ui/v2.5/src/models/list-filter/criteria/criterion.ts
  ui/v2.5/src/App.tsx, MainNavbar.tsx, locales/en-GB.json   small, mechanical
```

`pkg/stashbox/graphql/generated_models.go` should be resolved by **regenerating**
(`make generate-stash-box-client`), never by merging hunks.

Everything under `components/Landing/` is new files and will never conflict.
