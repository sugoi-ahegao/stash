# The scene list header reworked: a big centred search, filter chips, steady pagers and results that rise into place

**Merged:** 2026-11-08 · most likely `feat/search-bar-2-ui` into `main-sugoi-ahegao` as `17cbd4fa4` · 21 commits, squashed · not known whether it was shipped

_Written on 2026-11-13, after the merge, from git history; the entries convention didn't
exist yet._

The squash commit has no body and the branch is gone, so its name isn't in git. Notes
kept outside the repo name a UI-only branch `feat/search-bar-2-ui` (renamed from
`feat/search-bar-2` on 2026-11-07) for this work, and the dates and content match. The
branch's commits survive as unreachable objects, and the squash matches its tip exactly.

## What changed

- **One display options button** replaces the row of mode buttons, the zoom slider, the
  thumbnail eye and the page size select: it shows the current mode and opens a popover
  with the modes, card size, thumbnails Show / Hide, and per page as a 4 × 2 grid of
  buttons (Custom turns into a field in place).
- **The scene list's filter is a row of chips** under the toolbar, in place of the filter
  sidebar, the filter button and the filter tags: `+ Filter`, `Clear`, then a chip per
  filter in use. The old sidebar sections (Studio, Performers, Tags, Rating, Duration,
  Organised, Markers, Duplicated, Performer age, Folder) open their picker in a popover
  and apply as you pick; any other criterion opens the edit filter dialog. This applies
  to every scene list, including a performer's, tag's, group's or studio's scenes tab.
- **Saved filters come first** on every list's toolbar, and the button names the saved
  filter being shown.
- **A big search bar in the middle of the toolbar** on every list: `/` focuses it, Enter
  searches at once, Escape clears and then leaves. The buttons around it are pills of the
  same family.
- **Nothing in the toolbar moves.** The saved filter button is a fixed width; the scene
  list has no ▶ button (Play is first in the ··· menu); the results count sits at the
  row's right end on wide screens; the page always keeps its scrollbar's room.
- **Results arrive as a wave.** While the next results load the current ones stay,
  dimmed; then they sink and fade out together, and the new cards rise into their slots
  in one diagonal wave from the top-left, growing into place with a small bounce. The
  first thumbnails and studio images load before the cards rise. Reduced motion turns it
  off.
- **Zoom on the scenes grid means cards per row** (6 down to 1; at most 4 on a tablet and
  2 on a phone), with a short last row centred.
- **Both pagers are always there**, in the compact « < N of M > form, so the cards don't
  jump as the result count changes; the bottom one is pinned to the window.
- **"No results"**, or "No scenes yet" with a link to Settings → Tasks for an empty
  library.
- **pb**: the bulk edit mode toggle (Overwrite / Add / Remove) reads clearly.

## How it works

- Everything is in `ui/v2.5`; no server or schema change. Doc 07 has the details, under
  Feature 2 ("Filter chips on the scene list" through "Bulk edit mode toggle").
- New components, each called from a few lines in upstream's `SceneList.tsx` or
  `FilteredListToolbar.tsx`: `List/DisplayOptions.tsx`, `List/FilterChips.tsx` with
  `Scenes/SceneFilterChips.tsx`, `List/ToolbarSearch.tsx`, `List/activeSavedFilter.ts`,
  `List/SteadyPagination.tsx`, `Scenes/SceneResults.tsx`, `Scenes/SceneGrid.tsx`,
  `Scenes/NoScenes.tsx`, and `styles/_page-gutter.scss`.
- **The scenes grid sizes cards in CSS** (`flex: 0 0 calc(...)` from a `--scene-cards`
  count) instead of upstream's `SceneCardGrid`, which measured the row after the first
  paint and so snapped cards to their real size partway through the rise.
- **The results wave** is a phase machine in `useResultsTransition` (in, out, gone); the
  entrance is applied as the phase moves from gone to in, so nothing remounts. Each card's
  delay comes from its row plus column, measured before the first paint.
- **The page gutter**: `scrollbar-gutter: stable` on `html`, with react-bootstrap's modal
  padding undone with `!important`, since it would otherwise shift the page.

## Tried and changed

- **Display options grew in steps**: first modes, size and thumbnails (`0d26ab7df`), then
  per page as a segmented row of presets (`44a01ed36`), then a 4 × 2 grid of full-size
  buttons (`00aeb2b11`).
- **Quick filters** started as Studio, Performers, Tags, Rating and Duration
  (`2001b7945`); the rest of the sidebar's sections joined an hour and a half later
  (`2c5643449`).
