# ui-tweaks: PB Theme's nav and name

**Merged:** 2026-11-15 · `feat/ui-tweaks` into `main-sugoi-ahegao` · 2 commits

## What changed

- In the pb theme, the active navbar link is shown as glowing red text and icon on a
  transparent background, instead of a filled dark-red box.
- Clicking a nav button no longer flashes red: pressing it only lightens the background a
  touch. Mouse focus shows no ring; keyboard focus keeps a faint red ring.
- The theme switcher lists the pb theme as "PB Theme" (its id stays `pb`, so saved choices
  still apply).

## How it works

Only `ui/v2.5/src/styles/themes/_pb.scss` (the `.top-nav .btn` active, `:active`, `:focus`
and `:focus-visible` rules, scoped under `html[data-theme="pb"]`) and the theme's display
name in `ui/v2.5/src/utils/theme.ts`. No other theme is affected.

## Tried and changed

Nothing recorded: two small commits, no intermediate approaches committed.

## Watch out

- The red glow on focus was dropped for mouse clicks; it shows only for keyboard focus
  (`:focus-visible`).

## Follow-ups

None.

## Docs updated

- `docs/codebase/07-this-fork.md`: the theme switcher row names "PB Theme (id pb)".
- `docs/decisions/`: none; cosmetic tweaks.

## Commits

- tune(ui): pb nav shows the active link as glowing red text, no red flash on click `014ee7d0f`
- tune(ui): name the pb theme "PB Theme" `f9d1881af`

## Footprint

```
3 files changed, 28 insertions(+), 6 deletions(-)
33.3% docs/codebase/
66.7% ui/v2.5/src/
```
