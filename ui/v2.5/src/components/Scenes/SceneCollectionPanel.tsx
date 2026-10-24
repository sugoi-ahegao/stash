import React, { useMemo, useState } from "react";
import {
  COLLECTIONS_PER_PAGE,
  CollectionSortBy,
  DEFAULT_COLLECTION_SORT_BY,
  DEFAULT_COLLECTION_SORT_DIRECTION,
  ICollectionRoots,
  collectionExtremes,
  collectionFilter,
  collectionNamesByFolderId,
  collectionSortByOptions,
  sortCollections,
  toCollections,
} from "src/core/collections";
import * as GQL from "src/core/generated-graphql";
import { useConfigurationContext } from "src/hooks/Config";
import { useForkConfig } from "src/core/forkConfig";
import { ListFilterModel } from "src/models/list-filter/filter";
import ScreenUtils from "src/utils/screen";
import { Pagination, PaginationIndex } from "../List/Pagination";
import { SortBySelect } from "../List/SortBySelect";
import { LoadingIndicator } from "../Shared/LoadingIndicator";
import { SceneRecommendationRow } from "./SceneRecommendationRow";

// The Collections display mode: one row of scene cards per intake folder.
//
// Unlike the other display modes this one does not render the page of scenes it would be
// handed - collections are folders, so it pages over folders and each row runs its own
// scene query, narrowed by whatever the list is already filtered to. SceneList therefore
// hides the outer scene pagination while this mode is active and lets this component
// paginate instead.
//
// Its sort is likewise its own: the list's sort orders scenes WITHIN each row, while this
// one orders the rows themselves. See src/core/collections.ts.
export const SceneCollectionPanel: React.FC<{
  filter: ListFilterModel;
}> = ({ filter }) => {
  const { configuration } = useConfigurationContext();
  const { collectionsFolder } = useForkConfig();
  const isTouch = ScreenUtils.isTouch();

  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<CollectionSortBy>(
    DEFAULT_COLLECTION_SORT_BY
  );
  const [sortDirection, setSortDirection] = useState(
    DEFAULT_COLLECTION_SORT_DIRECTION
  );

  const { data, loading } = GQL.useFindCollectionFoldersQuery();

  // the timestamps the rows are ranked by. Only fetched when a timestamp sort is active,
  // since it is a whole-library query and name ordering does not need it.
  const needsStats = sortBy !== "name";
  const sceneFilter = useMemo(() => filter.makeFilter(), [filter]);
  const { data: statsData } = GQL.useFindCollectionSceneStatsQuery({
    variables: { scene_filter: sceneFilter },
    skip: !needsStats,
  });

  // undefined until an intake folder is set, and then there are no collections
  const where = useMemo<ICollectionRoots | undefined>(
    () =>
      collectionsFolder
        ? {
            roots: (configuration?.general.stashes ?? []).map((s) => s.path),
            intakeFolder: collectionsFolder,
          }
        : undefined,
    [configuration?.general.stashes, collectionsFolder]
  );

  const folders = data?.findFolders.folders;

  const collections = useMemo(() => {
    if (!folders || !where) return [];
    return toCollections(folders, where);
  }, [folders, where]);

  const extremes = useMemo(() => {
    const scenes = statsData?.findScenes.scenes;
    if (!scenes || !folders || !where) return new Map();
    return collectionExtremes(
      scenes,
      collectionNamesByFolderId(folders, where)
    );
  }, [statsData?.findScenes.scenes, folders, where]);

  const sorted = useMemo(
    () => sortCollections(collections, extremes, sortBy, sortDirection),
    [collections, extremes, sortBy, sortDirection]
  );

  const pageCollections = useMemo(
    () =>
      sorted.slice(
        (page - 1) * COLLECTIONS_PER_PAGE,
        page * COLLECTIONS_PER_PAGE
      ),
    [sorted, page]
  );

  function onChangeSortBy(value: string | null) {
    setSortBy((value as CollectionSortBy) ?? DEFAULT_COLLECTION_SORT_BY);
    setPage(1);
  }

  function onChangeSortDirection() {
    setSortDirection((current) =>
      current === GQL.SortDirectionEnum.Asc
        ? GQL.SortDirectionEnum.Desc
        : GQL.SortDirectionEnum.Asc
    );
    setPage(1);
  }

  if (loading) {
    return <LoadingIndicator />;
  }

  if (collections.length === 0) {
    return null;
  }

  return (
    <div className="scene-collections">
      {/* mirrors the list's own toolbar and pagination, which SceneList hides in this mode */}
      <div className="collections-toolbar">
        <SortBySelect
          sortBy={sortBy}
          sortDirection={sortDirection}
          options={collectionSortByOptions}
          onChangeSortBy={onChangeSortBy}
          onChangeSortDirection={onChangeSortDirection}
          onReshuffleRandomSort={() => {}}
        />
      </div>

      <div className="pagination-index-container">
        <Pagination
          itemsPerPage={COLLECTIONS_PER_PAGE}
          currentPage={page}
          totalItems={sorted.length}
          onChangePage={setPage}
        />
        <PaginationIndex
          itemsPerPage={COLLECTIONS_PER_PAGE}
          currentPage={page}
          totalItems={sorted.length}
        />
      </div>

      {pageCollections.map((collection) => (
        <SceneRecommendationRow
          key={collection.name}
          isTouch={isTouch}
          filter={collectionFilter(collection, filter)}
          header={collection.name}
        />
      ))}

      {sorted.length > COLLECTIONS_PER_PAGE && (
        <div className="pagination-footer-container">
          <div className="pagination-footer">
            <Pagination
              itemsPerPage={COLLECTIONS_PER_PAGE}
              currentPage={page}
              totalItems={sorted.length}
              onChangePage={setPage}
              pagePopupPlacement="top"
            />
          </div>
        </div>
      )}
    </div>
  );
};
