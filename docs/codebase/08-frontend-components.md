# 08 — Frontend component map

Doc 05 covers the *frameworks* (list contexts, `ListFilterModel`, criteria, patching,
config). This doc covers the *components*: what exists, how they nest, and which seams you
work at.

## Directory conventions

```
  components/
    <Entity>/                     one folder per entity — Scenes, Performers, Tags, …
      <Entity>.tsx                the entity's ROUTER (sub-routes under /scenes/*)
      <Entity>List.tsx            the list page
      <Entity>Card.tsx            the grid card
      <Entity>CardGrid.tsx        grid layout wrapper
      <Entity>ListTable.tsx       table display mode
      <Entity>Select.tsx          the "pick one/many" input used everywhere else
      <Entity>RecommendationRow.tsx   front-page row
      Edit<Entity>sDialog.tsx     bulk edit
      Delete<Entity>sDialog.tsx   bulk delete
      <Entity>Details/            the detail page + its panels
      styles.scss

    List/       the list framework          (doc 05)
    Shared/     reusable primitives         (below)
    Settings/   settings pages + settings context
    Dialogs/    app-level dialogs (Generate, Identify, ReleaseNotes)
    ScenePlayer/ the video player
    Tagger/     stash-box match-and-tag workflow
    Wall/       the "wall" display mode
    FrontPage/  the configurable home page
    Landing/    ← added by this fork (doc 07)
```

Recognising these names lets you find any entity's equivalent file instantly. `SceneCard`
↔ `PerformerCard` ↔ `TagCard` all have the same role.

## Page archetypes

Almost every screen is one of three shapes.

### Archetype A — the entity router

Each top-level route delegates to a small router. `components/Scenes/Scenes.tsx`:

```
   /scenes             → SceneList        (view=View.Scenes)
   /scenes/markers     → SceneMarkerList  (view=View.SceneMarkers)
   /scenes/new         → SceneCreate
   /scenes/:id         → Scene            (detail page)
```

All lazy-loaded. `useTitleProps` + `<Helmet>` set the document title at this level.

### Archetype B — the list page

```
  ┌─ SceneList.tsx ── PatchComponent("FilteredSceneList") ────────────────────┐
  │                                                                          │
  │   useFilteredItemList({ filterStateProps, queryResultProps })   ← doc 05  │
  │        │                                                                 │
  │        ├── filter / setFilter        ListFilterModel                     │
  │        ├── items / totalCount        query result                        │
  │        ├── listSelect                selection state                     │
  │        └── modalState                edit/delete/export dialogs          │
  │                                                                          │
  │   ┌── Sidebar ────────────┐  ┌── main pane ──────────────────────────┐   │
  │   │ FilteredSidebarHeader │  │ FilteredListToolbar                   │   │
  │   │ SidebarPerformersFilter│ │   ├ search box                        │   │
  │   │ SidebarStudiosFilter   │ │   ├ ListOperationButtons (edit/delete/│   │
  │   │ SidebarTagsFilter      │ │   │   export/generate/identify/merge) │   │
  │   │ SidebarRatingFilter    │ │   ├ SortBySelect                      │   │
  │   │ SidebarDurationFilter  │ │   └ ListViewOptions (display mode,    │   │
  │   │ SidebarBooleanFilter   │ │        zoom, [thumbnail toggle*])     │   │
  │   │ …                      │ │ FilterTags   (active criteria pills)  │   │
  │   └───────────────────────┘  │ Pagination / PaginationIndex          │   │
  │                              │ PagedList → LoadedContent             │   │
  │                              │    └─ one of the DISPLAY MODES below  │   │
  │                              └───────────────────────────────────────┘   │
  └──────────────────────────────────────────────────────────────────────────┘
                                                        * added by this fork
```

**Display modes** (`DisplayMode` in `models/list-filter/types.ts:14`):

```
   Grid    → SceneCardGrid   → SceneCard × N        the default
   List    → SceneListTable  → ListTable + IColumn[]  (column picker via useTableColumns)
   Wall    → SceneWallPanel  → WallPanel/WallItem     dense hover-preview mosaic
   Tagger  → Tagger          → the stash-box workflow (scenes/performers only)
```

