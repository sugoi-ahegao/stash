# 10 — Collections

The **Collections** display mode: one row of scene cards per intake folder. How a collection
is derived, and why it needed no backend change.

## What a collection is

Each library root has an intake folder, `New` in this library, and the top-level folders
inside it are where batches of material get filed. Its name is the **Collections intake
folder** setting (Settings > Interface > This Library, `collectionsFolder` in the UI config,
read through `src/core/forkConfig.ts`); with none set, Collections shows nothing:

```
  /mnt/e/sys.tmp/hades/V2 NYX/Stash Libraries/Stash Production / New / 2025-05-06
  └──────────────── library root (a configured stash) ────────┘ └─┬─┘ └──── collection ────┘
                                                           the intake folder
```

A collection is **one level inside `New`, no deeper**. Its name is often a date the material
was discovered, but just as often a release or pack name:

```
  2025-05-06                      [EvilAngel] Gag Reflex 2
  2026-07-28                      Sophia Burns MegaPACK
  2025-12-06                      RealityKings.January-December.2023.1080p.x265
```

Nothing is assumed about the name. ⚠️ An earlier version of this feature matched only
`\d{4}-\d{2}-\d{2}` folder names; on this library that recognised 102 of 154 collections and
silently dropped every pack-named one. **Don't reintroduce a name pattern.**

### A collection is a name, not a folder

The same name can exist under more than one root, and those are **one** collection holding
the scenes from all of them:

```
  /mnt/e/.../New/2025-05-06  ─┐
                              ├─►  collection "2025-05-06"
  /mnt/f/.../New/2025-05-06  ─┘
```

Six collections currently do this, and one of them (`Digital Playground`) is pack-named — so
this is not a date-only concern.

### What is not a collection

- Anything under a sibling of `New` (`Organized`, `Coalesce`). Those hold material that has
  already been dealt with; discovery is about what hasn't. About 39% of the library's scenes
  live there and belong to no collection, by design.
- Anything deeper than one level inside `New` — those scenes belong to the collection above
  them, via `depth: -1`.
- ⚠️ Folders whose *name* is itself an absolute Windows path, e.g. a directory literally
  called `E:\sys.tmp\...\New\2025-01-24` sitting inside `New/`. There are 32 of these, all
  holding zero scenes — debris from a copy that went wrong on the Windows side. They are
  dropped by `WINDOWS_PATH_NAME` in `collections.ts`. Without that filter their rows render
  blank (a zero-count row renders nothing) **while still consuming a slot on the page**, so
  pages silently show fewer than ten rows.

## Why there is no backend change

- **The roots come from config.** `configuration.general.stashes` is already in the UI's
  config context, so the library roots need no query, and the intake folder is a UI
  config setting.
- **One folder query.** `FindCollectionFolders` fetches every folder as `{id, path, basename}`
  (901 rows today). Classification is pure string work against the root paths, which means
  the `New` folders themselves never have to be looked up by id.
- **A collection's scenes are an existing criterion.** `files_filter.parent_folder` is a
  `HierarchicalMultiCriterionInput` handled over `folders.parent_folder_id`
  (`pkg/sqlite/file_filter.go:153-175`), and `FolderCriterion`
  (`ui/v2.5/src/models/list-filter/criteria/folder.ts:32-42`) already maps onto it. So a
  collection row is the *existing* folder criterion with a computed value — no new criterion
  type, nothing new in the persisted URL format.

## The pipeline

