# A theme switcher, the pb theme, and scene card previews that wait for you

**Merged:** 2026-10-24 · `feat/theme-switcher` into `main-sugoi-ahegao` as `cd5271aa7` · 10 commits, squashed · not known whether it was shipped

_Written on 2026-11-13, after the merge, from git history; the entries convention didn't
exist yet._

The branch is gone, but its commits survive as unreachable objects, which is where the
history below comes from. The squash's message names the branch.

## What changed

- **A palette dropdown in the navbar** switches themes: Blueprint (stash's own look, the
  default) and pb. The choice is per browser and applies before the first render, so the
  page never flashes the default.
- **pb**: a near-black theme with a glowing red accent. Plain navbar links with a red
  active page; plain card counts that turn red on hover; cards on the page background with
  no border, description, date row or resume bar; scene titles laid over the foot of the
  thumbnail. Scene page buttons, tags, tabs and settings links are toned down.
- **Scene card previews start only from the thumbnail, after resting on it for 1
  second**, with a countdown bar across its top. Passing over a card on the way somewhere
  else leaves it alone. Scenes without a preview get neither.
- **Golden cards**: the flames are capped at 160px and keep their proportions, burn over
  the preview, and make way once it plays. A golden card's preview waits until it has
  caught fire. In pb the fire stays inside the picture, without the rim.
- **Two more zoom levels** on every list's card size slider (0–5, was 0–3).
- **Fix: "today", "yesterday" and "tomorrow" in filters mean midnight.** "today - 30 days"
  used to resolve to the current minute, so the filter changed every minute, and
  recording a view on a landing card could make the whole list refetch and drop the
  scenes just viewed.

## How it works

- `ui/v2.5/src/utils/theme.ts` lists the themes and stores the choice in `localStorage`
  (`theme`); `index.tsx` applies it as `data-theme` on `<html>` before rendering.
  `ui/v2.5/src/components/ThemeSwitcher.tsx` is the dropdown.
- A theme other than the default is a stylesheet of rules scoped to
  `html[data-theme="<id>"]`: `ui/v2.5/src/styles/themes/_pb.scss`.
- The preview delay is one SCSS variable, `$scene-preview-delay` in `Scenes/styles.scss`,
  shared by the countdown bar, the swap and the golden card's wait. Every scene is given a preview URL whether one exists or not, so
  the bar only appears once the video has actually loaded.
- Zoom: every grid's card widths, the wall's row heights and the `zoom-N` CSS were extended.
  The top widths are spaced so each level drops a column on 1920 and 2560 screens.

## Tried and changed

- **Preview delay** 0.2s anywhere on the card (upstream) → 1s on the thumbnail
  (`7278d3f89`) → 0.75s with the countdown bar (`891ae2cf0`) → 1s (`f9c6dd6c5`).
- **pb's red was toned down** after the first pass (`797badb1f`): it was on scene page
  buttons, tags, the active tab, the collapse bar, settings links and the carousel. The
  carousel also dropped its date and got a larger title.
- **The flames were stretched** to an 18% × 46% box; they're now capped at 160px, the
  height the 256px sprite stays sharp at. They hide by `visibility` rather than opacity,
  so as not to fight their own fade-in.
- **The squash carries 121 lines of pb styling** that aren't in any branch commit: the pb
  scene card layout (the title over the foot of the thumbnail, no date row) and the fire
  kept inside the picture on golden cards. They were added in the working tree at squash
  time.
- `.config/wt.toml`: worktree dependencies (`pnpm install`, `make generate`) run in the
  foreground, so they finish before a server can start. Unrelated tooling that rode along.

## Watch out

- The countdown bar and the golden ignition both depend on the preview delay variable;
  change it in one place.
- Later pb tweaks went straight onto main the same evening: the task queue header
  (`3117696a6`) and darker dropdowns and modals (`f18849aaf`).

## Follow-ups

- None recorded.

## Docs updated

- None on the branch. The theme switcher appears only in doc 07's file table ("The theme
  switcher is only in the table above").

## Commits

- refactor(wt): run worktree deps in the foreground `1184ceeb0`
- feat(ui): add a navbar theme switcher and the pb theme `9c2752022`
- feat(ui): give pb cards the page background `eba66f8fd`
- feat(ui): reveal scene previews only from the thumbnail `7278d3f89`
- feat(ui): show a countdown bar before a scene preview plays `891ae2cf0`
- feat(ui): hide the resume bar on pb cards `15557e311`
- feat(ui): add two more zoom levels to list views `369297ecb`
- feat(ui): tone down the red on pb pages `797badb1f`
- fix(ui): resolve today-based relative dates to midnight `2bed4dd68`
- feat(ui): burn golden flames over the preview, and wait a second to preview `f9c6dd6c5`

(Branch hashes; they're unreachable now and will eventually be garbage-collected.)

## Footprint

```
24 files changed, 858 insertions(+), 49 deletions(-)   (the squash)
```
