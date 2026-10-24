# Stash — this fork

A personal fork of [stash](https://github.com/stashapp/stash) on branch `main-sugoi-ahegao`.
Upstream is `upstream/develop`. One Go binary embeds a React SPA (`ui/v2.5`) and talks to
one SQLite file. Everything goes through GraphQL (`/graphql`), except media, which streams
over REST.

`README.md` and `docs/*.md` are upstream's. `docs/AI_POLICY.md` governs pull requests *to
upstream* and doesn't apply to work on this fork. Don't edit upstream's docs: changes
there only conflict on the next merge.

## Read before you change things

| You're… | Read |
|---|---|
| new here | [`docs/codebase/README.md`](docs/codebase/README.md), then [01 orientation](docs/codebase/01-orientation.md) |
| touching resolvers, mutations, transactions | [02 request lifecycle](docs/codebase/02-backend-request-lifecycle.md) |
| adding a filter or sort | [03 query & filter engine](docs/codebase/03-query-filter-engine.md) |
| changing the schema or storage | [04 migrations](docs/codebase/04-database-migrations.md), [12 upstream sync](docs/codebase/12-upstream-sync.md), the `add-field` skill |
| working in the UI | [05 frontend architecture](docs/codebase/05-frontend-architecture.md), [08 components](docs/codebase/08-frontend-components.md) |
| looking for a recipe or a known trap | [06 recipes & gotchas](docs/codebase/06-recipes-and-gotchas.md) |
| changing a fork feature | [07 this fork](docs/codebase/07-this-fork.md) |
| running, shipping, worktrees | [11 production & dev](docs/codebase/11-production-and-dev.md) |
| wondering why something is the way it is | [`docs/decisions/`](docs/decisions/README.md) |
| wondering what changed recently | [`FORK_CHANGELOG.md`](FORK_CHANGELOG.md), `git log` |

## Rules

1. **Never hand-edit generated code.** Change `graphql/schema/` or `ui/v2.5/graphql/` and
   run `make generate`. Covers `internal/api/generated_*.go`,
   `ui/v2.5/src/core/generated-graphql.ts`, `pkg/models/mocks/` and `pkg/stashbox/graphql/`.
2. **Fork server code goes in new files.** Upstream files get only a call into it, marked
   `// fork`. Never change an upstream function's signature; wrap it.
   ([0002](docs/decisions/0002-fork-code-at-call-sites.md))
3. **Prefer custom fields, `IUIConfig` and groups to schema.**
   ([0003](docs/decisions/0003-custom-fields-over-schema.md))
4. **Fork migrations go in `pkg/sqlite/migrations_fork/`, numbered from 1, creating only
   tables of their own.** Never touch `pkg/sqlite/migrations/` or `appSchemaVersion`.
   ([0001](docs/decisions/0001-fork-migration-stream.md))
5. **Production is off limits unless asked.** It's the Windows `stash.exe` on :9999 with
   the real library. Develop against dev (:9998) or a worktree (:9997 and below). Ship only
   when the user asks (the `ship-to-prod` skill).
6. **Views aren't plays.** Recording that a scene was seen calls `sceneAddView`. Plays are
   the player's. ([0004](docs/decisions/0004-views-apart-from-plays.md))
7. **Commit only when asked.** Use conventional-commit subjects (`feat(ui): …`,
   `fix(sqlite): …`, `tune(ui): …`, `refactor(api): …`). They become `FORK_CHANGELOG.md`.

Hooks in `.claude/settings.json` enforce 1, 4 and 5 for agents (`.claude/hooks/`).

## Commands

```bash
scripts/check            # before calling anything done: generate, gofmt, vet, lint, test, UI validate,
                         # migration rules, doc references. --quick: only what's uncommitted. --it: + integration
make generate            # after any schema or ui/v2.5/graphql change
scripts/dev server       # this checkout's backend (main checkout :9998); restart after Go changes
scripts/dev ui           # Vite UI (main checkout :3998), hot-reloads
scripts/worktree ls      # every checkout, its ports, what's running
scripts/changelog        # regenerate FORK_CHANGELOG.md (after committing)
scripts/prod status      # what production runs (read-only)
```

Go tests need the SQLite build tags. `scripts/check` passes them; by hand, use
`go test -tags "sqlite_stat4 sqlite_math_functions" ./pkg/...`.

## Skills (`.claude/skills/`)

- `run-and-verify`: start the app and look at a change with Playwright. Do this for UI
  changes before saying they work.
- `add-field`: new stored or queryable data, end to end, the fork's way.
- `ship-to-prod`: ship this checkout to production.
- `upstream-sync`: merge upstream stash in its own worktree.

## Two changelogs

`FORK_CHANGELOG.md` is the fork's history, generated from commit subjects by
`scripts/changelog`. It only covers committed work: commit, run `scripts/changelog`, then
commit the file as `chore(changelog): update FORK_CHANGELOG.md` (that exact subject is
left out of the changelog). `ui/v2.5/src/docs/en/Changelog/` is **upstream's** release notes,
shown in the app. Never put fork changes there.
([0007](docs/decisions/0007-fork-changelog.md))

## Keeping docs true

When a change alters behaviour that `docs/codebase/` or `docs/decisions/` describes,
update that doc in the same change. When you choose between real alternatives, add a
decision. `scripts/doc-refs` (part of `scripts/check`) catches backticked file paths that
name nothing, and `file:line` references that point past the end of a file. A line that
still exists but now holds different code isn't caught, so prefer naming the symbol next to
the line number.
