# The featured lifecycle moves to the server, previews at the scene's own resolution, and a carousel that only shows what you can open

**Merged:** 2026-09-03 · no branch: 8 commits straight onto `main-sugoi-ahegao`, linked here as `ff06f5f2d` · not known whether it was shipped

_Written on 2026-11-13, after the merge, from git history; the entries convention didn't
exist yet._

One Claude session's commits, made directly on main.

## What changed

- **Bulk edits feature scenes properly.** Adding scenes to the featured group from bulk
  edit, or any other update path, now stamps them and generates their media. Taking a
  scene out of the group clears its carousel state. Before, only the scene page's own
  edit form did either, and removal cleared nothing.
- **Previews are generated at the scene's own resolution**: a 4K scene previews in 4K, a
  720p scene in 720p. They were 640px wide. The animated webp, which is the grid card's
  hover image, stays at most 640px wide and never upscales.
- **The carousel only shows slides you can open.** It carries at most as many locked
  slides as you have unlocks left today, so spending the budget empties the locked half
  instead of leaving frosted slides you can't open. A slide unlocked more than 3 days ago
  stops taking a slot but stays in the group.
- **The navbar is the page's colour**, not a separate dark strip over the carousel.
- **Slides are 96vh tall**, so the top of the scene list peeks out below.

## How it works

- `internal/api/scene_featured.go`, called from `SceneUpdate`, `ScenesUpdate` and
  `BulkSceneUpdate` in `resolver_mutation_scene.go`. It reads group membership before and
  after the update instead of interpreting the input, so bulk `SET`/`ADD`/`REMOVE` don't
  need re-deriving. It stamps after the request's own custom fields are written, so a
  `full` replacement can't wipe the stamp. Generation is queued after the transaction
  commits, and its error is logged rather than returned.
- **`PreviewOptions` is left nil** on that Generate job. The client had been sending
  zeroes, and `getGeneratePreviewOptions` treats any non-nil value as an override, so it
  asked for zero segments and ffmpeg failed with "No files to concat".
- Previews: `previewVideoChunk` in `pkg/scene/generate/preview.go` applies no scale
  filter. `ScaleMaxWidth` in `pkg/ffmpeg/filter.go` emits `scale=min(640\,iw):-2` for the
  webp; ffmpeg evaluates `min()`, so the input size needn't be passed down.
- Carousel: `featuredPolicy.ts` gains `UNLOCKED_VISIBLE_DAYS` and `isUnlockExpired`. Slots
  are filled by walking the group and skipping, so skipped slides backfill, and the
  removal sweep covers every scene walked, skipped ones included.
- Full write-up: `docs/codebase/07-this-fork.md`, "Where the lifecycle is enforced", "What
  the carousel actually shows" and "Preview resolution".

## Tried and changed

- **Preview width went 640 → 1920 → capped at 1920 → native**, all in one evening. 1920
  (`4a766f004`) upscaled small scenes, because `scale=<w>:-2` scales both ways. Capping
  with `min(1920, iw)` (`69621d64f`) fixed that, but any fixed number either upscales
  small sources or throws away detail on large ones, so the final commit (`c9b0eb282`)
  dropped the scale filter.
- **`-level 4.2` was dropped** with it. That level tops out around 1080p, so a 4K encode
  declared a level it doesn't meet, and hardware decoders size their buffers from it.
  Without the flag x264 picks the level itself (measured 5.1 for 4K, 4.0 for 1080p).
- **The unlock count was first a plain counter** of this session's unlocks. Both carousel
  queries refetch after any scene update, so every unlock was counted twice. It became a
  set of scene ids, counted only until the refetched data shows the stamp.
- **Slide duration** went from 10s to 20s, inside the preview-width fix (`69621d64f`); it
  came back down to 15s and then 10s later.
- **The navbar**: `bg-dark` had to come off both the navbar and its collapse element, or
  the strip came back in the mobile menu.

## Watch out

- **Preview generation is much heavier** on large scenes, and preview files are larger,
  for every scene generated from now on. Existing previews aren't regenerated, and the
  featured Generate job doesn't overwrite, so featuring an old scene doesn't upgrade it.
- **Don't pass `PreviewOptions`** to the featured Generate job (above).
- **Marker previews are unchanged**: `markerPreviewWidth` is still 640.
- `internal/api/scene_featured.go` and the UI's featured module both name the two custom
  fields; they have to agree.
- At this point the fork changed `sceneUpdate`'s signature, which made
  `resolver_mutation_scene.go` 163 lines of conflict surface. That was reworked into call
  sites on 2026-10-24 ([decision 0002](../decisions/0002-fork-code-at-call-sites.md)).

## Follow-ups

- Upstream could take `ScaleMaxWidth` and the `-level 4.2` removal (a bug fix for any
  source above 1080p); see "If you're taking this upstream" in doc 07.

## Docs updated

- `docs/codebase/07-this-fork.md`: the server-side lifecycle, the custom-field update
  modes, the three carousel rules, the unlock budget, preview resolution and the chrome
  tweaks (`259d79f7d`).
- `docs/codebase/04-database-migrations.md`: a short addition (`259d79f7d`).

## Commits

- feat(api): run the featured-group lifecycle server-side `ff06f5f2d`
  > Bulk edit goes through bulkSceneUpdate and skipped all of it. Membership is read before
  > and after the update; the stamp is applied after the request's own custom fields;
  > generation is queued after commit. PreviewOptions is deliberately left nil.
- feat(generate): raise scene preview width to 1920 `4a766f004`
- feat(ui): flatten the top navbar and shorten featured slides `85c10c8f4`
- feat(ui): only show carousel slides you can actually open `1b219a870`
  > unlockedThisSession holds scene ids instead of a count; a bare counter double-counted
  > every unlock once the evicted queries refetched.
- docs: document the server lifecycle and carousel display rules `259d79f7d`
- feat(ui): name the carousel slide pacing constants `7b9baabce`
- fix(generate): cap preview width instead of scaling to it `69621d64f`
- feat(generate): generate previews at the scene's own resolution `c9b0eb282`

## Footprint

```
13 files changed, 713 insertions(+), 133 deletions(-)   (ff06f5f2d^..c9b0eb282)
```
