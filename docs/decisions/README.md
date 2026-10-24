# Decisions

Why the fork is the way it is. Commits say *what* changed and `docs/codebase/` says *how*
things work; these say *why*, so a later change doesn't undo a choice that was made on
purpose. Each one is short: the problem, what was chosen, what it costs.

| # | Decision | Date |
|---|---|---|
| 0001 | [Fork migrations are a stream of their own](0001-fork-migration-stream.md) | 2026-10-24 |
| 0002 | [Fork server code lives in its own files, hooked in by call sites](0002-fork-code-at-call-sites.md) | 2026-10-24 |
| 0003 | [Prefer custom fields and UI config to schema](0003-custom-fields-over-schema.md) | 2026-08-28 |
| 0004 | [Views are tracked apart from plays](0004-views-apart-from-plays.md) | 2026-09-21 |
| 0005 | [Production is a native Windows binary](0005-production-on-windows.md) | 2026-10-23 |
| 0006 | [A UI-only ship still restarts production](0006-ui-ship-restarts.md) | 2026-10-24 |
| 0007 | [The fork keeps its own changelog](0007-fork-changelog.md) | 2026-10-24 |

## Adding one

Write one when you choose between real alternatives and the losing one would look
reasonable to someone who wasn't there — especially if it's what the code would naturally
drift back to. Number it next, link it in the table, and keep it under a page:

```markdown
# NNNN — <the decision, as a statement>

Date: YYYY-MM-DD · Status: accepted | superseded by NNNN

## Context
What forced a choice. Facts, measurements, the incident.

## Decision
What was chosen, in a sentence or two.

## Consequences
What it costs, what it rules out, what to watch for. Where it's enforced.
```

Don't edit an old decision to say something new. Mark it superseded and write the new one.
