import {
  CriterionModifier,
  SortDirectionEnum,
} from "src/core/generated-graphql";
import { ISortByOption } from "src/models/list-filter/filter-options";
import { FolderCriterion } from "src/models/list-filter/criteria/folder";
import { ListFilterModel } from "src/models/list-filter/filter";

// A "collection" is a top-level folder inside the intake area of a library root:
//
//     /mnt/e/.../Stash Production / New / 2025-05-06
//     └──────── library root ────┘ └─┬─┘ └─── the collection ───┘
//                                    COLLECTIONS_FOLDER
//
// Its name is usually a date the material was discovered ("2025-05-06"), but just as often
// a release or pack name ("[EvilAngel] Gag Reflex 2"). Nothing is assumed about the name -
// a collection is simply "a folder the user dropped a batch into".
//
// A collection is identified by NAME, not by folder, so the same name under two different
// library roots is ONE collection holding the scenes from both. Nothing is stored; the
// collections are derived from folder paths on every visit.
//
// See docs/codebase/10-collections.md.

// The intake folder inside each library root. Only its children become collections -
// sibling areas hold material that has already been dealt with.
export const COLLECTIONS_FOLDER = "New";

// How many scene cards a collection row asks for, and the skeleton count while loading.
export const CARDS_PER_ROW = 20;

// How many collection rows are shown per page.
export const COLLECTIONS_PER_PAGE = 10;

export interface ICollectionFolder {
  id: string;
  path: string;
  basename: string;
}

export interface ICollection {
  // the folder name, which is what the row is headed with
  name: string;
  // every folder contributing to it - one per library root the name appears under
  folders: ICollectionFolder[];
}

// A folder whose NAME is itself an absolute Windows path - "E:\\sys.tmp\\...\\2025-01-24"
// sitting inside New/ - is debris from a copy that went wrong on the Windows side, not a
// batch anyone filed. Such folders hold no scenes, so their rows would render blank while
// still taking up a slot on the page.
const WINDOWS_PATH_NAME = /^[A-Za-z]:[\\/]/;

// Splits `path` into the segments below `root`, or returns null if it isn't below it.
// Paths are stored with the separator of whichever host scanned them, so try both: a
// library scanned from Windows and again from WSL leaves rows in both shapes, and only
// the ones matching a configured root should count.
function segmentsBelow(path: string, root: string): string[] | null {
  for (const sep of ["/", "\\"]) {
    const prefix = root + sep;
    if (path.startsWith(prefix)) {
      return path.slice(prefix.length).split(sep);
    }
  }
  return null;
}

// Picks the collection folders out of every folder in the library and merges them by name.
// `roots` are the configured library paths (configuration.general.stashes).
// Which collection a path belongs to, and how far below the root it sits. `depth` of 2 is
// the collection folder itself (<root>/New/<name>); anything deeper is inside it.
function collectionOf(path: string, roots: readonly string[]) {
  for (const root of roots) {
    const segments = segmentsBelow(path, root);
    if (segments === null) continue;

    if (segments.length < 2 || segments[0] !== COLLECTIONS_FOLDER) return null;

    const name = segments[1];
    if (WINDOWS_PATH_NAME.test(name)) return null;

    return { name, depth: segments.length };
  }

  return null;
}

export function toCollections(
  folders: readonly ICollectionFolder[],
  roots: readonly string[]
): ICollection[] {
  const byName = new Map<string, ICollectionFolder[]>();

  for (const folder of folders) {
    const found = collectionOf(folder.path, roots);
    // the collection folder itself, not something inside it
    if (found === null || found.depth !== 2) continue;

    const existing = byName.get(found.name);
    if (existing) {
      existing.push(folder);
    } else {
      byName.set(found.name, [folder]);
    }
  }

  return Array.from(byName.entries()).map(([name, collectionFolders]) => ({
    name,
    folders: collectionFolders,
  }));
}

// Maps every folder id in the library to the collection it sits in, so a scene can be
// attributed to a collection from its file's parent folder alone - which is far cheaper to
// fetch than the file's full path.
export function collectionNamesByFolderId(
  folders: readonly ICollectionFolder[],
  roots: readonly string[]
) {
  const byFolderId = new Map<string, string>();

  for (const folder of folders) {
    const found = collectionOf(folder.path, roots);
    if (found !== null) {
      byFolderId.set(folder.id, found.name);
    }
  }

  return byFolderId;
}

// Narrows an existing scene filter to one collection, so a collection row respects whatever
// the user has already filtered the list down to. This reuses the existing folder criterion,
// which maps onto files_filter.parent_folder, so the row's "view all" URL is a filter the
// scenes page already understands.
export function collectionFilter(
  collection: ICollection,
  baseFilter: ListFilterModel
) {
  const filter = baseFilter.clone();
  filter.itemsPerPage = CARDS_PER_ROW;
  filter.currentPage = 1;

  const criterion = new FolderCriterion();
  criterion.modifier = CriterionModifier.Includes;
  criterion.value = {
    // the label is what the filter chip shows on /scenes, so use the path
    items: collection.folders.map((f) => ({ id: f.id, label: f.path })),
    excluded: [],
    // ⚠️ the criterion defaults this to 0, which matches only files sitting directly in
    // the collection folder. -1 means every descendant, which is what a collection means.
    depth: -1,
  };

  // a collection IS a folder constraint, so it replaces any the user already had rather
  // than fighting it
  filter.criteria = [
    ...filter.criteria.filter((c) => c.criterionOption.type !== "folder"),
    criterion,
  ];

  return filter;
}

