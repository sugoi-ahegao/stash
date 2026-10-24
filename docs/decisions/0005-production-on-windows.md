# 0005 — Production is a native Windows binary

Date: 2026-10-23 · Status: accepted

## Context

Development happens in WSL. The obvious production setup is to run stash there too. Speed
isn't a reason not to: reading media through WSL's 9P bridge measured about the same as
native reads, because the spinning disk is the limit either way.

But a server inside WSL2 sits behind NAT. TVs and phones can't reach it, and DLNA's
multicast discovery never leaves the VM.

## Decision

Production is a cross-compiled `stash.exe` on Windows (`C:\Users\<you>\.stash`, port
9999), built and shipped from WSL by `scripts/prod`. Dev runs in WSL on 9998, worktrees on
9997 and below.

## Consequences

- The LAN works, and production gets a tray icon, a Start menu shortcut, and no dependency
  on a WSL terminal being open.
- Builds need the mingw-w64 cross compiler (cgo, for SQLite).
- Paths are stored per host, so moving data between dev and production converts them
  (`scripts/prod setup`, `pull-data`).
- Production is the library actually in use. Agents must ask before running anything that
  ships to, stops, or reads and writes it; `.claude/hooks/guard-prod` enforces that.
- Full write-up: [`docs/codebase/11-production-and-dev.md`](../codebase/11-production-and-dev.md).
