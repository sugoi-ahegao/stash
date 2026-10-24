# 0006 — A UI-only ship still restarts production

Date: 2026-10-24 · Status: accepted

## Context

`scripts/prod ship` skips rebuilding `stash.exe` when only `ui/v2.5/` changed, because
production serves its UI from `ui_location` rather than the copy embedded in the binary.
It first left `stash.exe` running as well. But that folder is served by statigz, which
indexes it once at startup, so the new hashed assets returned 404. The page loaded blank,
and production's UI was down on 2026-10-24 until a restart.

## Decision

The UI-only path copies the new build in, then stops and restarts `stash.exe`. It still
skips the rebuild, so it takes about 25 seconds instead of about 3 minutes.

## Consequences

- A few seconds of downtime on every ship, UI-only or not.
- Don't "optimise" the restart away. Anything that changes files under `ui_location` while
  stash runs needs a restart to be served.
