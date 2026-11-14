# Golden cards: a favourite of favourites catches fire

**Merged:** 2026-09-08 · no branch: 8 commits straight onto `main-sugoi-ahegao`, linked here as `1989a6e98` · not known whether it was shipped

_Written on 2026-11-13, after the merge, from git history; the entries convention didn't
exist yet._

One Claude session's commits, made directly on main (the last of them rewritten by a
`filter-branch` the same afternoon, which is why the reflog shows different hashes).

## What changed

- **A scene tagged Golden gets a card that burns.** It looks ordinary until the cursor
  has rested on it for a moment; then it catches: a flash from the bottom edge, a kick
  upwards, the card stock charring black, the rim catching white-hot, two hand-drawn
  flames rising up its sides, and sparks. Once awake it stays alight while it's on screen.
- **A Golden button on the scene page**, next to the rating stars, toggles the tag.
- **Reduced motion** still chars the card and lights the rim, but nothing moves.
- **The carousel shows each slide for 15 seconds** (it was 20).

## How it works

- `ui/v2.5/src/core/golden.ts`: the tag (matched by ID, so renaming it or a second tag
  called Golden can't flip it), `isGolden`/`withGolden`, and the wake delay.
- The wake delay is a component timer, not a CSS hover delay, because the card stays
  awake after the cursor leaves.
- The fire is a `decorations` element passed to `GridCard` (a new prop), whose layers
  place themselves by z-index: charred surface behind the content, rim over it, flames
  and sparks in front, the title in front of those.
- `ui/v2.5/src/components/Scenes/flames.png` is a ten-frame sprite strip built by
  `ui/v2.5/scripts/build_flame_sprite.py` from a hand-drawn sheet that isn't in the repo.
  The CSS steps through it with `steps()`.
- Today's layout: `docs/codebase/07-this-fork.md`, Feature 6.

## Tried and changed

The whole look was reworked five times in one afternoon:

1. **Gilded metal** (`1989a6e98`): an opaque gold layer faded in behind the content, with a
   bevelled rim drawn as a masked gradient.
2. **Fire, drawn as SVG ellipses** (`89d61c00e`), blended with `screen` so only their light
   survives over the preview. The rim gradient had to be 90deg: a diagonal gradient
   scrolled across the card meets its own repeat at a visible seam.
3. **A hand-drawn flame sprite** (`15b7c061f`) replaced the generated flames. The build
   script un-blends the sheet's glow from its ground (otherwise a dark ring shows), drops
   faint smoke wisps (a second ring), and cuts frames at the darkest column near each
   boundary, centring each on its base so the flame doesn't skate sideways. Dropping the
   SVG generator took the CSS bundle from 165KB to 154KB gzipped.
4. **Ignition as a sequence** (`d8e9ef6a6`) instead of everything fading in at once: bloom
   at 0ms, kick at 40ms, char at 60ms, rim and flames at 120ms, sparks at 700ms. The kick
   started at 440ms, which read as a reaction to something already over. The card also
   stopped insetting its preview by 5px on waking, which looked like it resizing.
5. **Flames revealed by a clip, not scaled** (`e297b1349`): stretching a hand-drawn flame
   reads as a picture being pumped up. Their fade dropped from 400ms to 120ms, and they
   now burst with the kick over 420ms instead of 780ms.

- **`.gitignore`** got three Python rules rather than GitHub's Python template, whose
  `build/`, `lib/` and `.env` rules would hide files this repo tracks (`411d6edd9`).

## Watch out

- **The tag ID was hardcoded** (`1414`, this library's Golden tag). It became the
  `goldenTagId` setting on 2026-10-24.
- The fire's CSS lived in `Scenes/styles.scss` until 2026-10-24, when it moved to its own
  `golden-card.scss`.
- The source flame sheet isn't in the repo; only the built strip is. Rebuilding the sprite
  needs it.

## Follow-ups

- Make the tag a setting (done 2026-10-24).

## Docs updated

- `docs/codebase/09-parallel-experiments.md` (`1b4740b47`, same session, unrelated to the
  cards): running several branches against one library. Superseded by doc 11 on
  2026-10-24.
- The golden card itself wasn't documented until 2026-10-24 (doc 07, Feature 6).

## Commits

- docs: document parallel experiments on one library `1b4740b47`
- feat(ui): shorten the carousel slide duration to 15s `d8ef648b4`
- feat(ui): give golden scenes a metal card treatment `1989a6e98`
- feat(ui): burn the golden card instead of gilding it `89d61c00e`
- feat(ui): burn the golden card with a drawn flame sprite `15b7c061f`
- feat(ui): ignite the golden card instead of fading it in `d8e9ef6a6`
- feat(ui): reveal the igniting flames instead of scaling them `e297b1349`
- chore: ignore Python build artefacts `411d6edd9`

## Footprint

```
14 files changed, 1131 insertions(+), 5 deletions(-)   (1b4740b47^..411d6edd9)
```
