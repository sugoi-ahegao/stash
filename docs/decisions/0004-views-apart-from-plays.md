# 0004 — Views are tracked apart from plays

Date: 2026-09-21 · Status: accepted (replaces "opening a scene counts as a play", 2026-08)

## Context

The fork first made opening a scene page, dwelling on a landing card, and a card button all
record a *play*. That made "I've seen this" and "I watched this" the same number, so
neither could be trusted, and `minimumPlayPercent` stopped meaning anything.

## Decision

A **view** is the scene being surfaced: its page opened, its card dwelled on, or marked
viewed by hand. It has its own history (`scenes_viewed_dates`, fork migration 1),
`view_count` / `last_viewed_at` filters and sorts, and `sceneAddView` / `sceneDeleteView`
/ `sceneResetViewCount` mutations. A **play** goes back to upstream's meaning: the player
records it once the video runs past `minimumPlayPercent`.

The migration seeded view history from play history once. After that the two are
independent and nothing copies between them.

## Consequences

- ⚠️ Naming trap: the store `viewedDateManager` (table `scenes_viewed_dates`) is VIEW
  history. Upstream's `viewDateManager` (table `scenes_view_dates`) is PLAY history.
- Every path that records "seen" calls `sceneAddView`, never `sceneAddPlay`.
- `useSceneAddView` defaults to `evictLists: false`, because most callers record from
  inside a visible list and a refetch would pull the grid out from under the cursor.
- Merge, import and export carry view history alongside play history.