- **The results count** first ended the toolbar row from `md` up (`0a066cefb`), then moved
  beside the toolbar rather than in it, so selecting doesn't move it (`ce278a73a`). Doc 07
  now says it's pinned from a 1900px window up.
- **The search bar** commit was first made with its body run into the subject
  (`13481a064`) and remade as `ce278a73a`; later it got bigger, with pill buttons
  (`c7e742f5d`).
- **The results animation was tuned four times on 2026-11-08**: cards first rose one at a
  time across each row (`345631657`); then one diagonal wave with a small bounce
  (`ea5bfbf9e`); then growing into place as they rise (`7dfa0ef52`); and old cards sinking
  as they fade (`8d0ba8628`). Keying the wrapper by generation was tried and dropped: it
  remounted the grid, which laid cards out at a default width for about 80ms.
- **Images before the rise**: thumbnails (`2c8baa2cf`), then studio images
  (`bdfda38a6`), waited for at most 500ms.
- **Review fixes** (`5869e2ec8`): keep the `/` shortcut after the edit filter dialog
  closes, keep a chip open while its last value is deselected, survive a saved filter that
  won't parse, wave on a display mode change, tidy the `+ Filter` menu, and comment out
  the unused `SceneCardGrid` so upstream changes to it conflict rather than slip past.

## Watch out

- **A plugin patching `SceneCardGrid` no longer reaches the scenes list.** Other lists keep
  upstream's grid.
- **The scene list's sidebar is gone**, so filters only live in chips there. Other entity
  lists keep upstream's sidebar.
- `SceneList.tsx` and `FilteredListToolbar.tsx` carry more fork call sites; they're near
  the top of doc 07's list of files likely to conflict.
- The zoom value (`z=` in URLs and saved filters) is unchanged but means cards per row on
  the scenes grid; the wall still reads it as row height.

## Follow-ups

- None recorded.

## Docs updated

- `docs/codebase/07-this-fork.md`: the new files in its table, and Feature 2's new
  sections (display options, filter chips, saved filters button, search bar, Play in the
  ··· menu, results count, steady page width, results arriving, cards per row, pagers, no
  scenes, bulk edit toggle).
- `docs/codebase/08-frontend-components.md`: the scene list's toolbar and grid.
- `.gitignore`: the `.playwright-mcp` output folder.

## Commits

- feat(ui): one display options button for view mode, card size and thumbnails `0d26ab7df`
- feat(ui): per page in the display options popover `44a01ed36`
- feat(ui): scene filter as a row of chips; saved filters named and first `2001b7945`
- feat(ui): every old sidebar section is a quick scene filter `2c5643449`
- tune(ui): per page as a 4 × 2 grid of full-size buttons `00aeb2b11`
- feat(ui): scene results count at the toolbar's right end; even saved filter button `0a066cefb`
- feat(ui): a big search bar at the toolbar's centre, and a toolbar that holds still `ce278a73a`
  > Nothing in the row moves any more: the saved filter button is a fixed width; the scene
  > list has no ▶ button; the results count is pinned beside the toolbar rather than in
  > it; and the page always keeps its scrollbar's room.
- feat(ui): scene results fade out, and the new ones rise into their slots `345631657`
- feat(ui): scenes grid zoom as cards per row, with a centred last row `8d05afa37`
  > Upstream's grid sized cards from a width it measured after the first paint, so new
  > results snapped to their real size partway through rising in.
- fix(ui): bulk edit mode toggle reads clearly in the pb theme `9f11b6cb3`
- feat(ui): scene list's top pager always there, so the cards don't jump `e191c2a9f`
- feat(ui): scene list says "No results", or "No scenes yet" for an empty library `3853b1aff`
- chore(git): ignore .playwright-mcp output folder `62e0c5974`
- feat(ui): scene list's first thumbnails load before their cards rise `2c8baa2cf`
- tune(ui): scene cards rise in one diagonal wave and land with a small bounce `ea5bfbf9e`
- feat(ui): scene list's first studio images load before their cards rise `bdfda38a6`
- tune(ui): scene cards grow into place as they rise `7dfa0ef52`
- feat(ui): scene list's bottom pager always there, pinned to the window `bfe3ebc4a`
- tune(ui): old scene cards sink as they fade out `8d0ba8628`
- feat(ui): bigger centred toolbar search, pill buttons and roomier scene list header `c7e742f5d`
- fix(ui): toolbar and filter chip fixes from review `5869e2ec8`

(Branch hashes; they're unreachable now and will eventually be garbage-collected. The
branch's `chore(changelog)` commits are left out.)

## Footprint

```
29 files changed, 2880 insertions(+), 356 deletions(-)
```
