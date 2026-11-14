# Hold a scene card to generate a fresh preview

**Merged:** 2026-11-02 · branch name not recorded, into `main-sugoi-ahegao` as `124ba8d51` · 3 commits, squashed · not known whether it was shipped

_Written on 2026-11-13, after the merge, from git history; the entries convention didn't
exist yet._

The branch is gone and its name isn't in git. Its commits survive as unreachable objects,
which is where the history below comes from; the squash matches the branch's tip exactly.

## What changed

- **Press and hold a scene card's thumbnail for 5 seconds to regenerate its preview.**
  The new preview comes out different: its segments are taken from new positions. The
  rest of the Generate defaults run too, but only fill in what's missing.
- **A charging dial, a blast, then a glowing gear** that turns slowly while the job is
  queued and faster while it runs, ending in a check (or a cross if it failed). The
  colours follow the theme.
- **Every card showing that scene reloads the new preview** when it's ready.
- **A quick press is still a click.** Letting go before the dial appears (350 ms) opens
  the scene. Once the dial is up, letting go gives up: the ring drains back, and nothing
  happens.
- **The pointer can wander anywhere over the card** mid-hold; leaving the card, or
  selecting cards, cancels it.
- **The featured carousel's hold-to-reveal follows the pointer the same way**, arrows
  included, and a finger dragged on the glass is a hold, not a swipe.

## How it works

- `ui/v2.5/src/components/Scenes/HoldToGenerate.tsx` and `hold-to-generate.scss`, called
  from `SceneCard.tsx`. Works wherever `SceneCard` is used.
- Two jobs, preview first: the preview (and webp, if the defaults make one) with
  overwrite, then everything else the Generate defaults turn on, without overwrite.
- **Why the preview differs**: `slidPreviewOptions` adds a random part of a step to
  `previewExcludeStart` and takes the same off `previewExcludeEnd`, so every segment moves
  and the step stays the same. A scene too short for segments gets one whole-scene
  preview, which comes out the same.
- **Reloading**: the preview's URL doesn't change, so `bumpPreviewVersion` gives the scene a
  new version when the job finishes, and its cards add `?v=N`. Not `t`, because `t` makes
  the server mark the response immutable.
- The colours are `--hold-*` custom properties, set for pb in `styles/themes/_pb.scss`,
  which also fades out pb's on-thumbnail title during a hold.
- Full write-up: `docs/codebase/07-this-fork.md`, "Hold a scene card to generate".

## Tried and changed

- **The hold was 4 seconds** in the first commit, then 5 (`f0a81adf1`).
- **Letting go and moving the pointer** were reworked in a second commit (`f0a81adf1`,
  "lets go cleanly and follows the pointer"): a press let go before the dial appears is a
  click, after that letting go does nothing, with the 350 ms reveal delay set a little
  under the platforms' long-press threshold; and the hold follows the pointer on the
  window, with the browser's link drag held off. How the first version behaved isn't
  described. The carousel's hold got the same pointer treatment (`9ea40dcc7`).

## Watch out

- The second job doesn't overwrite, so it won't repair a broken sprite or cover; only the
  preview is regenerated.
- No server change: it uses the existing Generate mutation with preview options.

## Follow-ups

- None recorded.

## Docs updated

- `docs/codebase/07-this-fork.md`: "Hold a scene card to generate", and the new files in
  its table.

## Commits

- feat(ui): hold a scene card to generate a fresh preview `ef5b86f95`
  > Pressing and holding a scene card's thumbnail for 4 seconds queues a preview
  > regeneration (overwriting, with the segments slid to new positions) and then the rest
  > of the generate defaults without overwrite.
- feat(ui): hold to generate lets go cleanly and follows the pointer `f0a81adf1`
  > The hold now takes 5 seconds. A press let go before the dial appears (350 ms, under the
  > platform long-press threshold) is still a click; once the dial is up, letting go does
  > nothing and the ring drains back from where it got to.
- feat(ui): featured carousel hold follows the pointer `9ea40dcc7`
  > A finger dragged on the glass is a hold, not a scroll, and the drag no longer starts
  > the carousel's own swipe.

(Branch hashes; they're unreachable now and will eventually be garbage-collected. Each
also had a `chore(changelog)` commit after it.)

## Footprint

```
9 files changed, 1019 insertions(+), 10 deletions(-)
```
