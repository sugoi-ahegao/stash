# View history apart from plays, a Collections display mode, and the landing page at the site root

**Merged:** 2026-09-21 · no branch: 7 commits straight onto `main-sugoi-ahegao`, linked here as `a975079a1` · not known whether it was shipped

_Written on 2026-11-13, after the merge, from git history; the entries convention didn't
exist yet._

One Claude session's commits, made directly on main within two minutes of each other,
so the work was done before and committed in pieces. This is the fork's first schema
change.

## What changed

- **Scenes have a view history**, separate from play history. A view means the scene was
  put in front of you: its page opened, its landing card rested on for 3 seconds, or
  marked by hand. Scenes gain a view count and a last viewed date, with filters and
  sorts, and the scene page's History tab gains a View History section with add, delete
  and reset.
- **Plays mean what they mean upstream again**: the player records one once the video
  runs past the minimum play percentage. Opening a scene page no longer records a play.
- **The card's mark-played button became mark-viewed**, an eye that's lit while the last
  view is today.
- **A Collections display mode** on the scene list, beside Grid, List, Wall and Tagger:
  one row of cards per intake folder (each top-level folder inside a library root's `New`
  folder). `/landing` opened in it. It composed with every filter. It was removed on
  2026-10-24 ([entry](2026-10-24-revert-ui-collections.md)).
- **The site opens on the landing page**: `/` redirects to `/landing`, and the old front
  page moved to `/home`.
- **The carousel pauses while the pointer is on it** again.
- **An unlocked slide leaves the carousel after 2 days** instead of 3.

## How it works

- Storage: a new `scenes_viewed_dates` table, `view_history` / `view_count` /
  `last_viewed_at` on `Scene`, `sceneAddView` / `sceneDeleteView` /
  `sceneResetViewCount`, dataloaders, and merge, import and export support. The migration
  seeded view history from play history once; after that they're independent.
- ⚠️ The store is `viewedDateManager`, beside upstream's confusingly named
  `viewDateManager`, which is *play* history (`scenes_view_dates`).
- `useSceneAddView` doesn't evict lists by default, for the same reason the dwell play
  didn't: a refetch would pull the grid out from under the cursor.
- **Migration numbering**: the migration was number 185 in upstream's migrations folder,
  leaving room for upstream's 86 onwards. `dafff9c09` taught the migrator to step to the
  next migration that exists rather than `current + 1`.
- Collections were derived, not stored: `<library root>/New/<name>`, one level deep,
  matched by name across roots, each row an ordinary folder filter. No backend change.
  It paged over folders rather than scenes, so `SceneList` exempted it from the empty-page
  return and hid the scene pager.
- Today's design: [decision 0004](../decisions/0004-views-apart-from-plays.md) and
  `docs/codebase/07-this-fork.md`, Feature 4.

## Tried and changed

- **Views replaced faked plays** (see
  [2026-09-10](2026-09-10-feat-ui-featured-toggle-and-plays.md)), and the player's own
  play counting, disabled on 2026-08-30, was wired back up.
- **`core/hoverPlay.ts` and `core/played.ts`** were renamed to `hoverView.ts` (folded into
  `Scenes/sceneViews.tsx` on 2026-10-24) and `viewed.ts`.
- **Migration 185 in upstream's table didn't last.** golang-migrate keeps one version per
  table, so a database at 185 would have skipped upstream's 86 without an error. On
  2026-10-24 the migration moved to a stream of its own and became fork migration 1, and
  `dafff9c09` was reverted ([entry](2026-10-24-upstream-sync-20261024.md),
  [decision 0001](../decisions/0001-fork-migration-stream.md)).
- **Pause on hover**: off since 2026-09-12, back on here (`b8f222624`). A keyboard hold on
  a locked slide still races the slide change, so the slide duration stays well above the
  2s hold.
- **Unlock window** 3 → 2 days (`6dbf7f5c7`), trimming the carousel's steady-state size by
  about a day's unlocks.

## Watch out

- **This adds schema.** Databases migrated by this build were at version 185 until the
  2026-10-24 conversion (upstream 85, fork 1). A build from before that conversion can't
  open a converted database.
- The export test's mock didn't expect the new `GetViewedDates` call and panicked; that
  was only fixed on 2026-10-24 (`602045543`).
- The view history code was written into upstream's files (`pkg/sqlite/history.go`,
  `scene.go`, the resolvers, the loaders). It moved to `*_viewed.go` files of its own on
  2026-10-24.

## Follow-ups

- Move the migration out of upstream's stream (done 2026-10-24).

## Docs updated

- `docs/codebase/10-collections.md` (since deleted, with the feature): the Collections write-up.
- Doc 07 wasn't updated for views until 2026-10-24.

## Commits

- chore(sqlite): allow non-contiguous migration versions `dafff9c09` (reverted 2026-10-24)
- feat(scene): record view history separately from play history `a975079a1`
  > Adds scenes_viewed_dates (migration 185). The store is viewedDateManager, which sits
  > beside the confusingly named viewDateManager, the latter being PLAY history. The
  > migration seeds view history from existing play history.
- feat(ui): surface view history, and give plays back to the player `328c9459a`
- feat(ui): add a Collections display mode for the scene list `5121c72c4`
- feat(ui): open the landing page at the site root `1c97eee17`
- fix(ui): pause the featured carousel while the pointer is on it `b8f222624`
- tune(ui): shorten the featured unlock window to 2 days `6dbf7f5c7`

## Footprint

```
59 files changed, 2629 insertions(+), 161 deletions(-)   (dafff9c09^..6dbf7f5c7)
```
