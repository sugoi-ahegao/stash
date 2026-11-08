import { useMemo } from "react";
import { useFindSavedFilters } from "src/core/StashService";
import { SavedFilterDataFragment } from "src/core/generated-graphql";
import { ListFilterModel } from "src/models/list-filter/filter";

// fork: which saved filter the list is showing, for the toolbar's saved filter
// button to name. A saved filter is active when loading it would give the same
// search, sort and criteria as now; the page, page size, display mode and zoom
// don't count, so paging or resizing cards keeps the name.

function stable(o: Record<string, unknown>) {
  return Object.keys(o)
    .sort()
    .map((k) => [k, o[k]]);
}

function key(f: ListFilterModel) {
  return JSON.stringify({
    q: f.searchTerm ?? "",
    sort: f.sortBy,
    direction: f.sortDirection,
    criteria: stable(f.makeSavedFilter()),
  });
}

export function useActiveSavedFilter(
  filter: ListFilterModel
): SavedFilterDataFragment | undefined {
  const { data } = useFindSavedFilters(filter.mode);
  const current = key(filter);

  // biome-ignore lint/correctness/useExhaustiveDependencies: only redone when the key changes, so paging or zooming doesn't rebuild every saved filter
  return useMemo(() => {
    const saved = data?.findSavedFilters ?? [];
    if (saved.length === 0) return undefined;

    return saved.find((sf) => {
      // as SavedFilterList's filterClicked loads one; a stored filter that
      // won't parse just isn't the active one, and mustn't take the toolbar
      // down with it
      try {
        const loaded = filter.clone();
        loaded.searchTerm = "";
        loaded.configureFromSavedFilter(sf);
        return key(loaded) === current;
      } catch {
        return false;
      }
    });
  }, [data, current]);
}
