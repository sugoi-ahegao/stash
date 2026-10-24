# 07 — This fork (`main-sugoi-ahegao`)

Everything that diverges from upstream `develop` on this branch, why it works the way it
does, and what's load-bearing if you build on it.

What changed and when is in [`FORK_CHANGELOG.md`](../../FORK_CHANGELOG.md). The current
size of the divergence is a command, not a number to copy here:

```bash
git diff --stat $(git merge-base HEAD upstream/develop)   # everything the fork changes
scripts/upstream-sync status                              # the upstream files it modifies
```

**The divergence is mostly frontend, but no longer exclusively.** The featured-group
lifecycle lives in `internal/api/scene_featured.go`, hooked into
`resolver_mutation_scene.go` by a few `// fork` call sites. View history adds GraphQL
schema, a store and one **fork migration** (`pkg/sqlite/migrations_fork/`, its own stream,
see doc 12). Two more files (`pkg/scene/generate/preview.go`, `pkg/ffmpeg/filter.go`)
change how previews are sized.

Merging upstream is covered by doc 12 and `scripts/upstream-sync`. A rehearsal against 44
upstream commits had no server-side conflicts.

## What was added

```
  NEW  ui/v2.5/src/components/Landing/
         Landing.tsx           the /landing page
         FeaturedCarousel.tsx  the carousel + hold-to-reveal slide  (419 lines)
         featuredGroup.ts      constants: group id + custom-field names
         featuredPolicy.ts     the unlock budget, visibility and removal rules
         styles.scss           carousel styling (296 lines)

  NEW  internal/api/scene_featured.go       featured group id + custom-field names,
                                           membership diffing, generate trigger

  NEW  ui/v2.5/src/core/collections.ts            collection derivation rules (see doc 10)
  NEW  ui/v2.5/src/components/Scenes/
         SceneCollectionPanel.tsx                 the Collections display mode
  MOD  ui/v2.5/graphql/queries/folder.graphql     + FindCollectionFolders
  MOD  list-filter/{types,scenes,filter}.ts,      register the mode, thread
       List/{util,ListViewOptions}.tsx,             defaultDisplayMode
       Scenes/SceneList.tsx

  MOD  App.tsx, MainNavbar.tsx, List/views.ts    wire up the /landing route
  MOD  graphql/queries/scene.graphql             2 new queries
  MOD  internal/api/resolver_mutation_scene.go   `// fork` call sites: the featured
                                                 lifecycle on every scene update path
  NEW  internal/api/resolver_mutation_scene_view.go,   view history (Feature 4): store,
       pkg/sqlite/history.go (viewedDateManager),    schema, filters, sorts, mutations,
       pkg/sqlite/migrations_fork/1_*.up.sql,        dataloaders, import/export/merge
       pkg/sqlite/fork_migrate.go,
       internal/api/loaders/scene*view*_gen.go
  MOD  Scenes/SceneDetails/Scene.tsx             a page visit records a view
  MOD  Scenes/SceneCard.tsx, core/hoverView.ts,  mark-viewed button; a dwell on a landing
       core/viewed.ts                            card records a view
  MOD  SceneDetails/SceneHistoryPanel.tsx        View History beside play and O history
  NEW  SceneDetails/FeaturedButton.tsx           featured toggle on the scene page
  NEW  components/ThemeSwitcher.tsx,             theme switcher in the navbar: Blueprint
       utils/theme.ts, styles/themes/_pb.scss    (default) and pb, per browser
  MOD  List/ListViewOptions.tsx,                 thumbnail visibility toggle
       List/FilteredListToolbar.tsx,
       Scenes/SceneList.tsx, Scenes/styles.scss
  MOD  utils/text.ts, criteria/criterion.ts,     relative date expressions in filters
       List/Filters/TimestampFilter.tsx
  MOD  pkg/scene/generate/preview.go,            previews at native resolution,
       pkg/ffmpeg/filter.go                       webp capped at 640 (was a hard 640
                                                  for both)
  MOD  MainNavbar.tsx, index.scss,               chrome: flat navbar, shorter slide
       Landing/styles.scss
  MOD  locales/en-GB.json, index.scss
