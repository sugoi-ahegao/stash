# Files and scanning

How Stash discovers media on disk and turns it into Scenes, Images and Galleries.

Key files: [`pkg/file/scan.go`](../../pkg/file/scan.go),
[`pkg/file/walk.go`](../../pkg/file/walk.go),
[`internal/manager/task_scan.go`](../../internal/manager/task_scan.go),
[`pkg/scene/scan.go`](../../pkg/scene/scan.go).

## The file/folder abstraction

Since schema 32, files are first-class entities separate from the content they belong to.

```
folders  ──┐
           ├─ files ──┬── scenes_files ── scenes
           │          ├── images_files ── images
           │          └── galleries_files ── galleries
           └─ (self-referencing parent_id, forming a tree)
```

Consequences that shape everything else:

- **A scene can have several files.** Different encodings of the same content. One is
  `primary` (the `primary` column on the join table), and it's the one used for
  playback and metadata display.
- **A file can belong to several entities.** Rare but legal.
- **Folders are rows, not strings.** `files.parent_folder_id` points at a folder row;
  the full path is a join. This is why path filtering in
  [the query system](query-filter-system.md) concatenates `folders.path ||
  separator || files.basename` rather than reading a single column.
- **Zip files are folders too.** A zip gets a file row *and* participates in the folder
  hierarchy, so images inside it get normal file rows with `zip_file_id` set.

`models.File` is an interface with `BaseFile`, `VideoFile`, `ImageFile` implementations.
Type-asserting a `models.File` to `*models.VideoFile` is a normal thing to do — see
`convertVideoFile` in
[`resolver_model_scene.go`](../../internal/api/resolver_model_scene.go).

## The scanner

[`pkg/file.Scanner`](../../pkg/file/scan.go) is generic over content type. It knows about
files and folders; it knows nothing about scenes. Content-specific behaviour is injected
through four hook points:

| Field | Role |
|---|---|
| `ScanFilters []PathFilter` | Should this path be visited at all? |
| `FileDecorators []Decorator` | Enrich a file with type-specific metadata (ffprobe, image dimensions) |
| `FileHandlers []Handler` | Create/update the Scene/Image/Gallery for this file |
| `HandlerRequiredFilters []Filter` | Does an *unchanged* file still need handling? |

`HandlerRequiredFilters` is the non-obvious one. A file whose mod time hasn't changed is
normally skipped entirely — but if the file exists and its *scene* doesn't (say the user
deleted the scene, or a previous scan crashed), the handler must still run. That filter is
what catches it.

### Two goroutines

```
walker goroutine                      processor goroutine(s)
────────────────                      ──────────────────────
SymWalk the paths                     read from fileQueue
  ├─ apply ScanFilters                  ├─ ScanFile()
  ├─ folders → handle immediately       │    ├─ new? → onNewFile
  ├─ files in zips → immediately        │    ├─ changed? → onExistingFile
  └─ everything else → fileQueue ─────► │    └─ unchanged? → onUnchangedFile
                                        └─ fire handlers
```

Folders are handled **inline on the walker**, not queued. This is a correctness
requirement: `onNewFile` looks up its parent folder by path and expects it to already
exist. A folder queued behind its own children would break that. There's a fallback —
`GetOrCreateFolderHierarchy` — for the single-file scan case where no recursive walk
happened.

Parallelism comes from `GetParallelTasksWithAutoDetection()`. The `job.TaskQueue`
(200,000 slots) buffers generated work like thumbnails.

`SymWalk` in [`walk.go`](../../pkg/file/walk.go) is a symlink-following variant of
`fs.WalkDir` — the stdlib version doesn't follow symlinks, and users symlink media
directories constantly.

## Scanning one file

`ScanFile` opens with something that looks like a bug and isn't:

```go
// don't use a transaction to check if new or existing
if err := s.Repository.WithDB(ctx, func(ctx context.Context) error {
```

`WithDB`, not `WithTxn`. The existence check runs outside a transaction, because the work
that follows — hashing a multi-gigabyte file, running ffprobe — must not happen while
holding the single write connection. Transactions are opened later, narrowly, around the
actual writes. **Preserve this.** Wrapping `ScanFile` in a transaction would serialise
every scan worker behind one connection and destroy scan throughput.

### Case sensitivity

Every path lookup is tried case-sensitively first, then case-insensitively if the
filesystem says it's insensitive:

```go
ff, err = s.Repository.File.FindByPath(ctx, f.Path, true)
if ff == nil && f.ZipFileID == nil {
    caseSensitive, _ := f.FS.IsPathCaseSensitive(f.Path)
    if !caseSensitive {
        ff, err = s.Repository.File.FindByPath(ctx, f.Path, false)
    }
}
```

Paths inside zips are always treated as case-sensitive — the zip's own encoding governs,
not the host filesystem.

Related: macOS returns filenames in NFD Unicode normalisation while everything else uses
NFC. Recent versions normalise to NFC on scan, and `handleRename` has a case specifically
for finding a file stored under the old normalisation.

