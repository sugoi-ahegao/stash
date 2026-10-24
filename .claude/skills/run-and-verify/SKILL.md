---
name: run-and-verify
description: Start this checkout's stash backend and Vite UI and look at a change in the real app with Playwright (navigate, click, screenshot). Use after changing UI or GraphQL behaviour, before saying a change works, or when asked to run, start, or screenshot stash.
---

# Run stash and check a change in the browser

Type checks and tests don't show you a layout, a card, or a carousel. Look at the page.

## Ports: never production

| Checkout | Backend | UI (Vite) |
|---|---|---|
| production (Windows `stash.exe`) | 9999 | — never touch it |
| main checkout (`stash.worktrees/stash`) | 9998 | 3998 |
| worktrees | 9997, 9996, … | 3997, 3996, … |

This checkout's ports are in `.local/config.yml` (`port:`) and
`ui/v2.5/.env.development.local` (`STASH_UI_PORT`). `scripts/worktree ls` lists every
checkout, its ports, and whether it's running.

## Start

1. See what's already up: `scripts/worktree ls`. If this checkout's backend and UI are
   running, use them and skip to *Look*. The user often has them open.
2. Backend, as a background command: `scripts/dev server`. It refuses if the port is taken.
   After **Go or schema** changes the backend must be restarted, because it doesn't
   hot-reload. Stop only a backend you started yourself.
3. UI, as a second background command: `scripts/dev ui`. Vite hot-reloads `ui/v2.5/src`,
   so UI-only changes need no restart.
4. Wait until both ports answer, e.g. `curl -sf localhost:9998/healthz` or
   `curl -sf localhost:3998`. The first backend start compiles Go and can take a few
   minutes.

Dev has no login. If you get 401s, auth was turned on in `.local/config.yml`; ask the user
rather than changing it.

## Look

Load the Playwright tools (`ToolSearch` with `+playwright`), then:

- `browser_navigate` to `http://localhost:<UI port>/<route>`: `/scenes`, `/scenes/<id>`,
  `/landing`, `/settings`.
- `browser_snapshot` to read the page structure and find elements; `browser_click` /
  `browser_type` to act.
- `browser_take_screenshot` for anything visual. Check light and dark if styles changed,
  and both themes (Blueprint, pb; the palette menu in the navbar).
- `browser_console_messages` for React errors and failed GraphQL calls.

The data is a **copy** of the library, but media files are shared. Don't delete scenes
"with file", run Clean, or run anything else that touches files on disk.

## Report

Say what you looked at and what you saw, with the screenshot. If something was off, say so,
even if the tests pass.

## Stop

Stop the servers you started (`TaskStop` on their background tasks). Leave ones you found
running alone.
