# Jobs and tasks

Long-running work — scanning, generating, cleaning, auto-tagging, identifying, importing,
exporting — runs as a *job*: queued, cancellable, and reporting progress to the UI over a
GraphQL subscription.

Key files: [`pkg/job/`](../../pkg/job/), `internal/manager/task_*.go`,
[`internal/manager/manager_tasks.go`](../../internal/manager/manager_tasks.go).

## Two layers

Don't confuse them; the naming is unhelpful.

- **Job** — a user-visible unit of work in the queue ("Scanning…"). One at a time.
- **Task** — a unit of work *inside* a job, run in parallel via `TaskQueue` (generating
  one thumbnail). Not individually visible; contributes to the parent job's progress.

## The job manager

```go
type Manager struct {
    queue     []*Job
    graveyard []*Job     // last 10 finished jobs, for the UI
    mutex     sync.Mutex
    notEmpty  *sync.Cond
    lastID    int
    subscriptions []*ManagerSubscription
    updateThrottleLimit time.Duration   // 100ms
}
```

A single dispatcher goroutine started by `NewManager()` waits on `notEmpty` and runs
queued jobs **one at a time**. Two entry points:

- **`Add`** — queue it; runs when the jobs ahead finish. Normal path.
- **`Start`** — run immediately, concurrently with whatever else is running. Used for work
  that shouldn't wait behind a long scan.

Finished jobs move to `graveyard`, capped at 10, so the UI can show recent history.

Progress updates are throttled to one per 100ms. Without it, a scan processing thousands of
files would flood every subscribed websocket.

## Writing a job

Implement `JobExec`:

```go
type JobExec interface {
    Execute(ctx context.Context, progress *Progress) error
}
```

or wrap a function with `job.MakeJobExec(fn)`.

### Cancellation is cooperative

The manager cancels the job's context; nothing is killed. **Your job must check.**

```go
if job.IsCancelled(ctx) {
    logger.Info("Stopping due to user request")
    return nil
}
```

Check at every loop iteration and before any expensive step. A job that doesn't check
becomes uncancellable and blocks every queued job behind it — the most common bug in this
area.

Note that `ScanJob.Execute` returns `nil`, not an error, when cancelled. Cancellation is
a normal outcome, not a failure; returning an error surfaces a red error in the UI.

### Status model

```
READY ──► RUNNING ──┬──► FINISHED
                    ├──► CANCELLED   (cancel requested, then stopped)
                    └──► FAILED      (Execute returned an error)
          STOPPING            (cancel requested, still winding down)
```

## Progress

```go
progress.SetTotal(n)          // switches to definite mode
progress.Increment()          // one unit done
progress.SetPercent(0.5)      // direct
progress.Indefinite()         // unknown total — spinner
progress.ExecuteTask(desc, fn) // run fn, showing desc as a current operation
```

`ExecuteTask` adds the description to the job's `Details` list while `fn` runs and removes
it after — that's the "currently processing X" text in the UI. Multiple concurrent tasks
each contribute a line.

Progress can be recalculated as work is discovered: `AddTotal` during a scan raises the
denominator as more files are found, which is why the bar can move backwards.

## TaskQueue

Parallelism *within* a job:

```go
taskQueue := job.NewTaskQueue(ctx, progress, 200000, nTasks)
taskQueue.Add("generating thumbnail", func(ctx context.Context) { ... })
// ...
taskQueue.Close()   // closes the channel and blocks until all tasks finish
```

Internals worth knowing:

```go
func (tq *TaskQueue) executer(ctx context.Context) {
    defer close(tq.done)
    defer tq.wg.Wait()
    for task := range tq.tasks {
        if IsCancelled(ctx) {
            continue        // ← drain, don't break
        }
        ...
    }
}
```

On cancellation it **keeps draining the channel without executing**. Breaking out would
deadlock any producer still blocked writing to a full channel. The 200,000-slot buffer
means a scan can enqueue essentially unbounded generation work without the walker
blocking.

Concurrency is bounded by `sizedwaitgroup` at `GetParallelTasksWithAutoDetection()`.

`Close()` must be called or the job hangs — `defer` it.

## Subscriptions

`Manager.Subscribe(ctx)` returns a `ManagerSubscription` with `NewJob`, `RemovedJob`,
`UpdatedJob` channels. The GraphQL `jobsSubscribe` subscription fans these to the UI.

Desktop notifications use the same mechanism — `initJobManager` in
[`internal/manager/init.go`](../../internal/manager/init.go) subscribes at startup and
pops a native notification on `RemovedJob`.

Subscribers must drain their channels. A blocked subscriber blocks the dispatcher.

## The task implementations

| File | Job |
|---|---|
| `task_scan.go` | Filesystem scan → files → scenes/images/galleries |
| `task_generate*.go` | Thumbnails, sprites, previews, phashes, markers, heatmaps |
| `task_clean.go` | Remove entries for files that no longer exist |
| `task_autotag.go` | Match performer/studio/tag names against paths |
| `task_identify.go` | Scrape and apply metadata from configured sources |
| `task_export.go` / `task_import.go` | JSON round-trip of the whole library |
| `task_stash_box_tag.go` | Bulk tagging from a stash-box instance |

`manager_tasks.go` holds the entry points the mutation resolvers call.

## Interaction with the single write connection

There is exactly one write connection for the whole process (see
[data layer](data-layer.md#read-vs-write-connections)). Combined with parallel tasks, the
rule is:

**Do the expensive part outside a transaction; open a short transaction only to write.**

```go
// good
fingerprints := calculateFingerprints(path)     // slow, no transaction
err := repo.WithTxn(ctx, func(ctx context.Context) error {
    return repo.File.Create(ctx, file)          // fast
})

// bad — blocks every other writer for the duration of the hash
err := repo.WithTxn(ctx, func(ctx context.Context) error {
    fingerprints := calculateFingerprints(path)
    return repo.File.Create(ctx, file)
})
```

Raising `parallel_tasks` doesn't help throughput if the tasks are transaction-bound; it
just increases contention. This is why the scanner is structured the way it is.

## Checklist for a new job

- [ ] `Execute(ctx, progress) error`
- [ ] `job.IsCancelled(ctx)` checked in every loop
- [ ] `progress.SetTotal` / `Increment`, or `Indefinite()`
- [ ] `TaskQueue` for parallel work, with `defer Close()`
- [ ] No slow work inside a write transaction
- [ ] Returns `nil` on cancellation, error only on real failure
- [ ] Entry point in `manager_tasks.go` and a mutation resolver