Not every entity supports every mode; each list declares its `displayModeOptions`.

### Archetype C — the detail page

`Scenes/SceneDetails/Scene.tsx` is the richest example (~700 lines). The shape:

```
  ┌─ ScenePage ── PatchComponent("ScenePage") ───────────────────────────────┐
  │                                                                          │
  │   ScenePlayer                 the video player (top of page)             │
  │                                                                          │
  │   header: title, DetailsEditNavbar, OrganizedButton, OCounterButton,     │
  │           RatingSystem, ExternalPlayerButton                             │
  │                                                                          │
  │   <Tab.Container>  ← react-bootstrap tabs                                │
  │      ScenePageTabs = PatchContainerComponent("ScenePage.Tabs")           │
  │        │  ← plugins inject extra <Nav.Item> tabs HERE                    │
  │        ├ Details      SceneDetailPanel                                   │
  │        ├ Queue        QueueViewer                                        │
  │        ├ Markers      SceneMarkersPanel                                  │
  │        ├ Groups       SceneGroupPanel                                    │
  │        ├ Galleries    SceneGalleriesPanel                                │
  │        ├ File Info    SceneFileInfoPanel                                 │
  │        ├ History      SceneHistoryPanel                                  │
  │        ├ Video Filter SceneVideoFilterPanel                              │
  │        └ Edit         SceneEditPanel                                     │
  └──────────────────────────────────────────────────────────────────────────┘
```

Every entity follows this: a header, a tab strip wrapped in a `PatchContainerComponent`, a
read-only details panel, and a separate **edit panel**. Editing is a *tab*, not a modal —
that's a deliberate app-wide convention.

Shared detail-page furniture lives in `Shared/DetailsPage/`: `DetailTitle`, `HeaderImage`,
`BackgroundImage`, `AliasList`, `Tabs`. `Shared/DetailItem.tsx` renders one label/value row
— use it rather than hand-rolling markup, so detail pages stay visually consistent.

## The card system

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │ GridCard            Shared/GridCard/GridCard.tsx                     │
  │   The chrome every card shares:                                      │
  │     url, title, image, details, overlays, popovers                   │
  │     selection checkbox + shift-click range select                    │
  │     drag-to-reorder (objectId + onMove)                              │
  │     resume-time / duration progress bar, interactive heatmap strip   │
  └───────────────────────────────▲──────────────────────────────────────┘
                                  │ composed by
  ┌───────────────────────────────┴──────────────────────────────────────┐
  │ SceneCard   PerformerCard   TagCard   StudioCard   GroupCard  …      │
  │   supply the entity-specific image, overlays and popovers            │
  └───────────────────────────────▲──────────────────────────────────────┘
                                  │ laid out by
  ┌───────────────────────────────┴──────────────────────────────────────┐
  │ SceneCardGrid …                                                      │
  │   useContainerDimensions() → container width                         │
  │   useCardWidth(width, zoomIndex, zoomWidths) → per-card px width     │
  │     zoomWidths = [280, 340, 480, 640]   ← per entity                 │
  └──────────────────────────────────────────────────────────────────────┘
