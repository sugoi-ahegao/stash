# Upstream stash v0.32.0, React 18, and a new-version notice that knows it's a fork

**Merged:** 2026-11-08 · `chore/sync-with-upstream` into `main-sugoi-ahegao` as `44767c45f` · 3 fork commits + 1 upstream merge · shipped to production

_Written on 2026-11-13, after the merge, from git history; the entries convention didn't
exist yet._

## What changed

- **Everything in upstream stash v0.32.0** (merged at `aefc9373f`, `v0.32.0-8`): production
  dates on scenes, a list view for studios, pinnable sort options, the redesigned saved
  filter list, AirPlay with authentication, and the rest. Upstream's notes:
  `ui/v2.5/src/docs/en/Changelog/v0320.md`, also in the app under Changelog.
- **The UI runs on React 18** (upstream #7276).
- **The new-version notice only appears when upstream ships a release the fork doesn't
  have.** Before, it always claimed a new version, because a fork build's commit never
  matches a release's. A navbar badge now shows when one is out, and Settings → About no
  longer offers a Download button.
- **Generate makes video previews again.** After the merge it silently made none.
- **A scene's title no longer sticks to the browser tab** after leaving the scene page.

## How it works

- **Version check** (`internal/api/fork_version.go`): `git describe` puts the last upstream
  release a build includes at the front of its version (`v0.32.0-8-g…`). The fork compares
  that release number with GitHub's latest full release instead of comparing commit
  hashes. The answer is `LatestVersion.update_available`, which About, the startup log and
  the navbar badge (`ui/v2.5/src/components/UpdateBadge.tsx`) all read. The badge keeps the
  answer for 6 hours per build in `localStorage` (`fork.updateCheck`), because GitHub
  allows 60 anonymous requests an hour; shipping a new build clears it. For this to work,
  `scripts/upstream-sync` now fetches upstream's `v*` tags. Details: the "New-version
  notice" section of `docs/codebase/07-this-fork.md`.
- **Previews**: upstream #6685 added `GeneratePreviewTask.VideoPreview` but never set it in
  the Generate task. The fork sets it in `internal/manager/task_generate.go`, marked
  `// fork`.
- **Titles**: `react-helmet` registers while rendering and unregisters only on unmount.
  React 18 throws away a render that suspends on a lazy child without unmounting it, so
  the scene page's `Helmet` stayed registered forever. `CommittedHelmet`
  (`ui/v2.5/src/components/Shared/CommittedHelmet.tsx`) renders the `Helmet` only after
  the first commit.
- **React 18 adaptations**: `React.FC` no longer includes `children`, so fork components
  that take children declare them (`HoldToGenerate.tsx`, `sceneViews.tsx`, `Scene.tsx`).

## Tried and changed

- **Version check**: upstream compares commit hashes, which can never match on a fork, so
  the fork compares release numbers instead. The Download button was removed rather than
  fixed, because it would replace the fork with stock stash.
- **Titles**: the leak was fixed by delaying the `Helmet` to after commit rather than
  changing how the scene page lazy-loads its panels.
- No other tweaks or reverted approaches show in the branch's history. Anything tried and
  undone without a commit wasn't recorded.

## Watch out

- **Upstream's security tripwire is gone** (#7085). With no credentials configured,
  requests from public IPs now get a 403 instead of shutting stash down. The config
  fields `dangerous_allow_public_without_auth` and
  `security_tripwire_accessed_from_public_internet` were removed; `public_whitelist` and
  `trusted_proxies` are new. Local and private-network (LAN) addresses aren't affected;
  check production's config if it's ever reached from a public address.
- **Marker previews** follow each marker's end time now. The old 20-second cap is the
  optional "Max marker preview duration" setting (#6855).
- **UI plugins** that rely on React internals may break under React 18.
- **No new database migrations**, upstream's or the fork's.
- The version check needs upstream's `v*` tags in the main checkout. A checkout without
  them reports no release number, and so never shows the notice.
- Feature branches cut before this merge (`feat/ui-enhancements`, `feat/assortments`,
  `feat/torrent-extension`) are still on React 17 until they merge main. Their components
  may need the same `children` change.

## Follow-ups

- Merge main into the three open feature branches and check them under React 18.

## Docs updated

- `docs/codebase/07-this-fork.md`: a new "New-version notice" section (in the merge).
- `docs/codebase/08-frontend-components.md`: the scene page's title uses
  `CommittedHelmet`, and why (added 2026-11-13; it was missed in the merge).
- `docs/codebase/06-recipes-and-gotchas.md`: a frontend gotcha for titles that stick to
  later pages (added 2026-11-13).
- `docs/codebase/05-frontend-architecture.md`: already said React 18.
- Upstream's docs (`Changelog/v0320.md`, `Manual/Configuration.md`, `Manual/UIPluginApi.md`)
  came with the merge and aren't the fork's to edit.
- No decision record: following upstream releases and adapting to them isn't a new choice.

## Commits

- Merge upstream/develop (`aefc9373f`) into chore/sync-with-upstream `bb3bc063f`
- fix(api): make the Generate task produce video previews again `658d2dd9d`
  > Upstream #6685 added GeneratePreviewTask.VideoPreview but never set it in the Generate
  > task, so it silently generated no previews.
- fix(ui): adapt fork components to React 18 and stop scene titles leaking `38188ee04`
  > React 18 dropped implicit children from React.FC. It also discards suspended renders,
  > leaving react-helmet registered with the scene's title on later pages.
- feat(ui): only flag a new version when upstream releases past what the fork includes `a0444cc1d`
  > Compare release numbers rather than commit hashes, add a navbar badge, fetch release
  > tags during upstream sync, and remove the Download button that would replace the fork.

## Footprint

```
135 files changed, 5016 insertions(+), 1587 deletions(-)   (the squash, upstream's changes included)
16 files changed, 225 insertions(+), 24 deletions(-)       (the fork's own commits)
```
