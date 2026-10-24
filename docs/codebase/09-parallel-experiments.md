# 09 — Parallel experiments (superseded)

This doc described running several branches against **one shared library** in
`stash/.local`, one backend at a time, on port 9999.

That setup is gone. See **[11 — Production, development and previews](11-production-and-dev.md)**:

- the real library is now a native Windows `stash.exe` (port 9999);
- dev runs on its own copy (port 9998);
- each branch gets a fully isolated preview (`scripts/preview`) with its own database,
  so several backends can run at once.

⚠️ Following the old instructions now would point a dev UI at port 9999, which is
production.

The previous version is in git history: `git show 1b4740b4:docs/codebase/09-parallel-experiments.md`.