```

Cards are width-driven, not breakpoint-driven: the grid measures its container with a
`ResizeObserver` (debounced) and computes a card width from the zoom level. That's why zoom
works smoothly and why cards reflow correctly inside the sidebar layout.

⚠️ `GridCard`, every `*Card` and every `*CardGrid` are registered with `PatchComponent`.
Their names are a public API for plugins (doc 05).

Card hover previews come from `PreviewScrubber.tsx` / `HoverScrubber.tsx`, which scrub the
sprite sheet generated by the backend — no video is loaded until you hover.

## Shared primitives worth knowing before you build anything

| Component | Use it for |
|---|---|
| `Shared/Modal.tsx` | every dialog — don't use raw `<Modal>` from bootstrap |
| `Shared/Icon.tsx` | FontAwesome wrapper; icons are imported individually (tree-shaking) |
| `Shared/LoadingIndicator.tsx` | all loading states |
| `Shared/ErrorMessage.tsx`, `Alert.tsx` | error surfaces |
| `Shared/TruncatedText.tsx` | clamped text with a hover popover |
| `Shared/HoverPopover.tsx` | the popover used by every card |
| `Shared/CollapseButton.tsx` | expandable sections |
| `Shared/Rating/` | the rating widget — respects the configured rating system (stars/decimal) |
| `Shared/FavoriteIcon.tsx`, `SuccessIcon.tsx`, `CountButton.tsx`, `Counter.tsx` | small stateful affordances |
| `Shared/DateInput.tsx`, `DurationInput.tsx`, `PercentInput.tsx`, `StringListInput.tsx`, `URLField.tsx`, `ThreeStateCheckbox.tsx`, `IndeterminateCheckbox.tsx`, `DoubleRangeInput.tsx`, `ClearableInput.tsx` | form inputs — the app has its own set; use them |
| `Shared/Select.tsx`, `FilterSelect.tsx` | react-select wrappers with Stash styling |
| `<Entity>Select.tsx` | typeahead entity pickers (`PerformerSelect`, `SceneSelect`, …) |
| `Shared/CustomFields.tsx` | renders/edits the custom-fields map (doc 04) |
| `Shared/TagLink.tsx`, `StudioLogo.tsx`, `CountryFlag.tsx`, `DetailImage.tsx` | entity chrome |
| `Shared/BulkUpdate.tsx`, `MultiSet.tsx`, `BatchModals.tsx` | bulk-edit machinery (see below) |
| `Shared/DeleteEntityDialog.tsx`, `DeleteFilesDialog.tsx` | deletion flows |
| `Shared/ExportDialog.tsx` | JSON export |
| `Shared/FolderSelect/` | server-side directory browser (used by Setup and Settings) |
| `Shared/PackageManager/` | plugin/scraper install UI |

## Cross-cutting systems

### 1. `SceneQueue` — playback continuity

`models/sceneQueue.ts`. The bridge between a **list** and the **player**: clicking a scene
in a filtered list should let you advance through *that filter's* results, not all scenes.

```
  SceneQueue.fromListFilterModel(filter)        or   fromSceneIDList(ids)
        │  stores a CLONE of the filter, forced to itemsPerPage = 40,
        │  plus the original page/pageSize
        ▼
  serialised into the scene URL as  qsort / qsortd / qfq / qfc / qfp / qs
        ▼
  /scenes/123?qfc=...&qfp=2
        ▼
  Scene.tsx reconstructs the queue, QueueViewer renders it,
  next/prev re-query the filter and cross page boundaries automatically
```

The page-recalculation in `makeQueryParameters` exists because the queue re-pages at 40
items regardless of the list's own page size — it maps a scene's index in the *original*
paging onto the *queue's* paging.

⚠️ If you add a new way to open a scene, build a `SceneQueue` for it. Otherwise next/prev
silently do nothing.

### 2. `ScenePlayer` — video.js plus ten local plugins

`components/ScenePlayer/`. A video.js instance with a stack of small plugin modules, each
its own file, registered by import side-effect:

```
   live.ts            HLS/DASH live-stream handling
   source-selector.ts pick between direct / mp4 / webm / HLS / DASH sources
   markers.ts         marker pins on the timeline
   vtt-thumbnails.ts  hover-scrub thumbnails from the sprite VTT
   big-buttons.ts     large touch targets
   PlaylistButtons.ts next/prev, wired to SceneQueue
   persist-volume.ts  volume across sessions
   autostart-button.ts
   track-activity.ts  reports play duration / resume time back to the server
   vrmode.ts          VR projection modes
   media-session.ts   OS media keys & lock-screen metadata
   wake-sentinel.ts   screen wake lock
   + airplay, chromecast, abloop, mobile-ui, seek-buttons (third-party)
```

`ScenePlayerScrubber.tsx` is the filmstrip below the player.

⚠️ The player is the least React-idiomatic part of the app — it's imperative video.js code
inside a `PatchComponent`. Add features as a **new plugin file**, following the existing
ones, rather than growing `ScenePlayer.tsx`.

⚠️ `track-activity.ts` is what makes play count, o-count and resume time work. Changing
playback wiring can silently break those statistics.

### 3. Lightbox — image viewing

`hooks/Lightbox/`. Provided app-wide via `LightboxProvider`; opened through hooks rather
than by rendering a component:

```
   useLightbox({ images, showNavigation, ... })   → open at an index
   useGalleryLightbox(galleryId, chapters)        → paginated gallery viewer
   useGalleriesLightbox()
