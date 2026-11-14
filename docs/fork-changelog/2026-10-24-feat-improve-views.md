# An instant view eye, shut until viewed today, and "Mark page as viewed"

**Merged:** 2026-10-24 · `feat/improve-views` into `main-sugoi-ahegao` as `0330a155c` · 1 commit, fast-forwarded · not known whether it was shipped

_Written on 2026-11-13, after the merge, from git history; the entries convention didn't
exist yet._

## What changed

- **The card's eye button answers at once.** It waited for the server before lighting up,
  which on a busy production server could take a while. It now opens on click and shuts
  again if the request fails.
- **The eye is shut (eye-slash) until the scene has been viewed today**, and open after,
  in place of the green highlight. Once open it does nothing: no second view that day,
  and no hover or press feedback, in either theme.
- **"Mark page as viewed"** (or "Mark selected as viewed" with a selection) in a scene
  list's operations menu, on the Scenes and landing pages. Scenes already viewed today
  are skipped, and the cards update straight away.

## How it works

- `Scenes/MarkViewedButton.tsx` updates the cache optimistically and rolls back on error.
- `useMarkScenesViewed` (`Scenes/sceneViews.tsx`) leaves out scenes whose last view is
  today, then sends one `scenesAddView(ids)`, a new mutation in
  `internal/api/resolver_mutation_scene_view.go` that records one view per scene, all at
  the same moment, in a single transaction, and returns the scenes so the cache picks up
  their new counts without a refetch.
- `SceneList.tsx` adds the menu item.
- Feature 4 in `docs/codebase/07-this-fork.md`.

## Tried and changed

- **The viewed state was a green highlight**; it's now the icon itself (eye-slash, then
  eye). The commit doesn't say why.
- Nothing else shows in history: the branch had one commit besides its changelog update, and it was fast-forwarded, not
  squashed.

## Watch out

- **This adds GraphQL schema** (`scenesAddView`), so `make generate` after merging. No
  migration.
- "Today" is the viewer's local day, decided in the browser; view dates are stored in UTC.

## Follow-ups

- None recorded.

## Docs updated

- `docs/codebase/07-this-fork.md`: Feature 4 describes the eye and the menu item.

## Commits

- feat(ui): instant view eye, shut until viewed today, and mark a page viewed `0330a155c`
  > A scene list's operations menu gains "Mark page as viewed" (or "Mark selected as
  > viewed"). It sends one new scenesAddView(ids) mutation, a single transaction, skips
  > scenes already viewed today, and updates the cards optimistically.
- chore(changelog): update FORK_CHANGELOG.md `a6e66269a` (the branch's tip)

## Footprint

```
11 files changed, 162 insertions(+), 19 deletions(-)
```