// --- Sorting collections ------------------------------------------------------------
//
// Collections are ranked by an aggregate over their scenes, and each direction leads with
// the true extreme: descending ranks by a collection's MOST recent scene, ascending by its
// LEAST recent one. Ascending is therefore not the exact mirror of descending. This follows
// the precedent set by the scene sort for `performer_age` (pkg/sqlite/scene.go), which
// likewise swaps MIN for MAX depending on direction.
//
// A scene that has never been played counts as year 0 rather than as missing data, so
// never-played collections lead an ascending sort and trail a descending one. That matches
// the backend, which filters last_played_at as IFNULL(last_played_at, datetime(0))
// (pkg/sqlite/scene_filter.go) and whose sort leaves it NULL, which SQLite orders the
// same way.
const NEVER = Number.NEGATIVE_INFINITY;

export type CollectionSortBy = "name" | "updated_at" | "last_played_at";

export const collectionSortByOptions: ISortByOption[] = [
  { messageID: "name", value: "name" },
  { messageID: "updated_at", value: "updated_at" },
  { messageID: "last_played_at", value: "last_played_at" },
];

export const DEFAULT_COLLECTION_SORT_BY: CollectionSortBy = "name";
export const DEFAULT_COLLECTION_SORT_DIRECTION = SortDirectionEnum.Desc;

export interface ICollectionSceneStat {
  updated_at: string;
  last_played_at?: string | null;
  files: { parent_folder: { id: string } }[];
}

interface ICollectionExtremes {
  minUpdated: number;
  maxUpdated: number;
  minPlayed: number;
  maxPlayed: number;
}

function emptyExtremes(): ICollectionExtremes {
  // a collection with no scenes sinks in both directions
  return {
    minUpdated: Number.POSITIVE_INFINITY,
    maxUpdated: Number.NEGATIVE_INFINITY,
    minPlayed: Number.POSITIVE_INFINITY,
    maxPlayed: Number.NEGATIVE_INFINITY,
  };
}

// Folds each scene into the extremes of every collection it has a file in.
export function collectionExtremes(
  scenes: readonly ICollectionSceneStat[],
  collectionNameByFolderId: Map<string, string>
) {
  const byName = new Map<string, ICollectionExtremes>();

  for (const scene of scenes) {
    const updated = Date.parse(scene.updated_at);
    const played = scene.last_played_at
      ? Date.parse(scene.last_played_at)
      : NEVER;

    // a scene's files normally share one folder, but dedupe so a multi-file scene isn't
    // folded into the same collection twice
    const names = new Set<string>();
    for (const file of scene.files) {
      const name = collectionNameByFolderId.get(file.parent_folder.id);
      if (name !== undefined) names.add(name);
    }

    for (const name of names) {
      let extremes = byName.get(name);
      if (!extremes) {
        extremes = emptyExtremes();
        byName.set(name, extremes);
      }

      if (!Number.isNaN(updated)) {
        extremes.minUpdated = Math.min(extremes.minUpdated, updated);
        extremes.maxUpdated = Math.max(extremes.maxUpdated, updated);
      }
      extremes.minPlayed = Math.min(extremes.minPlayed, played);
      extremes.maxPlayed = Math.max(extremes.maxPlayed, played);
    }
  }

  return byName;
}

export function sortCollections(
  collections: readonly ICollection[],
  extremes: Map<string, ICollectionExtremes>,
  sortBy: CollectionSortBy,
  direction: SortDirectionEnum
): ICollection[] {
  const ascending = direction === SortDirectionEnum.Asc;
  const byName = (a: ICollection, b: ICollection) =>
    a.name.localeCompare(b.name);

  if (sortBy === "name") {
    return collections
      .slice()
      .sort((a, b) => (ascending ? byName(a, b) : byName(b, a)));
  }

  const extremeOf = (collection: ICollection) => {
    const e = extremes.get(collection.name) ?? emptyExtremes();
    if (sortBy === "updated_at") {
      return ascending ? e.minUpdated : e.maxUpdated;
    }
    return ascending ? e.minPlayed : e.maxPlayed;
  };

  return collections.slice().sort((a, b) => {
    const av = extremeOf(a);
    const bv = extremeOf(b);
    if (av !== bv) return ascending ? av - bv : bv - av;
    // collections sharing an extreme - every never-played one, for instance - stay in a
    // stable, readable order rather than an arbitrary one
    return byName(a, b);
  });
}
