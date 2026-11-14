# A featured toggle on the scene page, and plays recorded from the landing page and cards

**Merged:** 2026-09-10 · no branch: 3 commits straight onto `main-sugoi-ahegao`, linked here as `979461950`, plus the related commits of 2026-08-30 and 2026-09-12 · not known whether it was shipped

_Written on 2026-11-13, after the merge, from git history; the entries convention didn't
exist yet._

Direct commits on main from three short sessions. They're grouped because they're one
idea, "count it when I've seen a scene", tried with plays. Eleven days later the whole
idea was redone with views
([2026-09-21](2026-09-21-feat-scene-view-history.md)), so most of what's below is no
longer how stash behaves. The featured toggle remains.

## What changed

- **A crown button on the scene page** puts the scene in the featured group or takes it
  out. It sits beside the Golden button, and uses a crown rather than a star because the
  rating stars are right next to it.
- **Opening a scene page counted as a play** (2026-08-30), once per scene, respecting the
  "track activity" setting. The player stopped counting plays itself, to avoid counting
  twice; it still saved play duration and resume time.
- **Resting the cursor on a landing-page card for 3 seconds counted as a play**, once per
  card. The Scenes page didn't do this.
- **A "mark played" button on scene cards**, lit while the scene's last play was today
  (local calendar day, so it goes dark at midnight). Clicking a lit one added another play.
- **The carousel kept advancing while the pointer was on it** (2026-09-12), and slides
  dropped from 15 to 10 seconds.

## How it works

- The featured toggle runs the ordinary `updateScene` mutation with the group added or
  removed, so the server-side lifecycle (stamp, Generate job) fires unchanged.
  `withFeatured` rebuilds the whole group list, because a groups update replaces the list
  and other groups would otherwise be dropped. The group ID and field names moved from
  `Landing/featuredGroup.ts` (since deleted) to `ui/v2.5/src/core/featured.ts`.
- The dwell timer called `useSceneIncrementPlayCount` with a new `evictLists` flag set to
  false. Evicting lists from inside a visible list made the grid refetch, unmount every
  card and reset the per-card guard, so a nudge of the mouse could record a second play.
- `last_played_at` was added to the slim scene fragment so cards could know about today.

## Tried and changed

- **Plays were the wrong metric.** Faking plays from page opens, dwells and a button made
  "I've seen this" and "I watched this" the same number, and `minimumPlayPercent` stopped
  meaning anything. On 2026-09-21 all three became *views* in a history of their own, and
  the player went back to owning plays
  ([decision 0004](../decisions/0004-views-apart-from-plays.md)).
- **The mark-played button stretched across the row**: Bootstrap's
  `.btn-group > .btn { flex: 1 1 auto }` caught it alone, as every other entry in the row
  is wrapped. It needed `flex: 0 0 auto` at a weight of three classes. The row itself
  became unconditional (except on compact cards), so a scene with no tags or performers
  gained a divider and the button.
- **Pause on hover** was turned off on 2026-09-12 (react-slick defaults it on) and turned
  back on on 2026-09-21: stopping to look at a slide should stop it moving on.

## Watch out

- Plays recorded this way between 2026-08-30 and 2026-09-21 are in play history. When
  view history arrived, its migration seeded views from all existing plays, so those are
  in view history too.
- A list filtered or sorted by play count went stale after a dwell, until its next fetch.

## Follow-ups

- Replace plays with views (done 2026-09-21).

## Docs updated

- None at the time. The 2026-10-24 docs pass found doc 07 still describing opening a scene
  as a play, and fixed it (`bffeb8dfd`).

## Commits

- feat(ui): count opening a scene page as a play `daa5a1988` (2026-08-30)
- feat(ui): add a featured toggle to the scene page `979461950`
- feat(ui): count a dwell on a landing card as a play `a4f6e0d92`
- feat(ui): add a mark-played button to scene cards `073b0b4cb`
- feat(ui): keep the featured carousel advancing on hover `ab7895b87` (2026-09-12)

## Footprint

```
16 files changed, 329 insertions(+), 53 deletions(-)   (979461950^..ab7895b87)
2 files changed, 18 insertions(+), 14 deletions(-)     (daa5a1988)
```
