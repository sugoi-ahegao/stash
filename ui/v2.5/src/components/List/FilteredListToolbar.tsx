import React, { useCallback, useMemo } from "react";
import { QueryResult } from "@apollo/client";
import { ListFilterModel } from "src/models/list-filter/filter";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { ToolbarSearch } from "./ToolbarSearch"; // fork
import { SortBySelect } from "./SortBySelect";
import { DisplayOptions } from "./DisplayOptions"; // fork
import { useActiveSavedFilter } from "./activeSavedFilter"; // fork
import {
  IListFilterOperation,
  ListOperationButtons,
} from "./ListOperationButtons";
import { Button, ButtonToolbar } from "react-bootstrap";
import { View } from "./views";
import { IListSelect, useFilterOperations } from "./util";
import { SavedFilterDropdown } from "./SavedFilterList";
import { FilterButton } from "./Filters/FilterButton";
import { Icon } from "../Shared/Icon";
import { faChevronDown, faTimes } from "@fortawesome/free-solid-svg-icons";
import { faSquareCheck } from "@fortawesome/free-regular-svg-icons";
import { useIntl } from "react-intl";
import cx from "classnames";
import { useConfigurationContext } from "src/hooks/Config";
import { useConfigureUI } from "src/core/StashService";
import { useToast } from "src/hooks/Toast";

const SelectionSection: React.FC<{
  filter: ListFilterModel;
  selected: number;
  onSelectAll: () => void;
  onSelectNone: () => void;
}> = ({ selected, onSelectAll, onSelectNone }) => {
  const intl = useIntl();

  return (
    <div className="selected-items-info">
      <Button
        variant="secondary"
        className="minimal"
        onClick={() => onSelectNone()}
        title={intl.formatMessage({ id: "actions.select_none" })}
      >
        <Icon icon={faTimes} />
      </Button>
      <span className="selected-count">{selected}</span>
      <Button
        variant="secondary"
        className="minimal"
        onClick={() => onSelectAll()}
        title={intl.formatMessage({ id: "actions.select_all" })}
      >
        <Icon icon={faSquareCheck} />
      </Button>
    </div>
  );
};

export interface IItemListOperation<T extends QueryResult> {
  text: string;
  onClick: (
    result: T,
    filter: ListFilterModel,
    selectedIds: Set<string>
  ) => Promise<void>;
  isDisplayed?: (
    result: T,
    filter: ListFilterModel,
    selectedIds: Set<string>
  ) => boolean;
  postRefetch?: boolean;
  icon?: IconDefinition;
  buttonVariant?: string;
}

export interface IFilteredListToolbar {
  filter: ListFilterModel;
  setFilter: (
    value: ListFilterModel | ((prevState: ListFilterModel) => ListFilterModel)
  ) => void;
  showEditFilter: () => void;
  view?: View;
  listSelect: IListSelect;
  onEdit?: () => void;
  onDelete?: () => void;
  operations?: IListFilterOperation[];
  operationComponent?: React.ReactNode;
  zoomable?: boolean;
  showThumbnails?: boolean;
  onSetShowThumbnails?: (v: boolean) => void;
  filterable?: boolean;
  sortable?: boolean;
  showFilterButton?: boolean; // fork: false where FilterChips stand in
}

