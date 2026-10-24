---
name: add-field
description: Add a field, filter, sort or piece of stored data to scenes (or another entity) end to end - deciding between custom fields, UI config and real schema, then GraphQL schema, fork migration, store, resolver, filter, import/export and UI. Use when a feature needs to store or query new data.
---

# Add data to an entity, end to end

The generic walkthrough is in
[`docs/codebase/06-recipes-and-gotchas.md`](../../../docs/codebase/06-recipes-and-gotchas.md)
("Recipe: add a field to Scene"). This skill adds the fork's rules on top. Read the recipe
first.

## 1. Do you need schema at all?

Most fork features don't ([decision 0003](../../../docs/decisions/0003-custom-fields-over-schema.md)).
Choose the first one that works:

| Need | Use | Cost |
|---|---|---|
| A per-user UI preference | `IUIConfig` key (`ui/v2.5/src/core/config.ts`) | none. Use single capitals: `showUrls`, not `showURLs` |
| A per-entity value you don't filter or sort on server-side | custom fields: `custom_fields: { partial: {...} }` to set, `{ remove: [...] }` to delete, never `full` | no migration, no schema |
| A set of entities | a group or tag | none |
| Filterable, sortable, or historical data | a fork migration and schema | everything below |

If you're past the table, tell the user which row ruled out the cheaper options.

## 2. Schema and generated code

- Edit `graphql/schema/` (types, inputs, filters), then the UI's documents in
  `ui/v2.5/graphql/`. Put a field the list views need in the `*_slim` fragment too, or it's
  `undefined` in lists.
- `make generate`. Never edit `generated_*.go` or `generated-graphql.ts` (the hook refuses).

## 3. Storage: a fork migration

Rules: [`pkg/sqlite/migrations_fork/README.md`](../../../pkg/sqlite/migrations_fork/README.md).

- `pkg/sqlite/migrations_fork/N_description.up.sql`, next N, and bump
  `forkSchemaVersion` in `pkg/sqlite/fork_migrate.go`.
- **Create a table of your own**, keyed by the upstream row's id with a foreign key.
  Never add a column to, alter, or drop an upstream table.
- `scripts/upstream-sync check` must pass.

## 4. Server code, the fork's way

[Decision 0002](../../../docs/decisions/0002-fork-code-at-call-sites.md): new behaviour
goes in **new files** (e.g. `internal/api/resolver_mutation_scene_view.go`). Additions to
an upstream type or package go in a fork file in the same package, named after the upstream
file (`pkg/sqlite/scene_viewed.go` beside `scene.go`, `resolver_model_scene_viewed.go`).
Where an upstream file must call it, add one line and mark it `// fork`. Don't change upstream function signatures; wrap them.

Checklist, with doc 06's gotchas:

- [ ] store: read/write, and a dataloader if the field is resolved per row in lists
      (`internal/api/loaders/`, in a file of its own; `make generate-dataloaders` output for
      `time.Time` needs the import hand-fixed)
- [ ] model + `*Partial` `Optional*` field + `translator.optional*` call, or updates
      silently drop the value
- [ ] resolver(s); mutations fire plugin hooks after commit, never inside the txn
- [ ] filter/sort in `pkg/sqlite/*_filter.go`, with joins through `filterBuilder` so OR
      filters keep their left joins (doc 03)
- [ ] `pkg/models/jsonschema` + export/import, or a backup round-trip loses the data
- [ ] scene merge (`pkg/scene/merge.go`) if the data should follow a merged scene
- [ ] `make generate-test-mocks` if an interface changed
- [ ] a test next to the store or filter code

## 5. UI

- Mutations go through `ui/v2.5/src/core/StashService.ts` wrappers, which evict the right
  Apollo caches. Not the raw generated hooks.
- New filter criteria: the criterion **type key** is a persisted format (bookmarked URLs,
  saved filters), so never rename one later.
- Strings in `ui/v2.5/src/locales/en-GB.json`.

## 6. Done means

- `scripts/check` passes.
- Seen working in the app (the `run-and-verify` skill), including that the migration ran on
  this checkout's library copy.
- Docs: if the feature is user-visible or changes how something works, update
  `docs/codebase/07-this-fork.md`. If you chose between real alternatives, add a decision in
  `docs/decisions/`.
- Commit subject in conventional form (`feat(scene): ...`), because it becomes the
  `FORK_CHANGELOG.md` entry. Commit only when the user asks.