```
  configuration.general.stashes ──┐
                                  │
  FindCollectionFolders ──────────┤   (every folder: id, path, basename)
                                  ▼        src/core/collections.ts
  ┌──────────────────────────────────────────────────────────────────────┐
  │  toCollections(folders, { roots, intakeFolder })                     │
  │    keep folders exactly at <root>/New/<name>                         │
  │    drop names that are absolute Windows paths                        │
  │    merge by name across roots  → { name, folders[] }                 │
  └──────────────────────────────┬───────────────────────────────────────┘
                                 │
  FindCollectionSceneStats ──────┤   (only when sorting by a timestamp)
    per scene: updated_at,       │
    last_played_at, folder id    ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │  collectionExtremes()  → min/max updated & played, per collection    │
  │  sortCollections()     → desc ranks by max, asc ranks by min         │
  └──────────────────────────────┬───────────────────────────────────────┘
                                 ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │  SceneCollectionPanel        (DisplayMode.Collections)               │
  │    its own sort control, slices to COLLECTIONS_PER_PAGE, owns its    │
  │    own pagination                                                    │
  │    one <SceneRecommendationRow> per collection, whose filter is      │
  │      collectionFilter(collection, theListsCurrentFilter)             │
  └──────────────────────────────────────────────────────────────────────┘
```

## It is a display mode, and that has consequences

`DisplayMode.Collections` sits alongside Grid / List / Wall / Tagger, so collections compose
with the whole filter system: filter the list to a performer and every row narrows to that
performer, with non-matching collections rendering nothing.

But the other display modes are handed `scenes` — the current page of the list's own query —
and simply render it. **This one ignores that page.** Collections are folders, so it pages
over folders and each row issues its own scene query. Two accommodations in
`SceneList.tsx` follow from that:

- The `scenes.length === 0` early return excludes `Collections` (as it already did `Tagger`),
  or an empty scene page would blank the whole mode out.
- `FilteredSceneList` hides the outer `Pagination`/`PaginationIndex` in this mode, because
  they describe scenes while the content is collections. `SceneCollectionPanel` renders the
  same components against its own count instead, so the layout is unchanged.

⚠️ The list's own scene query still runs and its page of scenes is discarded. Harmless, but
it is real wasted work, and it is why `totalCount` in the toolbar would be misleading if the
pagination were left visible.

⚠️ A row whose count is zero renders nothing (`FilteredRecommendationRow.tsx:54`) but still
occupies one of the page's ten slots. With a narrow filter active, a page can therefore look
sparse. Fixing it properly would mean counting every collection server-side — one query per
collection — so it is left as-is.

## Sorting

Collections have **their own sort**, separate from the list's. The list's sort orders scenes
*within* each row; the panel's sort orders the rows. Three keys, both directions each:

| key | ranked by |
|---|---|
| Name | the collection's folder name |
| Updated At | its scenes' `updated_at` |
| Last Played At | its scenes' `last_played_at` |

### Each direction leads with the true extreme

Descending ranks a collection by its **most** recent scene; ascending by its **least** recent
one. So ascending is *not* the exact mirror of descending — each end shows the real extreme.
This follows the precedent already in the backend: the `performer_age` scene sort
(`pkg/sqlite/scene.go`) swaps `MIN` for `MAX` by direction, commented *"When sorting by
performer's age DESC, I should consider the oldest performer instead"*.

### Never played is year 0, not missing data

A scene that has never been played ranks as negative infinity, so never-played collections
**lead ascending** and **trail descending**. This matches the backend on both sides:

- the filter coalesces it explicitly — `IFNULL(last_played_at, datetime(0))`
  (`pkg/sqlite/scene_filter.go:172`);
- the sort leaves it `NULL` (`pkg/sqlite/scene.go:1303`), and SQLite orders NULLs first
  ascending, last descending — the same result.

⚠️ **Last Played At ascending degenerates on a library like this one.** Because ascending
ranks by a collection's *least* recently played scene, any collection holding even one
unplayed scene ranks at negative infinity. Measured here: **138 of 154** collections, so the
sort collapses to the name tiebreak for most of the list. If that is a problem, ranking
ascending by `maxPlayed` instead of `minPlayed` — i.e. making ascending the plain reverse of
descending — narrows the tie to the 43 collections with no plays at all. It is one line in
`sortCollections`. The same effect applies to Updated At on a library whose scenes were all
imported in one batch.

Ties are broken by name ascending, so a large tied block is at least in a readable order.

### Cost