### New file path

```
1. resolve parent folder (cache → DB → create hierarchy if scanning a single file)
2. calculate fingerprints (oshash, MD5, phash as configured)
3. fire decorators        ← ffprobe, image dimensions
4. check for rename       ← after decoration, so metadata is available
5. if not a rename: create the file row + fire handlers, in one transaction
```

Fingerprints before decorators, decorators before rename detection. The rename check needs
decorated metadata to make a correct decision.

### Rename detection

This is the most intricate logic in the scanner, and the source of the "my library
duplicated itself" class of bug.

A new file's fingerprints are looked up against existing file rows. For each match, the
scanner asks *is that other file still on disk?* If exactly the files that match are
missing, this is a move, not a new file.

Five conditions count as "missing" ([`handleRename`](../../pkg/file/scan.go)):

1. `Lstat` fails — genuinely gone.
2. Same path under different Unicode normalisation (#4425 — the NFD/NFC case).
3. Case-insensitive path match on a case-insensitive filesystem (#1426).
4. The other file is no longer inside a configured library path (#4393) — the user moved
   media out of the library, so treat it as a move rather than orphaning it.
5. Zip membership mismatch causes the candidate to be *skipped* entirely: a file inside a
   zip only renames to another file in the same zip.

When a rename is confirmed, the **existing row is updated**, not replaced:

```go
// #4775 - using the new file instance means that any changes made to the existing
// file will be lost. Update the existing file instead.
other := missing[0]
updated := other.Clone()
...
fBaseCopy.ID = updatedBase.ID
fBaseCopy.CreatedAt = updatedBase.CreatedAt
fBaseCopy.Fingerprints = updatedBase.Fingerprints
*updatedBase = fBaseCopy
```

ID, creation time and fingerprints are carried over from the old row; everything else
comes from the newly scanned file. This preserves the scene, its tags, performers, o-count
and play history. If you change this, verify that renaming a file keeps all of that
attached.

Renaming a *zip* additionally moves the whole folder hierarchy underneath it via
`zipHierarchyMover.transferZipHierarchy`.

### Existing file path

Mod time is compared against the stored value.

- **Changed** → recalculate fingerprints, re-decorate, update, fire handlers.
- **Unchanged** → `onUnchangedFile`, which still checks:
  - `isHandlerRequired` — does a Scene actually exist for this file?
  - `isMissingMetadata` — did we skip something last time (e.g. phash wasn't enabled)?

`setMissingFingerprints` and `setMissingMetadata` backfill without a full rescan. This is
how enabling phash generation picks up existing files.

`Scanner.Rescan` forces the changed path regardless of mod time.

## Fingerprints

| Kind | Purpose |
|---|---|
| `oshash` | Fast — size + samples from head/tail. Primary identity. Cheap on huge files. |
| `md5` | Full-content hash. Optional; expensive. |
| `phash` | Perceptual hash of video/image content. Used for duplicate detection. |

`oshash` is the workhorse for rename detection because it's O(1) in file size. MD5 is
opt-in precisely because it isn't.

Fingerprints live in `files_fingerprints`, keyed by `(file_id, type)`. The filter system
joins this table under distinct aliases per type — `fingerprints_oshash`,
`fingerprints_md5` — which is why the join deduplicator identifies joins by alias rather
than table name.

## From file to content

Handlers in [`task_scan.go`](../../internal/manager/task_scan.go) map file types to
entities:

```go
func videoFileFilter(ctx, f models.File) bool   // → scene.ScanHandler
func imageFileFilter(ctx, f models.File) bool   // → image.ScanHandler
func galleryFileFilter(ctx, f models.File) bool // → gallery.ScanHandler (zips)
```

Each `pkg/<entity>/scan.go` handler decides whether to attach the file to an existing
entity or create a new one, and queues generated media (thumbnails, sprites, previews,
heatmaps) onto the task queue rather than doing it inline.

`CreateGalleriesFromFolders` makes a folder of images into a gallery — the reason
`Gallery` can be backed by either a zip *file* or a *folder*.

## Cleaning

[`task_clean.go`](../../internal/manager/task_clean.go) walks the database rather than the
filesystem, checking each file still exists and is still within a configured path. Missing
files are removed, along with entities left with no files.

Dry-run mode exists and should be the default suggestion to users — this is the most
destructive operation in the app.

## `.stashignore`

[`pkg/file/stashignore.go`](../../pkg/file/stashignore.go) — a `.stashignore` file makes
the scanner skip its directory subtree. Evaluated during walking, so ignored trees cost
nothing.

## Gotchas

- **Don't hold a write transaction across I/O.** The whole scanner is shaped around this.
- **Folders before their contents.** Always.
- **Test rename detection with real moves**, including: rename in place, move between
  directories, move out of the library, rename a zip, and case-only rename on macOS.
- **Fingerprint changes are migrations.** Changing how a fingerprint is computed
  invalidates every stored value and breaks rename detection for existing libraries.