export const FilteredListToolbar: React.FC<IFilteredListToolbar> = ({
  filter,
  setFilter,
  showEditFilter,
  view,
  listSelect,
  onEdit,
  onDelete,
  operations,
  operationComponent,
  zoomable = false,
  showThumbnails,
  onSetShowThumbnails,
  filterable = true,
  sortable = true,
  showFilterButton = true, // fork
}) => {
  const { configuration } = useConfigurationContext();
  const { pinnedSortBy = {} } = configuration.ui;

  const Toast = useToast();

  const [saveUI] = useConfigureUI();

  const pinnedOptions = useMemo(
    () => (view ? (pinnedSortBy[view] ?? []) : []),
    [view, pinnedSortBy]
  );

  const updatePinnedSortBy = useCallback(
    async (value: string[]) => {
      if (!view) {
        return;
      }

      try {
        await saveUI({
          variables: {
            input: {
              ...configuration?.ui,
              pinnedSortBy: {
                ...configuration?.ui.pinnedSortBy,
                [view]: value,
              },
            },
          },
        });
      } catch (e) {
        Toast.error(e);
      }
    },
    [view, saveUI, configuration.ui, Toast]
  );

  const togglePinSortBy = useCallback(
    (sortBy: string) => {
      if (!view) {
        return;
      }

      let newPinned: string[];

      if (pinnedOptions.includes(sortBy)) {
        newPinned = pinnedOptions.filter((s) => s !== sortBy);
      } else {
        newPinned = [...pinnedOptions, sortBy];
      }

      updatePinnedSortBy(newPinned);
    },
    [view, pinnedOptions, updatePinnedSortBy]
  );

  const intl = useIntl(); // fork
  const activeSavedFilter = useActiveSavedFilter(filter); // fork

  const filterOptions = filter.options;
  // Something in the popper layout for groups.sub-groups tab to double calculates the offset
  // causing the dropdown to be misaligned. Portal to document.body to fix this.
  const menuPortalTarget =
    typeof document !== "undefined" ? document.body : undefined;
  const { setDisplayMode, setZoom } = useFilterOperations({
    filter,
    setFilter,
  });
  const { selectedIds, onSelectAll, onSelectNone, onInvertSelection } =
    listSelect;
  const hasSelection = selectedIds.size > 0;

  const renderOperations = operationComponent ?? (
    <ListOperationButtons
      onSelectAll={onSelectAll}
      onSelectNone={onSelectNone}
      onInvertSelection={onInvertSelection}
      otherOperations={operations}
      itemsSelected={selectedIds.size > 0}
      onEdit={onEdit}
      onDelete={onDelete}
    />
  );

  return (
    <ButtonToolbar
      className={cx("filtered-list-toolbar", { "has-selection": hasSelection })}
    >
      {hasSelection ? (
        <SelectionSection
          filter={filter}
          selected={selectedIds.size}
          onSelectAll={onSelectAll}
          onSelectNone={onSelectNone}
        />
      ) : (
        <>
          {/* fork: saved filters before the search, naming the one shown */}
          {filterable && (
            <SavedFilterDropdown
              filter={filter}
              onSetFilter={setFilter}
              view={view}
              menuPortalTarget={menuPortalTarget}
              toggleClassName={cx("saved-filter-toggle", {
                active: !!activeSavedFilter,
              })}
              toggleLabel={
                <span className="saved-filter-toggle-name">
                  {activeSavedFilter?.name ??
                    intl.formatMessage({ id: "search_filter.saved_filters" })}
                </span>
              }
              toggleCaret={
                <Icon icon={faChevronDown} className="saved-filter-caret" />
              }
            />
          )}

          {/* fork: the search bar, the row's centrepiece */}
          {filterable && (
            <ToolbarSearch filter={filter} onFilterUpdate={setFilter} />
          )}
        </>
      )}

      {/* fork: everything after the search, as one side, so the search can be
          centred (toolbar-search.scss) */}
      <div className="toolbar-end">
        {!hasSelection && filterable && showFilterButton && (
          <FilterButton
            onClick={() => showEditFilter()}
            count={filter.count()}
          />
        )}

        {!hasSelection && sortable && (
          <SortBySelect
            sortBy={filter.sortBy}
            sortDirection={filter.sortDirection}
            options={filterOptions.sortByOptions}
            pinnedOptions={pinnedOptions}
            togglePinSortBy={togglePinSortBy}
            onChangeSortBy={(e) => setFilter(filter.setSortBy(e ?? undefined))}
            onChangeSortDirection={() =>
              setFilter(filter.toggleSortDirection())
            }
            onReshuffleRandomSort={() =>
              setFilter(filter.reshuffleRandomSort())
            }
          />
        )}

        {/* fork: the page size is in DisplayOptions */}

        {renderOperations}

        {/* fork: mode, card size and thumbnails under one button */}
        <DisplayOptions
          displayMode={filter.displayMode}
          displayModeOptions={filterOptions.displayModeOptions}
          onSetDisplayMode={setDisplayMode}
          zoomIndex={zoomable ? filter.zoomIndex : undefined}
          onSetZoom={zoomable ? setZoom : undefined}
          showThumbnails={showThumbnails}
          onSetShowThumbnails={onSetShowThumbnails}
          pageSize={filter.itemsPerPage}
          onSetPageSize={(size) => setFilter(filter.setPageSize(size))}
        />
      </div>
    </ButtonToolbar>
  );
};
