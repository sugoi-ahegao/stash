# Library settings for the featured group, golden tag and intake folder, and fork code moved out of upstream files

**Merged:** 2026-10-24 · no branch: 4 commits onto `main-sugoi-ahegao` in one go, linked here as `38fa82a5d` · not known whether it was shipped

_Written on 2026-11-13, after the merge, from git history; the entries convention didn't
exist yet._

Four commits from one Claude session, all committed at the same second, so they were
written together and split into commits at the end. Half of it is a setting a user sees;
the other half moves fork code out of upstream files so upstream merges stay clean.

## What changed

- **Settings > Interface > This Library**: pick the featured group, the golden tag and the
  intake folder (for Collections) instead of the hardcoded group 25, tag 1414 and folder
  `New`. With one unset, its feature is off.
- **Per-page switches for recording a view on hover**: the landing page (on by default)
  and the Scenes page (off by default). All view recording stays off when the player's
  "track activity" setting is.
- **The thumbnail toggle is remembered** per list, in the browser.
- The server reads the featured group from the same setting.

## How it works

- `ui/v2.5/src/core/forkConfig.ts` reads the settings out of the UI config (`IUIConfig`,
  new keys in `core/config.ts`); `Settings/SettingsInterfacePanel/ForkSettings.tsx` is the
  section. The UI config is stored on the server, which is how
  `internal/api/scene_featured.go` reads `featuredGroupId`.
- **Hover views are switched on by a `ViewOnHover` context** around a page
  (`Scenes/sceneViews.tsx`), instead of a `view` prop threaded down through `SceneList`,
  `SceneCardGrid` and the recommendation rows. `Landing.tsx` and `Scenes.tsx` wrap their
  lists in it.
- **SceneCard's fork logic became hooks and components**: `useGoldenCard`
  (`Scenes/GoldenCard.tsx`), `useDwellView`, and `Scenes/MarkViewedButton.tsx`. The golden
  card's CSS moved from `Scenes/styles.scss` into `Scenes/golden-card.scss`. The golden and
  featured buttons run their own updates, out of `Scene.tsx`.
- **View history moved into `*_viewed.go` files** (`71bf7466d`) beside the upstream files
  they extend: `pkg/sqlite/scene_viewed.go`, `pkg/models/repository_scene_viewed.go`,
  `internal/api/resolver_model_scene_viewed.go`,
  `internal/api/loaders/dataloaders_viewed.go`. The upstream files keep only the
  embedding, the loader fields and the sort and filter cases.
- The UI half of this is written up in
  [decision 0002](../decisions/0002-fork-code-at-call-sites.md) (added in `7d66983f9`).

## Tried and changed

- **Constants became settings.** The IDs were hardcoded since the features began; a fresh
  database (production's included) has none of them set and shows no carousel and no
  golden cards until they're picked.
- **`useSceneIncrementPlayCount` is upstream's again.** The fork had added an
  `evictLists` flag to it for the 2026-09-10 dwell plays; views no longer need it.
- **The intake folder setting didn't last**: Collections, and the setting with it, were
  removed half an hour later ([entry](2026-10-24-revert-ui-collections.md)).

## Watch out

- **Set the settings once on every database**, production included. Before this they were
  constants.
- `internal/api/scene_featured.go` and `ui/v2.5/src/core/featured.ts` still both name the
  two custom fields; only the group ID is shared through the setting.

## Follow-ups

- None recorded.

## Docs updated

- `docs/codebase/07-this-fork.md`: a new "The fork's settings" section, the golden card
  written up as Feature 6, the moved `featuredGroup.ts` dropped (`7d66983f9`).
- `docs/decisions/0002-fork-code-at-call-sites.md`: how UI fork code is kept apart from
  upstream components, and the `*_viewed.go` naming.
- `docs/decisions/0003-custom-fields-over-schema.md`, `0004-views-apart-from-plays.md`,
  `.claude/skills/add-field/SKILL.md`: brought in line.
- `scripts/doc-refs` checks plain backticked file paths too (`aab3ff771`), which catches
  docs naming files that have moved.

## Commits

- refactor(sqlite,api): move view history into fork-owned files `71bf7466d`
- chore(scripts): check plain file paths in doc-refs `aab3ff771`
- docs: fork settings, golden cards, view-history layout `7d66983f9`
- feat(ui): library settings for the featured group, golden tag and intake folder `38fa82a5d`
  > Settings > Interface > This Library replaces the hardcoded group 25, tag 1414 and
  > folder New, and adds per-page switches for recording a view on hover (landing on,
  > Scenes page off). Hover views are switched on by a ViewOnHover context around a page,
  > rather than a view prop threaded through upstream list components.

## Footprint

```
32 files changed, 1343 insertions(+), 1099 deletions(-)   (38fa82a5d)
52 files changed, 1803 insertions(+), 1336 deletions(-)   (all four, 71bf7466d^..38fa82a5d)
```