```

`LightboxLink` wraps a thumbnail so clicking it opens the lightbox. Supports zoom/pan,
slideshow, chapter navigation, and scroll modes.

### 4. Tagger — the stash-box workflow

`components/Tagger/`. Reached as a *display mode* on scene and performer lists. Its own
context (`Tagger/context.tsx`) holds match state across the whole page while you:

```
   query stash-box → review candidate matches → field-by-field accept/reject → save
```

`scenes/`, `performers/`, `studios/`, `tags/` subfolders hold per-entity match UI.
`TaggerConfig.tsx` exposes its many options. It's the most self-contained feature in the
UI — you can work on it without touching anything else.

### 5. Scrape dialogs — the accept/reject pattern

`Shared/ScrapeDialog/`. Every "we scraped some data, which bits do you want?" flow shares
this:

```
   ScrapeDialog
     └─ ScrapeDialogRow × N      old value | new value | ← accept toggle
          ├ ScrapedObjectsRow    for relationships (performers, tags, studios, groups)
          └ CreateLinkTagDialog  create-or-link a missing entity inline
   scrapeResult.ts               the ScrapeResult<T> type: {originalValue, newValue, useNewValue}
```

Used by `SceneScrapeDialog`, `PerformerScrapeDialog`, and the Tagger. If you add a scrapable
field, add a `ScrapeDialogRow` for it — otherwise the field scrapes but can never be applied.

### 6. Bulk edit

Selecting items in any list enables `EditScenesDialog` / `EditPerformersDialog` / …

```
   MultiSet.tsx        the SET / ADD / REMOVE control for relationships
        │              ← mirrors the backend's RelationshipUpdateMode (doc 02)
   BulkUpdate.tsx      shared "leave unchanged vs overwrite" semantics
   utils/bulkUpdate.ts helpers
```

⚠️ The three-way SET/ADD/REMOVE in the UI maps directly onto `UpdateIDs.Mode` in Go. Keep
them aligned — a fourth mode needs both halves.

### 7. Settings

```
   SettingsContext (components/Settings/context.tsx)
        ├ saveGeneral / saveInterface / saveDefaults / saveScraping / saveDLNA
        └ saveUI(input: Partial<IUIConfig>)
              │
              │  all writes are DEBOUNCED and merged into a `pending*` object,
              │  then flushed as one mutation
              ▼
        configureGeneral / configureInterface / configureUI mutations
```

Panels are one file per section (`SettingsLibraryPanel`, `SettingsInterfacePanel/`,
`SettingsSecurityPanel`, `Tasks/`, …), composed from `SettingSection.tsx` + `Inputs.tsx`.

⚠️ Because saves are debounced and merged, **read config from the context, never from your
own `useConfiguration` call** — otherwise you'll read stale values between flushes.

`saveUI` is the entry point for the `IUIConfig` blob (doc 05) — the zero-backend-cost
extension point.

### 8. Front page

`components/FrontPage/`. A user-configured list of rows stored in
`IUIConfig.frontPageContent`:

```
   FrontPage → getFrontPageContent(ui) → Control × N
                                            │
                    ┌───────────────────────┴───────────────────────┐
                    ▼                                               ▼
          ISavedFilterRow                                   ICustomFilter
          (render a saved filter)                    (mode + sortBy + direction)
                    │                                               │
                    └────────────► FilteredRecommendationRow ◄──────┘
                                        └─ <Entity>RecommendationRow
                                              └─ horizontal card carousel
