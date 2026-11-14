# A landing page with a featured carousel, relative dates in filters, and a thumbnail toggle

**Merged:** 2026-08-28 · no branch: 13 commits straight onto `main-sugoi-ahegao` over 2026-08-28 and 29, linked here as `d482e93c5` · not known whether it was shipped

_Written on 2026-11-13, after the merge, from git history; the entries convention didn't
exist yet._

These were the fork's first commits. There was no feature branch and no squash; each
commit went straight onto main, from one Claude session. This entry groups them because
together they're the fork's first feature.

## What changed

- **A landing page** at `/landing`, in the navbar: a full-width carousel of featured scenes
  above the ordinary scene list.
- **Featured is a group.** Adding a scene to the featured group (group 25 at the time,
  hardcoded) puts it in the carousel, newest first.
- **Each slide starts locked**, frosted over. Holding the lock button for 2 seconds opens
  a circular window that grows and sharpens until the slide is revealed, with a small pop
  and ring when it completes. Letting go early snaps it back. Only an unlocked slide plays
  its preview.
- **At most 3 unlocks a day**, counted across the library. Past that the lock shows a
  not-allowed cursor.
- **Scenes leave the carousel on their own**: once rated, or after 7 days unlocked and
  still unrated.
- **Adding a scene to the group starts a Generate job** for it (covers, previews, sprites,
  phashes, markers, no overwrite), so the carousel has a preview to play.
- **Timestamp filters take relative dates**: `today`, `today - 30 days`, `now+2w` and so on.
- **The scene grid has an eye button** that hides thumbnails; hovering a card fades its
  thumbnail back in.

## How it works

- `ui/v2.5/src/components/Landing/`: `Landing.tsx` (the page), `FeaturedCarousel.tsx`
  (react-slick, the hold-to-reveal slide) and `featuredPolicy.ts` (the unlock budget and
  the removal rules, a list of predicates where any match removes the scene).
- **No schema.** A scene's carousel state is two custom fields: `featured_added_at`
  (ordering) and `feature_unlocked_at` (unlocked or not). A dedicated `FindFeaturedScenes`
  query fetches the whole group and sorts client-side, since a custom field can't be a
  server-side sort key. This is the choice recorded later as
  [decision 0003](../decisions/0003-custom-fields-over-schema.md).
- The day's budget is counted, not stored: a `CountScenesByCustomField` query for
  `feature_unlocked_at` after midnight, plus the unlocks made this session.
- Removal runs lazily, whenever the carousel loads. There's no background job.
- At this point the stamping and the Generate job ran **in the browser**, from the scene
  page's save (`Scene.tsx` `onSave`). Bulk edits skipped it. The next round
  ([2026-09-03](2026-09-03-feat-api-featured-lifecycle-server-side.md)) moved it to the
  server.
- Relative dates: `resolveRelativeDate` in `ui/v2.5/src/utils/text.ts`, called from
  `TimestampCriterion.transformValueToInput` when the filter is turned into a query, so a
  saved filter stays a rolling window.
- How it all works today: `docs/codebase/07-this-fork.md`, Features 1 to 3.

## Tried and changed

- **The reveal went through four designs in one night.** A click that grew a circular
  clip-path "iris" (`51e1d91d2`); a frosted-glass panel that cleared on click instead
  (`01c97dea1`); back to the iris (`a13b108b4`), keeping the glass in history; then the
  press-and-hold iris that stayed (`68a16e8b9`), with the play icon swapped for a lock and
  the pulsing ring and hint text dropped.
- **Slide height** 90vh, then 105vh so the carousel ran past the fold (`c43d7c629`). It was
  cut to 96vh on 2026-09-03.
- **Autoplay interval** 6s, then 10s (`1899fabde`). It moved several more times later.
- **The carousel's width**: padding first, then a negative margin cancelling
  `.container-fluid`'s gutter and no rounded corners, so it runs edge to edge (`aa1c19761`).
- **Hidden thumbnails** first popped in with `display`, then faded in with opacity
  (`ba04ea6ad`).
- **The thumbnail toggle wasn't remembered** across navigation; it became per list in the
  browser on 2026-10-24.
- **`chore(stashbox): regenerate GraphQL models`** (`fa0ee396c`) regenerated the stash-box
  client from stashdb.org's live schema. Nothing used it, and it was reverted on
  2026-10-24 (`fa3a2a3df`) because it only conflicts with upstream's next regeneration.

## Watch out

- The featured group was the constant `25` in both TypeScript and (later) Go until the
  library settings of 2026-10-24.
- `per_page: -1` fetches the whole group. Fine at its size, unbounded as it grows.
- Several mutations swallow their errors (`.catch(() => {})`), so a failed unlock looks
  unlocked until a reload.
- The relative-date hint in `TimestampFilter.tsx` is an English literal, not a locale
  string.

## Follow-ups

- At the time: run the lifecycle on the server so bulk edits are covered (done 2026-09-03).
- Still open: the error handling and the unbounded query above.

## Docs updated

- None at the time. The contributor's guide, `docs/codebase/` (`694667a32`, the next
  day), documented these as Features 1 to 3 of doc 07.

## Commits

- chore(stashbox): regenerate GraphQL models `fa0ee396c` (reverted 2026-10-24)
- feat(ui): add landing page with featured scene carousel `d482e93c5`
- fix(ui): make featured carousel span full width edge-to-edge `aa1c19761`
- feat(ui): support relative date expressions in timestamp filters `731b57dfc`
- feat(ui): add thumbnail visibility toggle to scene grid toolbar `783b70a1a`
- style(ui): fade in hidden scene thumbnails and highlight card on hover `ba04ea6ad`
- feat(ui): stamp featured_added_at when a scene joins/leaves the featured group `140f937b6`
  > Only wired through the scene's own edit page, not bulk edit or other mutation paths.
- feat(ui): sort featured carousel by date added, add iris click-to-reveal `51e1d91d2`
- feat(ui): swap iris reveal for a frosted-glass reveal `01c97dea1`
- revert(ui): switch featured carousel reveal back to iris `a13b108b4`
- feat(ui): hold-to-reveal iris unblur for featured carousel slides `68a16e8b9`
  > Holding the lock button for 2s grows a circular window through a blurred glass panel,
  > and the content inside carries its own blur-to-0 transition so it sharpens as the
  > aperture grows.
- feat(ui): add reveal-completion flourish, taller featured carousel `c43d7c629`
- feat(ui): add featured-carousel unlock policy, persistence, auto-generate `1899fabde`
  > Max 3 unlocks per day; a scene is removed once rated, or unlocked and unrated for more
  > than 7 days. Removal rules are predicates or'd together.

## Footprint

```
20 files changed, 1326 insertions(+), 34 deletions(-)   (fa0ee396c^..1899fabde, the stash-box regeneration included)
19 files changed, 952 insertions(+), 5 deletions(-)    (without it: d482e93c5^..1899fabde)
```
