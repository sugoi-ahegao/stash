# The Collections display mode is removed

**Merged:** 2026-10-24 · no branch: 1 commit straight onto `main-sugoi-ahegao`, linked here as `405acf8e9` · not known whether it was shipped

_Written on 2026-11-13, after the merge, from git history; the entries convention didn't
exist yet._

## What changed

- **The scene list no longer has a Collections display mode** (one row of cards per intake
  folder, added on [2026-09-21](2026-09-21-feat-scene-view-history.md)).
- **The intake folder setting** under Settings > Interface > This Library is gone, added
  only half an hour earlier.
- **`/landing` opens in Grid** again.
- A saved view or URL that still asks for Collections (`disp=4`) shows the list's default
  mode instead of an empty list.

## How it works

- Deleted: `SceneCollectionPanel`, `core/collections.ts`, the `FindCollectionFolders` and
  `FindCollectionSceneStats` queries, the `collectionsFolder` setting and the
  `defaultDisplayMode` option that let `/landing` open in Collections.
- `SceneList`'s pagination and empty-page handling are back to upstream's shape.
- `ListFilterModel` drops any display mode the list doesn't offer
  (`offeredDisplayMode`) and falls back to the default. `DisplayMode` value 4 stays unused
  in `types.ts`.

## Tried and changed

- **Why it was removed isn't recorded** in the commit or the docs. What history does show
  is its cost: it needed exceptions in upstream's `SceneList` (its own paging over
  folders, an exemption from the empty-page return, the scene pager hidden), and those
  are what the removal undid.
- The commit was made once, then remade a minute later with the same subject; the first
  version survives only as an unreachable object.

## Watch out

- **Don't reuse `DisplayMode` 4.** Old saved views and URLs may hold it.

## Follow-ups

- None.

## Docs updated

- `docs/codebase/10-collections.md`: deleted.
- `docs/codebase/07-this-fork.md`: keeps a short note as Feature 5, so the other features
  keep their numbers.
- `CLAUDE.md`, `docs/codebase/README.md`, `docs/codebase/11-production-and-dev.md`,
  `.claude/skills/upstream-sync/SKILL.md`: references to Collections removed.

## Commits

- revert(ui): remove the Collections display mode `405acf8e9`
  > Saved views and URLs can still hold DisplayMode 4 (disp=4), which would now render an
  > empty list, so ListFilterModel drops any mode the list doesn't offer and falls back to
  > its default. Value 4 stays unused.

## Footprint

```
24 files changed, 72 insertions(+), 952 deletions(-)
```