```

Five numbered features below, plus a handful of standalone tweaks. Take them one at a
time. (The theme switcher and featured toggle are recent and only in the table above.)

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
   │  A scene joins the "featured" group — scene page, bulk edit, or API  │
   └───────────────────────────────┬──────────────────────────────────────┘
                                   │  the SERVER diffs group membership
                                   │  before/after the update (see below)
                                   ▼
              stamps custom_fields.featured_added_at = now
              + queues a generate job for that scene
                (sprites, phashes, previews, covers, markers — no overwrite,
                 so the carousel always has a preview video to play)
                                   │
                                   ▼
   ┌──────────────────────────────────────────────────────────────────────┐
   │  /landing → FeaturedCarousel                                         │
   │    FindFeaturedScenes(groups INCLUDES 25, per_page: -1)              │
   │    sort client-side by featured_added_at, then walk the list filling  │
   │    up to 10 slots, skipping expired unlocks and any locked slide       │
   │    beyond today's remaining unlock budget                              │
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

### What the carousel actually shows

Three rules decide the slide list, and only one of them touches the database:

| rule | constant | effect | touches the DB? |
|---|---|---|---|
| locked-slide budget | `MAX_UNLOCKS_PER_DAY` = 3 | at most *n* **locked** slides, *n* = unlocks left today | no |
| `isUnlockExpired` | `UNLOCKED_VISIBLE_DAYS` = 3 | unlocked slide stops taking a slot | no |
| `staleUnratedRule` | `UNRATED_EXPIRY_DAYS` = 7 | scene leaves the featured group | yes |

**A slide you can't open isn't shown.** The carousel carries only as many locked slides
as you have unlocks remaining, so spending the day's budget empties the locked half of
the carousel rather than filling it with frosted teases. Already-unlocked slides are
unaffected — they stay for their `UNLOCKED_VISIBLE_DAYS` window.

That makes the steady-state size roughly
`MAX_UNLOCKS_PER_DAY × UNLOCKED_VISIBLE_DAYS` unlocked slides (9, by default) plus
whatever is left of today's budget, capped by `FEATURED_COUNT`. With the budget spent and
nothing unlocked recently, the carousel is empty and `/landing` renders only the scene
list below it.

⚠️ A side effect: `SlideGlass`'s `is-locked-out` state — the frosted "no unlocks left"
styling — is now **unreachable in practice**, because a slide you can't unlock isn't
rendered at all. The prop and CSS are kept as a safety net for the case where the budget
count and the visible list briefly disagree.

A slide you unlocked more than **3 days** ago disappears from the carousel but stays in
the group, so a rating arriving on day 4 still lands on a featured scene and still trips
`ratedRule`. Only at **7 days** unrated does it actually get dropped.

The visible list is built by walking the sorted group and filling `FEATURED_COUNT` slots
rather than slicing the first ten, so skipped slides **backfill** — an expired unlock
gives its slot to the next eligible scene rather than leaving a gap.

⚠️ The removal sweep iterates `consideredScenes` — every scene walked while filling those
slots, *including the ones skipped* — not the visible list. Filtering before the sweep
would leave a hidden slide with nothing to ever remove it, and it would sit in the group
past its 7-day expiry forever. If you change how the visible list is built, keep the
sweep pointed at the wider set.

Because skipped locked slides no longer stop the walk, in the steady state it runs to the
end of the group and the sweep covers **every** scene in it, not just the visible window.
That's better cleanup than before, but it also means a batch of newly-rated scenes fires
one mutation each on the next `/landing` visit. Fine at the group sizes this is built
for; it's another reason the unbounded `per_page: -1` query is on the rough-edges list.

To make the 3-day window remove the scene instead of merely hiding it, move
`isUnlockExpired` into `removalRules`; that makes `staleUnratedRule` dead, since a rated
scene is already removed on sight.

### Where the lifecycle is enforced

**This is server-side, and deliberately so.** It began as client code in
`Scene.tsx`'s `onSave()`, which meant it only ran when you edited a scene from its own
detail page. A **bulk edit** (`EditScenesDialog` → `bulkSceneUpdate`) is a completely
separate path and skipped it entirely — scenes added that way got no
`featured_added_at` stamp and no generation, so they either never appeared in the
carousel or appeared with no preview to play. Removals never cleared the fields at all.

`internal/api/scene_featured.go` now owns it. Its `featuredTracker` is hooked into **all
three** update paths in `resolver_mutation_scene.go` (`SceneUpdate`, `ScenesUpdate` and
`BulkSceneUpdate`) with a few `// fork` lines. The single-scene paths call
`featured.sceneUpdate`, a wrapper around upstream's `sceneUpdate`. The bulk path calls
`featured.before` and `featured.after` around its loop:

