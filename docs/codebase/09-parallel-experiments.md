# 09 — Parallel experiments on one library

How to develop several throwaway features at once, each on its own branch, while all of
them read and write the **same** library: same database, same scanned media, same
generated previews, same settings.

The goal is that an experiment costs nothing to start and nothing to discard. You should
never be reduced to stashing changes because the alternative is re-scanning a library.

## What actually binds a run to your data

`make server-start` (Makefile:343) is three lines that do three unrelated things:

```
  server-start: export STASH_CONFIG_FILE := config.yml
                cd .local && go run ../cmd/stash
                   │              │
                   │              └─► WHICH CODE   — a path relative to the CWD
                   └────────────────► WHICH DATA   — because the CWD is where the
                                                     config's relative paths land

  STASH_CONFIG_FILE ──────────────► WHICH CONFIG  — read at internal/manager/config/init.go:154
```

The middle one is the non-obvious part. `GetDatabasePath`, `GetGeneratedPath`,
`GetBlobsPath` and `GetCachePath` (internal/manager/config/config.go:741-777) return the
config value **raw** — no directory is prepended. So a config saying

```yaml
database: stash-go.sqlite
generated: generated
```

resolves against the **process working directory**, not against the config file. That is
the only reason the Makefile bothers to `cd .local` first.

A handful of other paths *do* hang off the config file's own directory, via
`GetConfigPath()` (config.go:577): the `ffmpeg`/`ffprobe` binaries stash downloads, TLS
certs, and the default backup directory. Those follow `STASH_CONFIG_FILE` wherever it
points.

Because these three bindings are independent, **many checkouts can share one library**.
Point each worktree's build at the same config, and make that config's paths absolute so
the CWD stops mattering.

## ⚠️ Do not symlink `.local` into a worktree

The obvious shortcut — give each worktree a `.local` symlink to the shared one — compiles,
starts, serves, and **runs the wrong branch's code**.

`cd` through a symlink leaves the *physical* working directory somewhere else, and Go
resolves `../cmd/stash` physically:

```
  worktree/.local ─symlink─► shared/.local

  $ cd worktree && cd .local
  $PWD        = worktree/.local          ← the shell's logical view
  $(pwd -P)   = shared/.local            ← what getcwd(2) returns, and what Go sees
  ../cmd/stash → shared/../cmd/stash     ← the ORIGINAL checkout, not the worktree
```

You get a server that reports your branch in `git status` and runs `main-sugoi-ahegao`'s
code. Nothing warns you. Give every worktree a real, empty `.local` instead.

## The layout

```
  ~/projects/
    stash-data/            ← the library. Not a git checkout. Never deleted.
      config.yml               all paths absolute
      stash-go.sqlite
      generated/  blobs/  cache/  plugins/  scrapers/
      
    stash/                 ← main checkout (main-sugoi-ahegao)
      .local/                  real, empty — exists only so `cd .local` works
    stash-idea-x/          ← worktree, branch idea/x
      .local/
    stash-idea-y/          ← worktree, branch idea/y
      .local/
```

Moving the library out of `stash/.local` matters for two reasons: the main checkout is no
longer special, and `make server-clean` (which is `rm -rf .local`) becomes harmless.

## One-time setup

```bash
mv ~/projects/stash/.local ~/projects/stash-data
```

Then rewrite the six relative paths in `stash-data/config.yml` as absolute. The `stash:`
library paths are already absolute and need no change.

```yaml
blobs_path:    /home/pranav/projects/stash-data/blobs
cache:         /home/pranav/projects/stash-data/cache
database:      /home/pranav/projects/stash-data/stash-go.sqlite
generated:     /home/pranav/projects/stash-data/generated
plugins_path:  /home/pranav/projects/stash-data/plugins
scrapers_path: /home/pranav/projects/stash-data/scrapers
```

Now the CWD is irrelevant and any worktree can serve the library. Define:

```bash
alias stash-dev='make server-start STASH_CONFIG_FILE=$HOME/projects/stash-data/config.yml'
```

A variable set on the `make` command line beats the target-specific `export` in
Makefile:344, so `server-start` needs no edit — which keeps rebases onto upstream
`develop` clean.

## Starting an experiment

