# 11 — Production, development and previews

How this fork is run day to day: the real library lives in a native Windows `stash.exe`,
development happens in WSL against a copy of it, and branches get throwaway previews.
Two scripts do all of it: `scripts/prod` and `scripts/preview`.

## The layout

```
  PRODUCTION   C:\Users\Pranav\.stash\           stash.exe    port 9999   DLNA on
                                                              parallel_tasks 3
        ▲
        │  code only     scripts/prod ship
        │
  DEV          ~/projects/stash/.local/          make server-start
                                                              port 9998   DLNA off
        │                                                     parallel_tasks 1
        │  data only     scripts/prod pull-data   (production ──► dev)
        ▼
  PREVIEWS     ~/projects/stash-previews/<name>/  scripts/preview
                                                              port 10000+ DLNA off
```

**Code goes up, data comes down.** Nothing done in dev or a preview can change the real
library, and nothing ever copies dev data into production.

The media files themselves (`D:`, `E:`, `F:`) are not copied anywhere. Every server reads
them in place.

### Why production is a Windows binary

Not for speed. Measured on drive E:, reading media through WSL's 9P bridge is no slower
in practice than reading it natively: the spinning disk is the limit either way.

| | WSL | native Windows |
|---|---|---|
| sequential read | 128 MB/s | 133–178 MB/s |
| random 64 KB read | 7.9–8.2 ms | 7.5–7.9 ms |
| stat the whole E: library | 0.6 s | 0.3 s |

It's a Windows binary because that makes the LAN work. A server inside WSL2 sits behind
NAT, so TVs and phones can't reach it and DLNA's multicast discovery never leaves the VM.
A native `stash.exe` is on the LAN directly. It also gets a tray icon, a Start menu
shortcut, and no dependency on a WSL terminal being open.

## What lives where

```
  C:\Users\Pranav\.stash\          production
    stash.exe                      shipped binary
    config.yml                     production settings (stash's default config location)
    stash-go.sqlite                the real library
    generated\  blobs\  cache\     production's own copies
    ui\                            served instead of the embedded UI (ui_location)
    stash.log                      logfile
    shipped                        "<commit> <branch> [(+ uncommitted changes)]"

  ~/projects/stash/.local/         dev
    config.yml  stash-go.sqlite  generated/  blobs/  cache/

  ~/projects/stash-previews/
    <name>/                        git worktree for the preview's branch
    .data/<name>/                  that preview's library copy, config, log, pid
```

Each of the three has **its own database** and **its own `generated/` and `blobs/`**.
They are copies, not shared files.

`.stash` is the second entry in stash's `defaultConfigLocations`
(`internal/manager/config/init.go:30`), so `stash.exe` finds its config with no
arguments: from the Desktop/Start menu shortcut, from `stash` on the PATH, or from the
tray. Setup adds the shortcuts and the PATH entry.

## How dev and production configs differ

Production's config is the source of truth. `pull-data` regenerates dev's config from it,
changing only:

| setting | production | dev |
|---|---|---|
| `port` | 9999 | 9998 |
| `dlna.default_enabled` | true | false |
| `parallel_tasks` | 3 | 1 |
| data paths (`database`, `generated`, …) | `C:\Users\Pranav\.stash\…` | `~/projects/stash/.local/…` |
| library roots (`stash:`) | `D:\sys.tmp\…` | `/mnt/d/sys.tmp/…` |
| `ui_location`, `logfile` | set | unset |

`nobrowser: true` in both: neither opens a browser on startup. The only place stash opens
one is `internal/desktop/desktop.go:43`, gated on that setting.

The dev overrides are `DEV_OVERRIDES` at the top of `scripts/prod`.

⚠️ **Change settings in production, not dev.** `pull-data` overwrites dev's config, so a
setting changed only in dev is lost on the next pull.

⚠️ **The dev UI must not talk to port 9999.** The vite dev server runs in a Windows
browser, where `localhost:9999` *is production*. `ui/v2.5/.env.development.local`
(gitignored) sets `VITE_APP_PLATFORM_PORT=9998` in the main checkout, and
`scripts/preview dev` passes each preview's port explicitly. A new worktree created by hand
has neither, and its dev UI would edit the real library.

## Paths are stored per host

The database stores every file's location in one column, `folders.path`. Files only point
at their folder. Windows stash writes `D:\a\b`, Linux stash writes `/mnt/d/a/b`, and
neither recognises the other's form. It would treat every file as missing and rescan the
library as new scenes.

So every copy between the two converts paths:

```
  setup       /mnt/d/a/b  ──►  D:\a\b       folders.path + the config's library roots
  pull-data   D:\a\b      ──►  /mnt/d/a/b
```

`convert_db_paths` and `convert_config` in `scripts/prod`. Both check the result
(no unconverted paths left, `pragma integrity_check` passes) before replacing anything.

Zip contents are stored as folders under the zip (`…\photos.zip\000034.jpg`) and convert
the same way; they don't exist as real files on disk.

UI code that parses paths must accept both separators. `src/core/collections.ts:55` is
the example.

## Shipping

```bash
scripts/prod ship            # decides UI-only vs full from what changed
scripts/prod ship --ui       # force UI-only
scripts/prod ship --full     # force a full rebuild + restart
scripts/prod status          # what production runs, and how far this checkout differs
```

`ship` ships **the checkout you run it from**: the main checkout or any worktree,
including uncommitted changes. It compares that against the commit recorded in
`.stash\shipped`:

```
  every changed file under ui/v2.5/ ?
     │
     ├─ yes ──► UI-only    build the UI, copy it into .stash\ui
     │                     no restart; reload the page          ~25 s
     │
     └─ no  ──► full       build UI + stash.exe  (production still up)
                           stop stash.exe  ─┐
                           swap exe + ui    ├ a few seconds of downtime
                           start stash.exe ─┘                    ~3 min
```

