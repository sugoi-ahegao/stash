---
name: merge-to-main
description: Merge a feature branch into main-sugoi-ahegao the fork's way - write its fork changelog entry in docs/fork-changelog/, then squash-merge, then regenerate FORK_CHANGELOG.md. Use when the user asks to merge, land or squash a branch into main, and as the first half of shipping a branch to production.
---

# Merge a branch into main

Branches land on `main-sugoi-ahegao` as **one squash commit that carries the branch's
changelog entry** (see [`docs/fork-changelog/`](../../../docs/fork-changelog/README.md)).
Never merge without the entry. It's the only record of what the branch tried and dropped.

## 1. On the branch (its worktree)

1. `git status`. Uncommitted files: ask the user which belong to this branch. Commit
   those (conventional subjects, a body saying why). Leave out anything that isn't part
   of the feature, such as another session's work.
2. `scripts/check`. Don't merge a red check.
3. `scripts/fork-entry` scaffolds `docs/fork-changelog/<date>-<branch>.md`. If one
   exists, `scripts/fork-entry --path` finds it; finish that one.
4. Fill in every TODO. Sources, best first:
   - the commit bodies already in the scaffold, and `git log -p main-sugoi-ahegao..HEAD`
   - the worktree's `.local/BACKLOG.md` (tickets and their Results)
   - docs the branch added or changed in `docs/codebase/` and `docs/decisions/`
   - the user. Ask about anything in "Tried and changed" you can't see in git
     (tweaks made and undone without a commit). Don't invent history.
5. **Update every relevant doc, on the branch, before merging.** Main must never get code
   whose docs describe the old behaviour. Go through:
   - `docs/codebase/`: its README says which doc covers what. Update each one the branch
     makes untrue, and add to the one for a new feature (or a new numbered doc for a big one).
   - `docs/decisions/`: a new record for each major choice the branch made (a real
     alternative that someone might later drift back to). Small choices stay in the entry's
     "Tried and changed".
   - `CLAUDE.md`, `.claude/skills/`, any README next to the code.

   Fill in the entry's "Docs updated" with one line per doc, and link new decisions from
   the entry. `scripts/doc-refs` must pass.
6. `scripts/fork-entry --check` passes. Show the user the entry and let them correct it.
7. Commit the docs and the entry: `docs: <what>` for doc updates, then
   `docs(changelog): entry for <branch>`.

## 2. On main (the main checkout, `stash.worktrees/stash`)

```bash
git merge --squash <branch>
git commit                       # one conventional subject for the whole branch:
                                 # feat(ferry): torrent history, sessions and the Torrents page
scripts/changelog
git commit -m "chore(changelog): update FORK_CHANGELOG.md" FORK_CHANGELOG.md
```

Decision numbers: branches number theirs independently, so a branch's `0008` may clash
with main's. The pre-commit hook (`scripts/git-hooks/pre-commit`) renumbers the newcomer
to the next free number, with its links and README row, and says so. Mention it to the
user. If the README table conflicts, keep both rows and let the hook number them.

The squash commit's body lists the branch's commit subjects. Check that the new line in
`FORK_CHANGELOG.md` links the entry.

If the squash conflicts, resolve it the fork's way (rule 2: fork code in its own files)
and say what you resolved.

## 3. After

- Don't delete the branch or worktree unless the user asks.
- Ship only if the user asked: the `ship-to-prod` skill.
