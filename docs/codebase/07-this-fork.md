# 07 — This fork (`main-sugoi-ahegao`)

Everything that diverges from upstream `develop` on this branch, why it works the way it
does, and what's load-bearing if you build on it.

```
$ git diff --stat develop...HEAD
 34 files changed, 4165 insertions(+), 68 deletions(-)
```

**The divergence is mostly frontend, but no longer exclusively.** There is still no
GraphQL schema change and no migration. Two hand-edited Go files carry the featured-group
lifecycle (`internal/api/scene_featured.go`, `internal/api/resolver_mutation_scene.go`);
a third backend file (`pkg/stashbox/graphql/generated_models.go`) is a regeneration
artefact, and two more (`pkg/scene/generate/preview.go`, `pkg/ffmpeg/filter.go`) raise
the preview render width.

Rebasing onto upstream `develop` should still rarely conflict outside `ui/v2.5`, with
`resolver_mutation_scene.go` as the one backend file to watch.

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

  MOD  App.tsx, MainNavbar.tsx, List/views.ts    wire up the /landing route
  MOD  graphql/queries/scene.graphql             2 new queries
  MOD  internal/api/resolver_mutation_scene.go   run the featured lifecycle on every
                                                 scene update path
  MOD  Scenes/SceneDetails/Scene.tsx             count a page visit as a play
  MOD  ScenePlayer/ScenePlayer.tsx               stop the player double-counting plays
  MOD  List/ListViewOptions.tsx,                 thumbnail visibility toggle
       List/FilteredListToolbar.tsx,
       Scenes/SceneList.tsx, Scenes/styles.scss
  MOD  utils/text.ts, criteria/criterion.ts,     relative date expressions in filters
       List/Filters/TimestampFilter.tsx
  MOD  pkg/scene/generate/preview.go,            preview render width capped at 1920
       pkg/ffmpeg/filter.go                       (was a hard 640)
  MOD  MainNavbar.tsx, index.scss,               chrome: flat navbar, shorter slide
       Landing/styles.scss
  MOD  locales/en-GB.json, index.scss
```

Four independent features, plus a handful of standalone tweaks. Take them one at a
time.

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

`internal/api/scene_featured.go` now owns it, and `resolver_mutation_scene.go` calls it
from **all three** update paths — `SceneUpdate`, `ScenesUpdate`, `BulkSceneUpdate`:

```
   for each scene being updated, inside the txn:

     wasFeatured := sceneIsFeatured(scene)      ← read BEFORE the update
     ... apply the update, then the input's own custom fields ...
     nowFeatured := applyFeaturedChange(scene, wasFeatured)
                      │
                      ├─ joined  → custom_fields.partial{ featured_added_at: now }
                      └─ left    → custom_fields.remove[ featured_added_at,
                                                         feature_unlocked_at ]

   after the txn commits:
     generateForFeatured(newlyFeaturedIDs)      ← one job for the whole batch
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

## Feature 4 — Opening a scene counts as a play

Upstream records a play once the player has watched `minimumPlayPercent` of the video.
On this branch, **navigating to a scene page records the play immediately**, with no play
duration.

```
  Scenes/SceneDetails/Scene.tsx    ScenePage effect, keyed on scene.id
        │   guarded by a ref  → StrictMode's double-invoke fires once
        │   respects ui.trackActivity
        ▼
  sceneAddPlay(id)                 appends a view timestamp only;
                                   it never touches play_duration
        ▲
        │  NOT called by the player any more
  ScenePlayer/ScenePlayer.tsx      activity.incrementPlayCount = noop
                                   saveActivity still reports duration + resume time
```

The player's increment had to go: leaving both in place gave every watched scene **two**
plays. `scene.id` changes as you move through the queue, so each scene in a playlist
records its own play.

⚠️ **`minimumPlayPercent` no longer gates anything.** A play is recorded on open
regardless of how much is watched — opening a scene and immediately leaving still counts.
That is the intended semantic here ("play count" now means "times opened"), but it makes
the config setting misleading, and it changes what play-count sorting and the
`play_count` filter actually mean in this library.

The manual "add play" control in `SceneHistoryPanel` is untouched.

---

## Smaller changes

These aren't features so much as one-line decisions, but each one is easy to revert by
accident during a rebase, so they're written down.