The timestamps come from one extra query, `FindCollectionSceneStats`, which fetches
`{id, updated_at, last_played_at, files { parent_folder { id } }}` for every scene matching
the list's current filter — 416 KB / 0.34 s here, and **skipped entirely while sorting by
name**. Attribution is by parent folder id rather than path, which is both smaller on the
wire and exact; `collectionNamesByFolderId` maps every folder in the library to its
collection, so a scene nested any number of levels inside one still lands in the right row.

⚠️ `collectionExtremes` dedupes a scene's folders before folding, so a multi-file scene whose
files sit in one collection is not counted twice.

## The landing page

`/landing` opens in Collections mode. This is threaded as `defaultDisplayMode` from
`Landing.tsx` → `FilteredSceneList` → `useFilterState` → the `ListFilterModel` constructor,
mirroring how `defaultSort` is already threaded. It is only a *default*: the view persists
whatever mode the user later picks, like any other list.

## Files

```
  NEW  ui/v2.5/src/core/collections.ts                     derivation rules, pure, no React
  NEW  ui/v2.5/src/components/Scenes/SceneCollectionPanel.tsx   the display mode
  MOD  ui/v2.5/graphql/queries/folder.graphql              + FindCollectionFolders
  MOD  ui/v2.5/graphql/queries/scene.graphql               + FindCollectionSceneStats
  MOD  ui/v2.5/src/models/list-filter/types.ts             + DisplayMode.Collections
  MOD  ui/v2.5/src/models/list-filter/scenes.ts            + the mode for scenes
  MOD  ui/v2.5/src/models/list-filter/filter.ts            + defaultDisplayMode option
  MOD  ui/v2.5/src/components/List/util.ts                 thread defaultDisplayMode
  MOD  ui/v2.5/src/components/List/ListViewOptions.tsx     icon, label, "v c" hotkey,
                                                          thumbnail toggle in this mode
  MOD  ui/v2.5/src/components/Scenes/SceneList.tsx         the branch + pagination handling
  MOD  ui/v2.5/src/components/Landing/Landing.tsx          open in Collections
  MOD  ui/v2.5/src/components/Scenes/styles.scss           row gutter
```

`collections.ts` is pure and React-free, the same split as `featuredPolicy.ts` — the rules
are readable and changeable without touching a component. The panel is thin because
`SceneRecommendationRow` already supplies the query, count, skeletons, `SceneQueue`, slider
and "view all" link.

## Traps

| ⚠️ | |
|---|---|
| `depth` defaults to `0` | `IHierarchicalLabeledIdCriterion` defaults `depth: 0` (`criteria/criterion.ts:382`), which matches only files sitting *directly* in the collection folder. `collectionFilter` must set `-1`. Measured here: one collection went from 16 scenes to 6. It fails silently — a short row, no error. |
| Don't match on the name | A date regex drops the 52 pack-named collections. The shape of the name means nothing. |
| Path separators | Rows exist in both `/mnt/e/...` and `E:\...` shapes because the library was scanned from both WSL and Windows. `segmentsBelow` tries both separators, and only paths under a *configured* root count, which is what excludes the stale Windows-rooted rows. |
| `DisplayMode` values are persisted | `types.ts` says to append new enum values to the end. `Collections` is last. Inserting it earlier would silently change every saved view's mode. |
| `per_page: -1` | `FindCollectionFolders` fetches every folder in the library (901 rows), and `FindCollectionSceneStats` every matching scene (416 KB). The same unbounded-query rough edge doc 07 records for `FindFeaturedScenes`. |
| Zoom does nothing here | `SceneRecommendationRow` hardcodes `zoomIndex={1}`, so the zoom slider stays hidden in this mode (`ListViewOptions.tsx`). The thumbnail toggle *does* work, because `.hide-thumbnails` sits on the outer container and the rows render real `SceneCard`s. |

## Where it would go next

- **Include `Organized`/`Coalesce`** behind a toggle, if collections should ever cover the
  whole library rather than the intake area.