```

`FrontPageConfig.tsx` is the editor. This is the closest upstream analogue to this fork's
Landing page — worth comparing if you ever fold the carousel into the front page instead of
a separate route (doc 07).

## The interaction that bites: Apollo cache invalidation

This is the most important cross-component behaviour in the UI, and it lives in
`core/StashService.ts` (3000 lines, mostly this).

A scene mutation doesn't just change that scene. It can change *counts and membership* on
performers, studios, tags, groups and galleries — all of which may be on screen. So every
mutation declares its blast radius:

```
  mutateCreateScene / sceneUpdate / sceneDestroy …
        │
        └─ update(cache, result) {
               updateStats(cache, "scene_count", +1)         // the global Stats query
               evictTypeFields(cache, sceneMutationImpactedTypeFields)
                    Group:     ["scenes", "scene_count"]
                    Gallery:   ["scenes"]
                    Performer: ["scenes","scene_count","groups","group_count",…]
                    Studio:    ["scene_count","performer_count"]
                    Tag:       ["scene_count"]
               evictQueries(cache, sceneMutationImpactedQueries)
                    FindScenes, FindGroups, FindGalleries,
                    FindPerformers, FindStudios, FindTags
           }
```

Three distinct helpers, doing different things:

| Helper | Effect |
|---|---|
| `evictQueries(cache, [docs])` | deletes the **root query fields** for those documents, then `cache.gc()` — forces a refetch of any list using them |
| `evictTypeFields(cache, {Type: [fields]}, ignore?)` | walks the whole cache and deletes named fields from **every object of that type**; `ignore` spares one cache id (used so the scene you just edited keeps its fresh data) |
| `deleteObject(cache, obj, query)` | writes `null` for the single-object query and evicts the object — for `Destroy` mutations |
| `updateStats(cache, field, diff)` | increments the global `Stats` counters in place |

⚠️ **This is why doc 05 says never call a generated mutation hook directly.** A mutation
that skips `StashService` leaves stale scene counts on performer cards, stale membership in
group panels, and stale list pages — with no error, until a hard refresh.

⚠️ When you add a mutation, work out its blast radius and add it to the impacted lists. When
you add a *field* that's aggregated elsewhere (a new `*_count`), add it to
`sceneMutationImpactedTypeFields`.

## Component interaction, end to end

Following one click through the system:

```
   User clicks a tag pill on a SceneCard
        │
        ▼
   TagLink → history.push(NavUtils.makeTagScenesUrl(tag))     utils/navigation.ts
        │        (builds a /tags/:id?… URL with an encoded criterion)
        ▼
   Router → Tags.tsx → Tag detail page → scenes tab
        │
        ▼
   SceneList with filterHook injecting  tags: {value:[id], modifier: INCLUDES}
        │        and view = View.TagScenes  (its own persisted sort/zoom)
        ▼
   FilterContext → QueryResultContext → useFindScenes(effectiveFilter)
        │
        ▼
   Apollo → POST /graphql → backend filter engine (doc 03)
        │
        ▼
   items → SceneCardGrid → SceneCard × N
        │
        ▼
   User clicks a card → SceneQueue.fromListFilterModel(filter)
        │
        ▼
   /scenes/:id?qfc=…&qfp=1 → ScenePage → ScenePlayer + QueueViewer
```

`utils/navigation.ts` is the layer that builds these criterion-carrying URLs. **Use it
rather than hand-building URLs** — it keeps the encoding in sync with `ListFilterModel`
(doc 05).

## Where to add what

```
  A new column in a list table            → <Entity>ListTable.tsx, add an IColumn
  A new card overlay/badge                → <Entity>Card.tsx (not GridCard)
  A new detail tab                        → <Entity>Details/, add a Nav.Item + Tab.Pane
  A new bulk operation                    → Edit<Entity>sDialog + ListOperationButtons
  A new form input type                   → Shared/, then reuse everywhere
  A new player capability                 → ScenePlayer/<feature>.ts, imported for effect
  A new front-page row type               → FrontPage/Control.tsx + a RecommendationRow
  A new settings option (backend-backed)  → Settings panel + a GraphQL config field
  A new settings option (UI-only)         → IUIConfig + saveUI — no backend change
  A new sidebar filter                    → List/Filters/Sidebar*.tsx + wire into the list
```

⚠️ Before adding a component, check `Shared/` for an existing one. The most common review
finding on UI work is a hand-rolled input, modal or popover that duplicates a shared
primitive — which then misses the app's styling, keyboard handling and theme support.
