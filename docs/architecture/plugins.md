# The plugin system

Plugins extend Stash in two independent ways: **backend plugins** run code in response to
tasks or hooks, and **UI plugins** inject JavaScript and CSS into the React app. One plugin
can do both.

Key files: [`pkg/plugin/`](../../pkg/plugin/),
[`pkg/plugin/hook/hooks.go`](../../pkg/plugin/hook/hooks.go),
[`ui/v2.5/src/pluginApi.tsx`](../../ui/v2.5/src/pluginApi.tsx),
[`ui/v2.5/src/patch.tsx`](../../ui/v2.5/src/patch.tsx).

## Definition

A plugin is a YAML file in the configured plugins directory, unmarshalled into
`plugin.Config` ([`config.go`](../../pkg/plugin/config.go)):

```yaml
name: My Plugin
description: Does a thing
version: 1.0.0
interface: rpc          # raw | rpc | js — defaults to raw
exec:
  - python
  - "{pluginDir}/my_plugin.py"
tasks:
  - name: Do The Thing
    description: ...
    defaultArgs:
      mode: full
hooks:
  - name: onSceneUpdate
    triggeredBy:
      - Scene.Update.Post
ui:
  javascript: [my_plugin.js]
  css: [my_plugin.css]
  requires: [some-other-plugin]
  csp:
    connect-src: ["https://api.example.com"]
settings:
  apiKey:
    displayName: API Key
    type: STRING
```

`Cache` ([`plugins.go`](../../pkg/plugin/plugins.go)) loads these at startup and on
`RefreshPluginCache()`. Plugins are identified by the config filename stem.

## The four execution backends

`interface:` selects how Stash talks to the plugin process.

| Interface | Mechanism | Use for |
|---|---|---|
| `raw` (default) | `common.PluginInput` as JSON on stdin, output on stdout | Simple scripts |
| `rpc` | net/rpc + JSON codec over stdin/stdout via `natefinch/pie` | Long-running, progress-reporting plugins |
| `js` | Executed in-process by `goja` — no subprocess | Small logic, no external runtime |

`raw.go`, `rpc.go` and `js.go` each implement a `taskBuilder`; the enum picks one in
`interfaceEnum.getTaskBuilder()`.

Python plugins get special handling — [`pkg/python`](../../pkg/python/) resolves the
interpreter, honouring the configured Python path.

Exec resolution: PATH first, then the plugins directory. The `.exe` extension is implicit
on Windows. **The working directory is Stash's**, not the plugin's — always use
`{pluginDir}` for paths to your own files.

The `js` backend runs *in the Stash process*. A `js` plugin that loops forever blocks a
goroutine; there's no sandbox and no timeout.

## Hooks

Hooks fire after a mutation commits. The full set is in
[`hook/hooks.go`](../../pkg/plugin/hook/hooks.go):

```
Scene.Create.Post   Scene.Update.Post   Scene.Destroy.Post
Image.*   Gallery.*   GalleryChapter.*   SceneMarker.*
Performer.*   Studio.*   Tag.*  (plus Tag.Merge.Post)
Group.*  and the deprecated Movie.* aliases (both fire)
```

Only `.Post` hooks exist. There is no pre-hook and no way to veto a mutation. The comment
at the top of the file notes scan-related hooks are disabled pending post-hook execution
integration.

### Timing

Hooks are registered *during* a transaction and executed *after commit*, with the outer
context:

```go
func (c Cache) RegisterPostHooks(ctx, id, hookType, input, inputFields) {
    txn.AddPostCommitHook(ctx, func(ctx context.Context) error {
        c.executePostHooks(ctx, hookType, hookContext)
        return nil
    })
}
```

So a hook sees committed data and can safely open its own transaction. Note also
`ExecutePostHooks` (immediate) vs `RegisterPostHooks` (deferred to commit) — mutation
resolvers use the latter.