```bash
git worktree add ../stash-idea-x -b idea/x develop
cd ../stash-idea-x
make pre-ui && make generate
mkdir -p .local
stash-dev                       # backend on :9999
make ui-start                   # in a second terminal
```

`make generate` is **not** optional in a fresh worktree. `internal/api/generated_*.go` and
`ui/v2.5/build/` are both gitignored, and the Go build embeds the UI directory
(`ui/ui.go`), so a bare `go run ./cmd/stash` fails to compile without it. `generate`
depends on `touch-ui` (Makefile:282), which drops a placeholder `build/index.html` — so
you do *not* need a full `make ui` when you're serving the UI from Vite.

Branch each independent experiment off `develop`, not off the fork branch, unless it
genuinely builds on fork code. Doc 07 notes the fork's features are independent of each
other; keeping experiments independent too is what makes them individually rebasable and
individually droppable.

## Discarding one

```bash
git worktree remove ../stash-idea-x --force
git branch -D idea/x
```

The library is untouched — nothing about the experiment ever lived in `stash-data`.

## What can run at the same time

```
                      ┌────────────────────────────────┐
   :3000  vite (idea/x) ──┐                            │
   :3001  vite (idea/y) ──┼──► :9999 stash ──► stash-data/stash-go.sqlite
   :3002  vite (fork)   ──┘    ONE process              │
                      └────────────────────────────────┘
```

- **One backend.** One SQLite file, one job manager, one set of in-process caches. Stop
  one server before starting another. This is the constraint that makes backend work
  serial.

- **Any number of frontends.** Vite asks for port 3000 (vite.config.js:36) and takes the
  next free one, and in dev the UI rewrites the API origin's port to 9999 regardless of
  which port it is served from (`ui/v2.5/src/core/createClient.ts:120`). So every dev
  frontend automatically talks to the single backend, with no environment variable.

That is the setup this fork wants: doc 07 records that the divergence is mostly
`ui/v2.5`, so most experiments are frontend-only and can be compared **side by side, in
two browser tabs, against the same live library**.

⚠️ Cross-origin dev UIs cannot send the session cookie, so this only works while the
server has no credentials configured. It currently has none.

## Hazards of a shared library

⚠️ **Migrations are one-way.** `appSchemaVersion` is 85 (pkg/sqlite/database.go:37). A
branch that adds a migration upgrades the file in place, and every branch still on 85 then
refuses to open it — `pkg/sqlite/database.go:168` rejects a database whose schema is
*newer* than the binary. Back the database up before running such a branch, and treat the
schema version as a property of the library, not of the branch.

⚠️ **`generated/` and `blobs/` are shared mutable state.** A branch that changes preview
generation — as `pkg/scene/generate/preview.go` does on this fork — overwrites artefacts
every other branch displays. For generation-behaviour experiments specifically, give that
one experiment its own `generated:` directory rather than sharing.

⚠️ **The config file is shared, and stash rewrites it.** Saving settings in the UI
rewrites the whole file (`os.WriteFile` at config.go:548), from whichever branch is
running. Usually this is what you want — one set of settings everywhere — but a UI
preference introduced by one experiment persists in the shared `ui:` blob after that
experiment is discarded.

## Escape hatch: genuinely independent backends

When an experiment must not touch the real library at all — a migration, a destructive
task, a generation rewrite — copy the whole thing instead of sharing it:

```bash
cp -r ~/projects/stash-data ~/projects/stash-data-expB
# edit stash-data-expB/config.yml: port: 9998, and repoint the six absolute paths
make server-start STASH_CONFIG_FILE=$HOME/projects/stash-data-expB/config.yml
```

Two servers, two libraries, no interaction, at the cost of a full copy of `generated/`.
Point a dev UI at it with `VITE_APP_PLATFORM_URL=http://localhost:9998 make ui-start`.

## Cheat sheet

| Task | Command |
|---|---|
| New experiment | `git worktree add ../stash-idea-x -b idea/x develop` |
| Bootstrap it | `make pre-ui && make generate && mkdir -p .local` |
| Run the backend | `stash-dev` (any worktree, one at a time) |
| Run a frontend | `make ui-start` (any number, auto-finds a port) |
| Drop it | `git worktree remove ../stash-idea-x --force && git branch -D idea/x` |
| List experiments | `git worktree list` |
| Isolated library | copy `stash-data`, change `port:` and the six paths |