### Preview render width — a hard 640, now a 1920 cap

`scenePreviewMaxWidth` (`pkg/scene/generate/preview.go`) sizes both the preview **video**
chunks and the animated preview **webp**. Upstream's `640` was chosen when previews were
only ever shown as small grid thumbnails; the carousel plays one full-bleed at `96vh`,
where 640 is visibly soft.

It's a **cap, not a target**. Upstream's `ScaleWidth` emits `scale=640:-2`, which scales
in both directions — at 1920 that would have upscaled a 720p scene to 1080p, spending
bitrate on invented pixels. `ScaleMaxWidth` (`pkg/ffmpeg/filter.go`) emits

```
scale=min(1920\,iw):-2
```

so the width is only ever reduced. The comma is escaped because `VideoFilter.Append`
joins filters with commas — same convention as the existing `Select` helper. `min()` is
evaluated by ffmpeg rather than in Go specifically so the input dimensions don't have to
be plumbed down through `PreviewVideo`, which is only handed a duration.

Measured against `testsrc` at four sizes:

| source | preview |
|---|---|
| 640×480 | 640×480 |
| 1280×720 | 1280×720 |
| 1920×1080 | 1920×1080 |
| 2560×1440 | 1920×1080 |

The cost is still real for genuinely large sources:

- Preview generation is slower and the encode heavier — up to 9× the pixels of 640.
- Preview files on disk grow accordingly, for **every** scene generated from now on, not
  just featured ones. It's one constant, not a per-scene setting.
- Existing previews are **not** regenerated. The library is mixed until scenes are
  re-generated with `overwrite` on, and the featured-group generate job leaves
  `overwrite` unset, so featuring an old scene will *not* upgrade its preview.

⚠️ The **encoding preset** matters more than the width here. Chunks are encoded at
`-crf 21` with the configured preset, and `veryslow` at 1080p is roughly an order of
magnitude slower than `medium` for a few percent of file size — on a throwaway derived
file. If generation time is the problem, drop the preset in
**Settings → System → Preview Generation** before turning this constant back down.

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
- **Feature 4 (play on open)** is a behaviour change to an existing metric, not an
  addition, and upstream deliberately gates plays on `minimumPlayPercent`. Expect it to
  be rejected as a default. It's viable upstream only as an opt-in config setting that
  leaves the existing behaviour as the default.
- **The preview width bump** is not upstreamable as a constant — it changes generation
  cost and disk usage for every install. Upstream would want it as a preview setting
  alongside `previewPreset` and the segment options, defaulting to the current `640`.
  `ScaleMaxWidth` itself is a small general-purpose helper and would go on its own.

## Rebasing onto upstream

The files most likely to conflict, in order:

```
  internal/api/resolver_mutation_scene.go            sceneUpdate's signature is changed
                                                     (returns an extra bool) and three
                                                     resolvers gained hunks
  ui/v2.5/src/components/Scenes/SceneList.tsx        large, actively developed upstream
  ui/v2.5/src/components/List/ListViewOptions.tsx    ditto
  ui/v2.5/src/components/ScenePlayer/ScenePlayer.tsx large, actively developed upstream
  ui/v2.5/src/models/list-filter/criteria/criterion.ts
  ui/v2.5/src/App.tsx, MainNavbar.tsx, locales/en-GB.json   small, mechanical
  pkg/scene/generate/preview.go                      one constant plus two ScaleMaxWidth
                                                     calls; an upstream change here will
                                                     look like a clean take of theirs —
                                                     re-check the width and that it is
                                                     still the non-upscaling helper
  pkg/ffmpeg/filter.go                               new helper, appended near ScaleWidth
```

`pkg/stashbox/graphql/generated_models.go` should be resolved by **regenerating**
(`make generate-stash-box-client`), never by merging hunks.

Everything under `components/Landing/`, plus `internal/api/scene_featured.go`, is new
files and will never conflict.

⚠️ `internal/api/scene_featured.go` and
`ui/v2.5/src/components/Landing/featuredGroup.ts` **duplicate** the group ID and the two
custom-field names. Both files say so, but nothing enforces it — change one and you must
change the other. Moving the ID into `IUIConfig` would collapse the duplication to a
single configured value and is the fix worth making.