`inputFields` tells the hook *which* fields the mutation actually set, derived from the
same changeset translation described in [the API layer](graphql-api.md#partial-updates-the-changeset-translator).
A hook reacting to "the rating changed" needs this; the input struct alone can't tell it.

### Recursion guard

A plugin hook that mutates data triggers more hooks. `visitedPluginHookCounts`, tracked
per HTTP request via `VisitedPluginHandler`, bounds this. Without it a plugin that updates
a scene on `Scene.Update.Post` would loop forever.

### Plugins call back into GraphQL

`Cache.RegisterGQLHandler` gives the plugin cache a handler for the GraphQL endpoint, and
`makeServerConnection` passes connection details plus a session cookie to the plugin. So a
plugin mutates data through the same public API the UI uses, not through the store layer.

## Tasks

Plugin tasks appear in Settings → Tasks and run through the normal
[job system](jobs-and-tasks.md). `RunPluginTask` creates a `Task`, adds it to the job
manager, and pipes the plugin's progress channel into `job.Progress`.

`RunPlugin` is the synchronous variant used by the `runPluginOperation` mutation.

## UI plugins

Declared under `ui:` in the YAML. Stash serves the files and the React app loads them at
startup.

### Loading

[`ui/v2.5/src/plugins.tsx`](../../ui/v2.5/src/plugins.tsx):

1. Query the plugin list.
2. **Topologically sort** by the `requires` field — `sortPlugins` does a DFS and throws
   on a dependency cycle.
3. Inject `<script>`/`<link>` tags in that order.
4. Render the app once loading settles (success or failure — a broken plugin doesn't block
   the UI).

`disableCustomizations` skips the whole step; it's the escape hatch when a plugin breaks
the app badly enough to prevent fixing it through the UI.

### The patch system

This is the part most likely to bite you when editing frontend code.

[`patch.tsx`](../../ui/v2.5/src/patch.tsx) maintains a global registry and exposes three
hook points per named component:

```ts
before(name, fn)    // transform arguments; must return the new argument array
instead(name, fn)   // replace, receiving a next() to continue the chain
after(name, fn)     // transform the result
```

`PatchComponent` wraps a component in a `Proxy` that runs those chains, and registers it:

```tsx
const ScenePage: React.FC<IProps> = PatchComponent("ScenePage", (props) => {
  ...
});
```

Around 90 files do this. **The string is a public API.** Renaming `"ScenePage"`, or
removing the wrapper while refactoring, silently breaks every plugin that patches it —
no compile error, no runtime error, the patch just never runs.

Rules when touching a patched component:

- Keep the wrapper and the exact name.
- Registering the same name twice throws in production builds (allowed in dev for hot
  reload).
- `PatchContainerComponent` creates a pure pass-through slot that exists *only* as an
  injection point — plugins add children. Deleting one because "it renders nothing" is a
  breaking change.
- Changing a patched component's props is a soft breaking change for `before`/`instead`
  patches.

`pluginApi.tsx` exposes the libraries plugins are allowed to use — React, Apollo,
react-bootstrap, react-intl, FontAwesome, GraphQL bindings, selected hooks. Anything
re-exported there is API surface. Because of code splitting it also force-loads components
that a plugin page might patch before they'd otherwise be imported.

### CSP

Every enabled plugin's `ui.csp` entries and external script/CSS URLs are merged into the
page's Content-Security-Policy header by `setPageSecurityHeaders` in
[`internal/api/server.go`](../../internal/api/server.go). A plugin fetching a remote API
must declare `connect-src`, or the browser blocks it and it looks like a plugin bug.

### Assets

`ui.assets` maps URL prefixes to directories, served under
`/plugin/{pluginId}/assets/...`.

## Settings

Declared under `settings:`, typed (`STRING`, `NUMBER`, `BOOLEAN`), rendered automatically
in the UI, and readable by the plugin through the plugin API. Values are stored in Stash's
config, not the plugin's directory — so they survive plugin reinstalls.

## Package manager

[`pkg/pkg`](../../pkg/pkg/) implements install/update from remote repositories, backed by
a manifest. `Manager.RefreshPluginSourceManager()` builds it with a 10-second HTTP timeout
and proxy support. Scrapers use the same machinery.

## Debugging

- Plugin stderr is logged; `errLog:` sets the level for output without log-level control
  characters.
- Log level Debug shows hook firing and plugin process lifecycle.
- For UI plugins, check the browser console for CSP violations first — that's the most
  common cause of "my plugin does nothing".
