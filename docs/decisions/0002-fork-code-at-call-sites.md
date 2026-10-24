# 0002 — Fork server code lives in its own files, hooked in by call sites

Date: 2026-10-24 · Status: accepted

## Context

A merge conflict needs both sides to change the same lines. The featured carousel first
changed `sceneUpdate`'s signature, which touched every return in it:
`resolver_mutation_scene.go` carried 163 fork lines, all of them conflict surface for the
next upstream merge.

## Decision

New server behaviour goes in a new file. Upstream files only get a call into it, each line
marked `// fork`, so `grep -rn '// fork'` lists every hook. Upstream function signatures are
never changed; the fork wraps them instead (`featuredTracker.sceneUpdate` wraps
`sceneUpdate` in `internal/api/scene_featured.go`).

## Consequences

- `resolver_mutation_scene.go` went from 163 fork lines to 21, and a rehearsal merge of 44
  upstream commits had no server-side conflicts.
- Wrapping is sometimes clumsier than editing the function would be. That's the price.
- `scripts/upstream-sync status` lists the upstream files the fork still modifies.
- Generated files follow the same idea: they're regenerated or taken from upstream, never
  merged by hand.
- Full write-up: [`docs/codebase/12-upstream-sync.md`](../codebase/12-upstream-sync.md).
