# Scene search suggestions: studios, performers and tags as you type

**Merged:** 2026-11-15 · `feat/scene-search-bar-results` into `main-sugoi-ahegao` · 3 commits

## What changed

- On the scene list, typing 2+ characters in the toolbar search opens a dropdown of
  matching studios, performers and tags: up to 5 each, with image (or an icon) and scene
  count, the typed term highlighted.
- Clicking a row (or Enter) shows just that item: a fresh filter, the term cleared; sort,
  page size, display and zoom stay.
- **+** (Shift+Enter) adds it to the current filter's studios / performers / tags
  criterion; **−** (Alt+Enter) adds it there as an exclusion, moving it out of the
  included items if it was one.
- ↓/↑ move through the rows, Escape closes the list. On a phone or touch screen the
  field blurs after a pick so the keyboard closes; the buttons are finger-sized.
- Typing stays responsive while the scene list catches up with the term.
- The PB theme styles the dropdown to match.

## How it works

Start at `ui/v2.5/src/components/List/ToolbarSearch.tsx` (the field, keys, open/close)
and `List/ToolbarSearchSuggestions.tsx` (`useSearchSuggestions`, the filter builders
`addSuggestionToFilter` / `filterBySuggestion`, and the dropdown). Data comes from one
query, `FindSearchSuggestions` (`ui/v2.5/graphql/queries/search-suggestions.graphql`):
each kind in tiers (exact, prefix, word-start regex on the name, then `q`), busiest first,
merged client-side ([0008](../decisions/0008-search-suggestions-ui-only.md)). Only
`SceneList.tsx` turns it on, via `FilteredListToolbar`'s `searchSuggestions`. Full
behaviour: [07 this fork](../codebase/07-this-fork.md), "Suggestions (scene list only)".

## Tried and changed

- **Groups (movies) as a fourth kind:** considered and declined by Pranav before it was
  built.
- **Typing lag.** Measured first: the server answers in 35–70ms (also beside a scene
  search), and responses never came back out of order: Apollo shows only the latest
  term's answer, and the old list stays up while the next loads, so dropping stale
  responses wasn't needed. The cost was the main thread: 500ms into a pause the scene list
  applied the term and re-rendered, blocking 1–1.5s in tasks up to ~240ms (dev build).
  Fixed by sending the term to the list inside `startTransition`, with a guard so a late
  commit doesn't overwrite newer typing. Blocking while typing went 978→284ms ("riley"),
  1451→472ms ("asian"); last key to final list 272→168ms.
- **Suggestions debounce:** 200ms → 100ms once the server time was known.
- **Exclude on "equals":** only includes / includes all take exclusions, so excluding from
  an "equals" tag or performer criterion turns it into "includes all".
- Earlier design iterations of the dropdown (before this session's work) weren't recorded
  in commits.

## Watch out

- UI-only: no migration, no server change, no settings.
- Timings are from the dev library and the dev build; production's library is bigger.
  If suggestions feel slow there, time `FindSearchSuggestions` first.
- The scene grid's own re-render is still the main cost while the list updates; the
  transition only keeps typing ahead of it.

## Follow-ups

- None required. Possible: suggestions on other lists (the prop is generic).

## Docs updated

- `docs/codebase/07-this-fork.md`: new "Suggestions (scene list only)" section under the
  toolbar search: query and tiers, picks, + and −, keys, the transition.
- `docs/decisions/0008-search-suggestions-ui-only.md`: new, why suggestions are tiered
  find* queries in the UI rather than a server endpoint (linked from the decisions README).
- `docs/codebase/08-frontend-components.md`: none needed, it only names the search bar.
- `CLAUDE.md`, skills: none needed, no workflow changed.

## Commits

- feat(ui): scene search suggestions for studios, performers and tags `8f65d0fd4`
  > While the scene list's toolbar search is focused with 2+ characters, a
  > dropdown lists matching studios, performers and tags (first 5 of each,
  > tiered exact > prefix > word start > `q`, busiest first) with image and
  > scene count. A row starts a fresh filter of that item; + adds it to the
  > current filter, − adds it as an exclusion (Alt+Enter; Shift+Enter adds).
  > UI-only: one FindSearchSuggestions query of find* lookups.
  > 
  > Typing stayed responsive only once the scene list's term update went
  > through startTransition: its re-render blocked the main thread for
  > 1-1.5s while typing. Suggestions are debounced 100ms (server ~50ms).

## Footprint

```
7 files changed, 892 insertions(+), 5 deletions(-)
14.2% ui/v2.5/graphql/queries/
57.1% ui/v2.5/src/components/List/
14.2% ui/v2.5/src/components/Scenes/
14.2% ui/v2.5/src/styles/themes/
```
