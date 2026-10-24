# 11 — Production, development and worktrees

How this fork is run day to day: the real library lives in a native Windows `stash.exe`,
development happens in WSL against a copy of it, and every branch gets a worktree with a
copy of its own. `scripts/prod` runs production; worktrunk (`wt`) and `scripts/worktree`
run the worktrees.

## The layout

```
  PRODUCTION   C:\Users\Pranav\.stash\           stash.exe    port 9999   DLNA on
                                                              parallel_tasks 3
        ▲
        │  code only     scripts/prod ship
        │
  DEV          stash.worktrees/stash/.local/     make server-start
                                                              port 9998   DLNA off
        │                                                     parallel_tasks 1
        │  data only     scripts/prod pull-data   (production ──► dev)
        ▼
  WORKTREES    stash.worktrees/<branch>/.local/  wt switch -c <branch>
                                                              port 9997…  DLNA off
```

**Code goes up, data comes down.** Nothing done in dev or a worktree can change the real
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

  ~/projects/stash.worktrees/
    stash/.local/                  dev (the main checkout)
      config.yml  stash-go.sqlite  generated/  blobs/  cache/

    <branch>/                      worktree (wt switch -c <branch>)
      .local/                      its own copy: config.yml  stash-go.sqlite  generated/ …
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
| data paths (`database`, `generated`, …) | `C:\Users\Pranav\.stash\…` | `~/projects/stash.worktrees/stash/.local/…` |
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
`scripts/worktree setup` writes each worktree's own. A worktree made with plain
`git worktree add` has none, and its dev UI would edit the real library: make worktrees
with `wt switch -c`, or run `scripts/worktree setup` in one made by hand.

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

UI code that parses paths must accept both separators.

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
     │                     restart stash.exe (seconds down)     ~25 s
     │
     └─ no  ──► full       build UI + stash.exe  (production still up)
                           stop stash.exe  ─┐
                           swap exe + ui    ├ a few seconds of downtime
                           start stash.exe ─┘                    ~3 min
```

The UI-only path skips rebuilding stash.exe because production serves its UI from
`ui_location` (`internal/api/server.go:249`) instead of the copy embedded in the binary.
It still restarts stash.exe: that folder is served by statigz, which indexes it once at
startup (`statigz.FileServer`), so new hashed assets 404 until the next start - the page
loads, but blank. Skipping the restart is what took production's UI down on 2026-10-24.

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
branch, never from an experiment.** Test them in a worktree first: worktrees have their own
database copy, so a migration there touches nothing else.

Upstream migrations arrive through `scripts/upstream-sync` (doc 12). That merges and tests
in a worktree set up like any other, so the migrate page is something you've already clicked
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

## Worktrees

Every branch gets its own worktree from [worktrunk](https://worktrunk.dev), and every
worktree gets its own copy of the **dev** library and its own ports. The hooks in
`.config/wt.toml` call `scripts/worktree`.

```bash
wt sw -c idea/x            # (wt switch --create) branch from main-sugoi-ahegao, set up, cd in
make server-start          # backend on this worktree's port
make ui-start              # vite on this worktree's UI port, talking to that backend
scripts/worktree ls        # every checkout, its ports, up/down
scripts/worktree refresh   # re-copy the dev library, discarding this worktree's changes
wt ls                      # (wt list)
wt rm idea/x               # (wt remove) refuses while its server or dev UI is running
```

`ls`, `sw` and `rm` are aliases in `~/.config/worktrunk/config.toml`. Worktrunk's default
branch is set to `main-sugoi-ahegao` (`wt config state default-branch set`), so new
branches start from the fork, not upstream's `develop`.

`wt switch -c` starts nothing. What runs when:

```
  pre-start   (blocks, ~5 s)   scripts/worktree setup
                                 picks the highest free port pair below the main checkout's
                                 copies the dev library into <worktree>/.local/
                                 writes ui/v2.5/.env.development.local
  post-start  (background)     scripts/worktree deps
                                 pnpm install + make generate, about 2 minutes.
                                 Progress: wt config state logs. make server-start
                                 fails until it's done (missing generated_*.go).
  pre-remove  (blocks)         scripts/worktree check-stopped
```

Ports:

| checkout | server | dev UI |
|---|---|---|
| production | 9999 | — |
| main checkout | 9998 | 3998 |
| worktrees | 9997, 9996, … | 3997, 3996, … |

The two move together, so either one tells you which worktree it is. A pair is free when
no other worktree's config claims it and nothing is listening on it. Ports come back to the
pool when their worktree is removed. The server port is `port:` in `.local/config.yml`.
The UI port is `STASH_UI_PORT` in `.env.development.local`, which `vite.config.js` reads
(`strictPort`, so a taken port fails loudly instead of drifting to the next one).

Every checkout lives in `~/projects/stash.worktrees/`: the main checkout is `stash/`, and
each worktree sits beside it, named after its branch (`/` becomes `-`). That's
`worktree-path` under `[projects."github.com/sugoi-ahegao/stash"]` in
`~/.config/worktrunk/config.toml`; `scripts/upstream-sync` assumes the same layout.
The hooks run the main checkout's `scripts/worktree`, so branches made before the script
existed still get it.

How the copy is made, and why it's safe:

```
  database     sqlite3 -readonly .backup   (read-only, or closing the connection
                                            checkpoints the source WAL into its main file)
  generated/   cp -al  hard links: instant, no extra disk. Safe because stash writes
  blobs/               generated files to a temp path and renames them into place
                       (pkg/scene/generate/generator.go:100), and blobs are named by
                       checksum. A worktree replacing or deleting a file only affects
                       its own link.
  config.yml   copied, with absolute paths, its own port, DLNA off
```

⚠️ **Media is shared and unprotected.** Deleting a scene *with its file* in a worktree or
in dev deletes the real video.

To try a worktree's code on the real library, ship from it:
`cd ~/projects/stash.worktrees/idea-x && ../stash/scripts/prod ship`. `scripts/prod`
ships whichever checkout it's run from (`git rev-parse --show-toplevel`), so the main
checkout's copy works even if the branch doesn't have the script. Mind the migration rule
above.

## Squashing

Work on a branch (a worktree makes that cheap), then fold it into the main branch as one
commit:

```bash
git checkout main-sugoi-ahegao
git merge --squash idea/x && git commit
wt rm -D idea/x               # -D: the squashed branch looks unmerged
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
| Develop | `stash server` + `stash ui` in any checkout (`scripts/dev`; main checkout: backend 9998, UI 3998) |
| Ship to production | `scripts/prod ship` |
| What's in production | `scripts/prod status` |
| Refresh dev from production | `scripts/prod pull-data` |
| Start / stop production | Stash shortcut or tray icon, or `scripts/prod start` / `stop` |
| Production log | `scripts/prod logs` |
| Try a branch | `wt sw -c <branch>`, then `make server-start` + `make ui-start` |
| List / remove worktrees | `scripts/worktree ls` (ports) or `wt ls` / `wt rm <branch>` |
| Merge upstream stash | `scripts/upstream-sync start`, then `finish` in its worktree (doc 12) |
