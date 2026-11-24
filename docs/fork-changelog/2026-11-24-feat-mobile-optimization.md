# Phone layout: one scene per row, a tidier list toolbar, and / opens scenes

**Merged:** 2026-11-24 · `feat/mobile-optimization` into `main-sugoi-ahegao` · 4 commits

## What changed

- On a phone the scenes grid shows one scene per row at every zoom level (it was up to 2).
- On a phone the list toolbar's Saved filters button sits centred on its own row above the
  search bar, so sort, the ⋯ menu and display options fit on one row under the search. It's
  12rem wide there, the same as on desktop (was 9rem).
- On a phone, + Filter and Clear share the first row of the scene list's filter chips, and
  each filter in use gets a full-width chip of its own, label untruncated, lined up with the
  cards.
- Opening stash at `/` goes to the Scenes page instead of `/landing`.
- Desktop and tablet layouts are unchanged.

## How it works

All CSS under the phone breakpoint (`media-breakpoint-down(xs)`), plus one redirect:

- `Scenes/scene-grid.scss`: `--scene-grid-cards: 1` on a phone.
- `List/toolbar-search.scss`: `.saved-filter-dropdown` gets `order: -2` and
  `flex-basis: 100%` (the search already had `order: -1`); its button keeps its own width
  (`flex: 0 0 auto`) and is centred with auto margins.
- `List/filter-chips.scss`: the toggle width, and the one-chip-per-row layout.
- `App.tsx`: `<Redirect exact from="/" to="/scenes" />`, marked `// fork`.

See [07 this fork](../codebase/07-this-fork.md): Filter chips, Saved filters button, Search
bar, and the scene grid.

## Tried and changed

- Scenes per row on a phone: capped at 2 before this branch, now 1; 2 left titles and
  details too cramped.
- Saved filters on a phone: it used to share a row with sort and ⋯ under the search, which
  pushed display options onto a row of its own. Moving it above the search was CSS only (no
  JSX reorder). The first try stretched the button to the full row (Bootstrap's
  `.btn-group > .btn { flex: 1 1 auto }`); `flex: 0 0 auto` fixed that. `justify-content:
  center` lost to the older `.filtered-list-toolbar > .btn-group:first-child` rule, so the
  button is centred with auto margins instead.
- Saved filters width on a phone: 9rem, then 12rem.

## Watch out

- At 1440px wide (14px root) the desktop toolbar already wraps sort, ⋯ and display options
  onto a second row under the search: the two 20rem sides plus the 60rem search are wider
  than the row, so it wraps before the search shrinks. Not caused by this branch.
- `scripts/check --quick` fails its UI step when the only changed UI files are `.scss`: it
  passes them to `biome format`, which ignores scss and errors with "No files were
  processed". Stylelint and prettier pass.

## Follow-ups

- The desktop toolbar wrap at ~1440px (above).
- The `scripts/check --quick` biome quirk (above).
- The phone `width: 12rem` override in `filter-chips.scss` now repeats the base rule and
  could go.

## Docs updated

- `docs/codebase/07-this-fork.md`: `/` opens `/scenes`; one scene per row on a phone; the
  saved filters row above the search, its 12rem phone width, and the search bar's phone row;
  the one-chip-per-row phone layout.
- `docs/codebase/08-frontend-components.md`: none needed (it lists the toolbar's parts, not
  their phone order).
- `docs/decisions/`: none needed (small layout tweaks, no real alternative to drift back to).
- `CLAUDE.md`, `.claude/skills/`: none needed (`run-and-verify` lists `/landing` as a route,
  which still exists).

## Commits

- tune(ui): one scene per row on phones `a801bb598`
  > The scenes grid capped phones (below sm) at 2 cards per row, too narrow
  > for a card's title and details. Cap it at 1, so every zoom level shows
  > one scene per row on a phone. Desktop and tablet are unchanged.
- tune(ui): saved filters above the search on phones `577a2d902`
- tune(ui): one filter pill per row on phones `01ebbdc0c`
- tune(ui): open scenes instead of the landing page `e9b22f321`
  > The root path redirected to /landing. Send it to /scenes, the page
  > that's opened most.

## Footprint

```
6 files changed, 47 insertions(+), 6 deletions(-)
16.6% docs/codebase/
33.3% ui/v2.5/src/components/List/
16.6% ui/v2.5/src/components/Scenes/
16.6% ui/v2.5/src/
```
