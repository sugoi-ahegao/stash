# Fork changelog entries

One file per branch merged into `main-sugoi-ahegao`, named `YYYY-MM-DD-<branch>.md`
(`2026-11-13-feat-ui-enhancements.md`). Each says what the branch changed, how it works,
what was tried and dropped along the way, and what to watch for.

[`FORK_CHANGELOG.md`](../../FORK_CHANGELOG.md) is the index: one line per commit, generated
from commit subjects, with a link to the entry a commit adds. These files are the detail
that a subject line can't hold, above all the do/undo/tweak history that otherwise only
lives in a working tree and is gone once the branch is squashed.

Upstream stash's release notes (`ui/v2.5/src/docs/en/Changelog/`) are a separate thing
and are never edited by the fork.

Three places, three jobs:

| | Holds | Written |
|---|---|---|
| `FORK_CHANGELOG.md` | the quick summary: one line per change | generated from commit subjects |
| `docs/fork-changelog/` | the detail of one branch: changes, how they work, what was tried | by hand, before merging |
| `docs/decisions/` | major decisions only, ones a later change might undo | when one is made |

Why entries exist: branches are squash-merged, so fifteen commits land as one line, and
the tweaks made and undone along the way were never written down anywhere.

## Writing one

On the branch, before it's merged (the `merge-to-main` skill does all of this):

```bash
scripts/fork-entry           # scaffold: commits, footprint, migrations, decisions, TODOs
$EDITOR "$(scripts/fork-entry --path)"
scripts/fork-entry --check   # fails while any TODO is left
git add docs/fork-changelog/ && git commit -m "docs(changelog): entry for <branch>"
```

The squash commit then carries the entry, and `scripts/changelog` links it.

- **What changed** is for someone using stash: behaviour, not file names.
- **Tried and changed** is the part nothing else records. Name each approach that was
  dropped and why, and each value that was tuned. A choice someone might reasonably undo
  also gets a decision record.
- Link `docs/codebase/` instead of repeating it.
- **Before merging, update every doc the branch makes untrue**: `docs/codebase/`,
  `CLAUDE.md`, `.claude/skills/`, READMEs next to the code. Add a decision for each major
  choice. "Docs updated" in the entry lists what changed, and stays a TODO until that's done.

Entries are history: once merged, don't rewrite one to describe later work. Later work
gets its own entry.