```
   for each scene being updated, inside the txn:

     wasFeatured := sceneIsFeatured(scene)      ← featured.before: read BEFORE the update
     ... apply the update, then the input's own custom fields ...
     nowFeatured := applyFeaturedChange(scene, wasFeatured)     ← featured.after
                      │
                      ├─ joined  → custom_fields.partial{ featured_added_at: now }
                      └─ left    → custom_fields.remove[ featured_added_at,
                                                         feature_unlocked_at ]

   after the txn commits:
     featured.generate → generateForFeatured(newlyFeaturedIDs)   ← one job for the batch
```

Three details are load-bearing:

- **Membership is read before *and* after, not inferred from the input.** That makes it
  mode-agnostic: bulk `group_ids` arrives as a `BulkUpdateIds` with `SET`/`ADD`/`REMOVE`,
  and reading actual membership means none of that has to be re-derived.
- **`applyFeaturedChange` runs *after* the input's own custom fields are written.**
  A client sending `custom_fields: { full: {...} }` replaces the whole map; stamping
  first would be silently wiped.
- **Generation is queued after commit, and its error is logged, not returned.** The scene
  update has already succeeded by then; failing the mutation because ffmpeg is unhappy
  would be wrong.

⚠️ **Do not pass `PreviewOptions` to that generate job.**
`getGeneratePreviewOptions` (`internal/manager/task_generate.go`) starts from the
configured preview settings and overrides each one that is non-nil, so passing a pointer
to `0` for `PreviewSegments` yields *zero* segments — an empty concat list and a hard
ffmpeg failure:

```
[concat @ ...] No files to concat
error generating preview: error running ffmpeg command
```

The zeroes in `GenerateDialog.tsx:40-43` look like real defaults but are only initial
placeholder state — lines 74-88 overwrite them from server config before anything is
sent. Leaving `PreviewOptions` nil gets the configured values, which is what's wanted.

### The unlock budget

`MAX_UNLOCKS_PER_DAY` (`featuredPolicy.ts`) — currently `3`. Enforced by counting, not by
storing a counter:

```
   unlockedToday = CountScenesByCustomField(
                     feature_unlocked_at GREATER_THAN startOfToday()
                   ).count                       ← library-wide, survives reload
                 + unlockedThisSession           ← local, covers query-cache lag
```

That second term is the interesting bit, and it is **not** a plain counter.

`useSceneUpdate` evicts `sceneMutationImpactedQueries`, and `evictQueries` deletes cache
fields by *root field name*. Both carousel queries — `FindFeaturedScenes` and
`CountScenesByCustomField` — select `findScenes`, so evicting it for `FindScenes` takes
out both of ours as collateral, and both refetch. A naive `+ unlockedThisSession` counter
therefore double-counts every unlock the moment the refetch lands, spending the day's
budget at twice the stated rate.

So `unlockedThisSession` holds **scene ids**, not a count, and only the ones the group
query hasn't caught up with are added:

```
   pendingUnlocks = ids unlocked this session
                    ∩ scenes still in the group data
                    ∩ scenes whose feature_unlocked_at is still absent
```

Both queries are evicted by the same mutation, so once the group query shows the stamp,
the count query has it too. An id that has left the group entirely is dropped from the
in-session set — the library-wide count is authoritative for it.

Ids rather than a count is also what keeps the slide list stable: a scene unlocked in
this session reads as unlocked *before* its stamp lands, so spending an unlock doesn't
shrink the locked budget out from under a *different* slide and make it vanish mid-session.

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
  **and** `revealed`, after `PREVIEW_DELAY_MS`, and rewinds to 0 on pause. Ten autoplaying
  video elements would otherwise be a real performance problem.
- **Slide pacing.** `SLIDE_DURATION_MS` (10s) and `SLIDE_TRANSITION_MS` (600ms) feed
  react-slick's `autoplaySpeed`/`speed`. The dwell timer pauses on hover and doesn't start
  until the transition finishes, so a slide is up for roughly the sum of the two. Keep
  `SLIDE_DURATION_MS` comfortably above `PREVIEW_DELAY_MS`, or the carousel advances
  before an unlocked slide's preview has started.
