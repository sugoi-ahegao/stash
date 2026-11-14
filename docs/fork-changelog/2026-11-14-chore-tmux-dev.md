# tmux-dev: one tmux session per checkout with server, UI and Claude

**Merged:** 2026-11-14 · `chore/tmux-dev` into `main-sugoi-ahegao` · 1 commits

## What changed

- `wt switch -c <branch>` now leaves a running tmux session behind: the worktree's backend,
  its Vite UI, and an assistant and a worker Claude session side by side.
- `scripts/tmux-dev up` attaches to that session (or creates it, in any checkout, the main
  one included) and opens VS Code with a terminal that attaches to it.
- `scripts/tmux-dev down` stops the server and UI, the Claude sessions, and anything else
  left on the checkout's ports; `scripts/tmux-dev ls` lists the sessions and their ports.

## How it works

`scripts/tmux-dev` is self-contained bash. `up` names the session after the checkout's
folder, tags it with the worktree path, and makes three windows, each a shell with its
command typed in (so Ctrl-C and rerun works): `server` (`scripts/dev server`), `ui`
(`scripts/dev ui`) and `claude`, split into `claude --agent worker --name worker-<folder>`
on the left and `claude --agent assistant --name assistant-<folder>` on the right. Ports
come from the checkout's own config, the same ones `scripts/worktree` assigns. With `code`
on the PATH it merges a `tmux-dev: attach` run-on-folder-open task into the gitignored
`.vscode/tasks.json` and runs `code <worktree>`.

`.config/wt.toml` gains a `[post-start]` hook that runs `up --detach`, after pre-start's
`scripts/worktree init`. See [doc 11](../codebase/11-production-and-dev.md).

## Tried and changed

Nothing recorded: the branch is one commit, and no intermediate approaches were committed.

## Watch out

- The `assistant` and `worker` agents are user-level (`~/.claude/agents/`), not in the repo.
  On a machine without them the claude panes start without those agents.
- VS Code asks once before running automatic tasks (`task.allowAutomaticTasks`).
- The post-start hook's output goes to worktrunk's hook log (`wt config state logs`).
- Worktrees made by `scripts/upstream-sync` don't go through `wt switch`, so they get no
  session until `scripts/tmux-dev up`.

## Follow-ups

None.

## Docs updated

- `CLAUDE.md`: `scripts/tmux-dev up` / `down` in Commands.
- `docs/codebase/11-production-and-dev.md`: the worktree workflow, the post-start hook in
  "what runs when", what `up` and `down` do, and the quick-reference rows.
- `docs/codebase/12-upstream-sync.md`: none needed; its worktree isn't made by `wt switch`
  and `make server-start` still runs it.
- `docs/decisions/`: none; a convenience script, no choice someone would drift back from.

## Commits

- feat(scripts): tmux-dev, a tmux session per checkout with server, UI and Claude `d9b64731d`
  > scripts/tmux-dev up starts (or reuses) a tmux session named after the checkout with
  > windows for scripts/dev server, scripts/dev ui, and a claude window holding the worker
  > and assistant Claude sessions side by side, then attaches. It refuses production's or the
  > main checkout's ports in a worktree, and opens VS Code with an auto-run task that attaches
  > its terminal. down stops the server and UI, kills the session and anything left on the
  > checkout's ports; ls lists the sessions.
  > 
  > worktrunk's post-start hook runs `up --detach`, so wt switch -c leaves a ready session
  > behind. scripts/worktree, CLAUDE.md and doc 11 point at it.

## Footprint

```
5 files changed, 289 insertions(+), 7 deletions(-)
20.0% .config/
20.0% docs/codebase/
40.0% scripts/
```