The UI-only path works because production serves its UI from `ui_location`
(`internal/api/server.go:249`) instead of the copy embedded in the binary. The copy writes
the new hashed assets first, then `index.html`, then prunes old assets, so a page loaded
mid-ship never references a missing file.

Stopping asks stash to close, then forces it after 10 seconds. There is no shutdown
mutation; SQLite is crash-safe if the force is needed.

### ⚠️ Migrations are one-way

There are two kinds, and production takes them differently (doc 12):

```
  upstream migration   stash starts on the migrate page; click Migrate. It backs up first
                       and restores the backup if the migration fails.
  fork migration       runs by itself at startup, after a backup to
                       stash-go.sqlite.fork<old version>.<timestamp> beside the database.
                       If it fails, stash restores that backup and doesn't start (stash.log).
```

An older binary refuses a newer schema of either kind: upstream's at
`pkg/sqlite/database.go:168`, the fork's with `MismatchedForkSchemaVersionError`. So shipping
a branch with a migration and then shipping one without it leaves production unable to
start until that backup is restored. **Ship migrations deliberately, from the main
branch, never from an experiment.** Test them in a preview first: previews have their own
database copy, so a migration there touches nothing else.

Upstream migrations arrive through `scripts/upstream-sync` (doc 12). That merges and tests
in a preview-ready worktree, so the migrate page is something you've already clicked
through on a copy before production shows it.

## Pulling data into dev

```bash
scripts/prod pull-data       # dev server must be stopped
```

Replaces dev's database, `generated/`, `blobs/`, plugins, scrapers and config with
production's. Anything changed only in dev is lost. About 30 s once the first sync is done:
`rsync` only copies what changed.

With production running, the database comes from production's own `backupDatabase`
mutation (a `VACUUM INTO` snapshot). With it stopped, the file is copied directly.

⚠️ **Never open production's live database from WSL.** SQLite's WAL mode coordinates
through a shared-memory file (`-shm`), which doesn't work across the 9P bridge. Even a
read-only `sqlite3` fails with `disk I/O error` while `stash.exe` runs. Ask production for a
backup instead, as `pull-data` does.

## Previews

One per branch, each fully isolated: its own worktree, its own server process and port,
and its own copy of the **dev** library.

```bash
scripts/preview new idea/x            # branch from the current branch, snapshot, build, start
scripts/preview new idea/x develop    # ...branching from develop instead
scripts/preview ls                    # previews, branches, status, URLs
scripts/preview dev idea-x            # hot-reloading UI against that preview's server
scripts/preview up idea-x             # rebuild if the code changed, restart
scripts/preview up idea-x --fresh     # also re-copy the library, discarding preview changes
scripts/preview logs idea-x
scripts/preview down idea-x           # stop
scripts/preview rm idea-x             # stop, delete worktree + library copy (keeps the branch)
```

Names are the branch with `/` turned into `-`. A first build takes about 1.5 minutes.

How the copy is made, and why it's safe:

```
  database     sqlite3 -readonly .backup   (read-only, or closing the connection
                                            checkpoints the source WAL into its main file)
  generated/   cp -al  hard links: instant, no extra disk. Safe because stash writes
  blobs/               generated files to a temp path and renames them into place
                       (pkg/scene/generate/generator.go:100), and blobs are named by
                       checksum. A preview replacing or deleting a file only affects
                       its own link.
  config.yml   copied, with absolute paths, its own port, DLNA off
```

Two previews running together were checked to be isolated: a tag created in one appeared
in neither the other nor the dev library.

⚠️ **Media is shared and unprotected.** Deleting a scene *with its file* in a preview or
in dev deletes the real video.

To try a preview's code on the real library, ship from its worktree:
`cd ~/projects/stash-previews/idea-x && ~/projects/stash/scripts/prod ship`. `scripts/prod`
ships whichever checkout it's run from (`git rev-parse --show-toplevel`), so the main
checkout's copy works even if the branch doesn't have the script. Mind the migration rule
above.

## Squashing

Work on a branch (a preview makes that cheap), then fold it into the main branch as one
commit:

```bash
git checkout main-sugoi-ahegao
git merge --squash idea/x && git commit
scripts/preview rm idea-x && git branch -D idea/x
```

Or open a PR on the fork and use GitHub's "Squash and merge".

## One-time setup (already done, 2026-10-23)

```bash
sudo apt install -y gcc-mingw-w64-x86-64    # Windows cross compiler (cgo, for sqlite)
scripts/prod setup
```

`setup` builds `stash.exe`, copies the dev library into `.stash` (converting paths), writes
production's config, switches dev to its overrides, writes `.env.development.local`, adds
the shortcuts and PATH entry, and starts production. It refuses to run if `.stash` already
has a library.

Optional: `scripts/prod autostart` starts production at Windows login.

On first start, allow `stash.exe` through Windows Firewall on **Private** networks. That
opens the web UI (9999) and DLNA (1338) to the LAN. If devices still can't connect, check
NordVPN's "Invisibility on LAN".

## Cheat sheet

| Task | Command |
|---|---|
| Develop | `make server-start` + `make ui-start` (dev, port 9998) |
| Ship to production | `scripts/prod ship` |
| What's in production | `scripts/prod status` |
| Refresh dev from production | `scripts/prod pull-data` |
| Start / stop production | Stash shortcut or tray icon, or `scripts/prod start` / `stop` |
| Production log | `scripts/prod logs` |
| Try a branch | `scripts/preview new <branch>` |
| List / remove previews | `scripts/preview ls` / `scripts/preview rm <name>` |
| Merge upstream stash | `scripts/upstream-sync start`, then `finish` in its worktree (doc 12) |