- **Custom field update modes.** Note the shapes used:
  `custom_fields: { partial: {...} }` to set one key (on unlock, and on the server when
  a scene joins the group) and `custom_fields: { remove: [...] }` to delete keys (the
  removal sweep, and the server when a scene leaves). Picking the wrong one silently
  clobbers unrelated fields — `{ full: {...} }` replaces the entire map, which is why the
  server stamps *after* applying whatever custom fields the request itself carried.

### Known rough edges

| | |
|---|---|
| ⚠️ | `FEATURED_GROUP_ID` hardcoded to `"25"` — not portable |
| ⚠️ | `per_page: -1` fetches **every** scene in the group, then slices to 10 client-side. Fine at current group sizes; it's an unbounded query as the group grows. Sorting server-side isn't possible today because the sort key is a custom field. |
| ⚠️ | Several `.catch(() => {})` swallow mutation failures silently — an unlock that fails to persist still looks unlocked until reload |
| ⚠️ | The generate job is fired and forgotten on featuring a scene — the error is logged server-side, but nothing retries, and the slide falls back to the screenshot with no preview. `overwrite` is unset, so a scene left with a broken preview by a failed run will be *skipped* rather than repaired on a later featuring; it needs a manual generate with overwrite on. |
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

## Feature 4 — View history, apart from play history

A **view** means the scene was surfaced to you. A **play** keeps upstream's meaning: the
player ran past `minimumPlayPercent`. Why they're separate:
[decision 0004](../decisions/0004-views-apart-from-plays.md). (Until 2026-09-21, opening
a scene recorded a *play* and the player's own increment was disabled. That's gone.)

```
  Scenes/SceneDetails/Scene.tsx    page opened: effect keyed on scene.id, guarded by a
                                   ref (StrictMode fires once), respects ui.trackActivity
  Scenes/SceneCard.tsx             landing page only: cursor on a card for hoverViewDelay
                                   (3 s), once per card. The eye button: marked by hand,
                                   lit while the last view falls on today
        │
        ▼
  sceneAddView(id)  ──►  scenes_viewed_dates   (fork migration 1)
                         view_history · view_count · last_viewed_at on Scene,
                         filters + sorts, sceneDeleteView / sceneResetViewCount

  ScenePlayer/ScenePlayer.tsx      incrementPlayCount  ──►  scenes_view_dates (upstream's
                                   PLAY history, despite the name)
```

⚠️ **The names cross over.** `viewedDateManager` / `scenes_viewed_dates` is VIEW history.
Upstream's `viewDateManager` / `scenes_view_dates` is PLAY history.

- The migration seeded view history from play history once. After that they're
  independent.
- `useSceneAddView` doesn't evict list caches by default, because a refetch would replace
  the grid under the cursor. Pass `true` where a list should refresh.
- Browsing the scenes list records nothing. Only the landing page counts dwells.
- `SceneHistoryPanel` shows View History beside play and O history, with its own add,
  delete and reset.

---

## Smaller changes

These aren't features so much as one-line decisions, but each one is easy to revert by
accident during a rebase, so they're written down.

### Preview resolution — 640, now the scene's own

Upstream scaled every preview chunk to `scale=640:-2` and pinned `-level 4.2`. That was
sized for grid thumbnails; the carousel plays a preview full-bleed at `96vh`, where 640
is visibly soft.

`previewVideoChunk` now applies **no scale filter at all**, so a preview is generated at
the scene's own resolution — 4K in, 4K out; 720p in, 720p out. An intermediate cap was
tried first and rejected: any fixed number either upscales small sources or throws away
detail on large ones, and the display surface is a full-bleed carousel on whatever
monitor the user has.

⚠️ **`-level 4.2` had to go with it.** H.264 level 4.2 tops out around 1080p. Left in
place on a 4K encode, x264 warns three times and stamps the level anyway:

```
frame MB size (240x135) > level limit (8704)
DPB size (4 frames, 129600 mbs) > level limit (1 frames, 34816 mbs)
MB rate (810000) > level limit (522240)
$ ffprobe … → High,3840,2160,42
```

