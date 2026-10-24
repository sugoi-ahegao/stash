# 0003 — Prefer custom fields and UI config to schema

Date: 2026-08-28 · Status: accepted

## Context

Every column or table the fork adds is a migration to maintain
([0001](0001-fork-migration-stream.md)), GraphQL schema that can conflict on merge, and
import/export code to keep in step. Upstream already offers extension surfaces that need
none of that: scene custom fields, the `IUIConfig` blob, groups, and plugins.

## Decision

Reach for those first. The featured carousel is built entirely on an existing group plus
two custom fields (`featured_added_at`, `feature_unlocked_at`), with no schema change.
Add schema only when the data can't be expressed that way. View history
([0004](0004-views-apart-from-plays.md)) is the one case so far: it needs its own
filterable, sortable history table.

## Consequences

- No migration, and nothing for upstream merges to conflict with.
- Custom fields can't be sorted or filtered server-side. The carousel fetches the whole
  group and sorts client-side, which is fine at its size and unbounded as it grows.
- Custom-field updates have three modes, and `full` replaces the whole map. Use `partial`
  to set and `remove` to delete, or unrelated fields get clobbered.
- `FEATURED_GROUP_ID = "25"` is a row id in this one library. Moving it to `IUIConfig` is
  the known fix.
- Details: [`docs/codebase/07-this-fork.md`](../codebase/07-this-fork.md), Feature 1.