A 4K file declaring level 4.2 is non-conformant, and hardware decoders size their
buffers from that declaration. Omitting the flag lets x264 derive it — measured: 5.1 for
4K, 4.0 for 1080p, 3.0 for 640×360.

**The animated webp keeps a cap.** `previewVideoToImage` scales to
`scenePreviewImageMaxWidth` = 640 via `ScaleMaxWidth`, which emits

```
scale=min(640\,iw):-2
```

so it never upscales either. That file is the grid card's hover thumbnail — a 4K lossless
animated webp would be enormous for something rendered a few hundred pixels wide. It is
also only produced when image previews are explicitly requested (a scan option, or
`imagePreviews` in the Generate dialog); the featured-group job omits it.

The comma in that filter is escaped because `VideoFilter.Append` joins filters with
commas — same convention as the existing `Select` helper. `min()` is evaluated by ffmpeg
rather than in Go specifically so the input dimensions don't have to be plumbed down
through `PreviewVideo`, which is only handed a duration.

Costs to know:

- Generation is much heavier on large scenes — 4K is 36× the pixels of 640, and previews
  are encoded at `-crf 21`, which is constant *quality*, so the bitrate rises to match.
- Preview files grow accordingly, for **every** scene generated from now on.
- Existing previews are **not** regenerated. The library stays mixed until scenes are
  re-generated with `overwrite` on, and the featured-group job leaves `overwrite` unset,
  so featuring an old scene will *not* upgrade its preview.

⚠️ The **encoding preset** now matters more than anything else here. `veryslow` at 4K is
roughly an order of magnitude slower than `medium` for a few percent of file size, on a
throwaway derived file. If generation time becomes the problem, drop the preset in
**Settings → System → Preview Generation** first.

⚠️ Marker previews are unaffected: `markerPreviewWidth` (`marker_preview.go`) is its own
constant, still `640`. So are the two marker-duration settings in that panel.

### Navbar blends into the page

`MainNavbar.tsx` drops `bg="dark"` from `<Navbar>` and `bg-dark` from `<Navbar.Collapse>`;
`index.scss` gives `.top-nav` `background-color: $body-bg` instead. Bootstrap's
`.bg-dark` is a slightly different shade from the page background, which read as a
separate strip sitting on top of the landing page's full-bleed carousel.

Both halves are needed — the collapse element paints its own background on mobile
widths, so leaving `bg-dark` there reintroduces the strip in the expanded menu only.

### Carousel slide height — `105vh` → `96vh`

`.featured-slide` in `Landing/styles.scss`. `105vh` deliberately overflowed the viewport
so the slide never showed a seam; `96vh` instead leaves the top of the next section
visible as a scroll affordance. Anything at or above `100vh` will hide it again.

---

## Feature 5 — Collections

A **Collections** display mode for the scene list, alongside Grid / List / Wall / Tagger:
one row of scene cards per intake folder — the top-level folders inside each library root's
`New` directory. `/landing` opens in it.

**[Doc 10](10-collections.md) is the full write-up** — read it before changing any of it.
The short version:

- A collection is **derived, not stored**: `<library root>/New/<name>`, one level deep. Its
  name is often a date but just as often a pack name, and **nothing is assumed about it**.
- A collection is a **name**, not a folder — the same name under two roots is one collection
  holding both roots' scenes.
- It needed **no backend change**. Roots come from `configuration.general.stashes`, one
  folder query supplies the paths, and a collection's scenes are the *existing*
  `FolderCriterion` with a computed value.
- Because it is a display mode it composes with every filter: narrow the list and every row
  narrows with it.

⚠️ Unlike the other display modes, this one **ignores the page of scenes it is handed** and
pages over folders instead. `SceneList.tsx` therefore exempts it from the `scenes.length === 0`
early return and hides the outer scene pagination while it is active. If you touch either,
keep both in step.

⚠️ `collectionFilter` must set `depth: -1`; the criterion defaults it to `0`, which matches
only files directly inside the collection folder. Measured here, one collection went from 16
scenes to 6. It fails silently.

This one needs no server change: the only schema-adjacent edit is a new query *document* in
`ui/v2.5/graphql/`, which is a client document, not server schema.

---

## If you're taking this upstream

Read the "Project norms" section of doc 06 first. Against Stash's stated design vision:

- **Feature 3 (relative dates)** is the most upstreamable — small, general, improves an
  existing filter. Needs the i18n fix and tests.
- **Feature 2 (thumbnail toggle)** is plausible — but expect a request to persist it in
  UI config and to apply it consistently across entity lists rather than scenes only.
- **Feature 1 (featured carousel)** is the hardest sell as core: it's opinionated,
  library-specific, and the docs explicitly say superfluous features should be
  "considered for third-party plugins instead". Most of it is *already* written the way a
  plugin would be — group + custom fields + UI only, no schema — so porting it to the
  plugin API (`PatchComponent`, `registerRoute`, `IUIConfig` for the group ID) is a
  realistic path rather than a rewrite. The exception is now the server-side lifecycle:
  a hardcoded group ID living in `internal/api` is not upstreamable as-is, and the
  plugin-API route would put that logic behind a `SceneUpdatePost` hook instead.
- **Feature 5 (collections)** is library-specific by construction — it assumes a foldering
  convention upstream has no reason to assume — so it belongs in a plugin, and it is already
  shaped like one: no schema, no Go, an existing criterion, and all its rules in one pure
  module. The awkward part for a plugin is the display mode itself: `DisplayMode` is a core
  enum, so a plugin would patch `SceneList` rather than add a mode. `IUIConfig` would hold
  the intake folder name.
- **Feature 4 (view history)** leaves upstream's play semantics alone, which makes it
  far more upstreamable than the play-on-open it replaced. It is real schema, though: a
  table, filters, sorts and mutations. Upstream would want the migration in its own
  stream, and the landing-page dwell is fork-specific.
- **Native-resolution previews** are not upstreamable as-is — they change generation cost
  and disk usage for every install. Upstream would want a preview-width setting alongside
  `previewPreset` and the segment options, defaulting to the current `640`.
  `ScaleMaxWidth` is a small general-purpose helper and would go on its own, and the
  `-level 4.2` removal is a straight **bug fix** worth sending upstream regardless: it
  produces non-conformant files for any source above 1080p, at any preview width.

## Rebasing onto upstream

Don't rebase. Merge, with `scripts/upstream-sync` (doc 12), so resolved conflicts stay in
history. The files most likely to conflict, in order:

```
  ui/v2.5/src/components/Scenes/SceneList.tsx        large, actively developed upstream
  ui/v2.5/src/components/List/ListViewOptions.tsx    ditto
  ui/v2.5/src/components/ScenePlayer/ScenePlayer.tsx large, actively developed upstream
  ui/v2.5/src/components/Scenes/SceneDetails/Scene.tsx   conflicted in the rehearsal
                                                     (import list, keep both sides)
  ui/v2.5/src/models/list-filter/criteria/criterion.ts
  ui/v2.5/src/App.tsx, MainNavbar.tsx, locales/en-GB.json   small, mechanical
  pkg/scene/generate/preview.go                      a removed scale filter, a removed
                                                     -level flag and one ScaleMaxWidth
                                                     call; an upstream change here will
                                                     look like a clean take of theirs —
                                                     re-check all three
  pkg/sqlite/scene.go, scene_filter.go,              view history: small additions
    pkg/scene/{import,export,merge}.go,              inside upstream code
    graphql/schema/types/scene.graphql
  internal/api/resolver_mutation_scene.go            `// fork` call sites only
  pkg/ffmpeg/filter.go                               new helper, appended near ScaleWidth
```

`pkg/stashbox/graphql/generated_models.go` is upstream's copy. Take theirs on every
merge, and don't regenerate it in the fork: it's generated from stashdb.org's live
schema, so a regeneration here is churn.

Everything under `components/Landing/`, plus `internal/api/scene_featured.go`,
`internal/api/resolver_mutation_scene_view.go`, `pkg/sqlite/fork_migrate.go` and
`pkg/sqlite/migrations_fork/`, is new files and will never conflict.

⚠️ `internal/api/scene_featured.go` and
`ui/v2.5/src/components/Landing/featuredGroup.ts` **duplicate** the group ID and the two
custom-field names. Both files say so, but nothing enforces it — change one and you must
change the other. Moving the ID into `IUIConfig` would collapse the duplication to a
single configured value and is the fix worth making.
