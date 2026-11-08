import React, { useMemo, useState } from "react";
import { Button, Dropdown, Overlay, Popover } from "react-bootstrap";
import { FormattedMessage, useIntl } from "react-intl";
import {
  faChevronDown,
  faPlus,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";
import cx from "classnames";
import { ListFilterModel } from "src/models/list-filter/filter";
import { CriterionType } from "src/models/list-filter/types";
import { Criterion } from "src/models/list-filter/criteria/criterion";
import { getFilterOptions } from "src/models/list-filter/factory";
import { useConfigurationContext } from "src/hooks/Config";
import { Icon } from "../Shared/Icon";
import { SidebarSectionStates, SidebarStateContext } from "../Shared/Sidebar";

// fork: the filter as a row of chips under the toolbar, in place of the
// filter sidebar, the filter button and the filter tags. Only the filters in
// use have a chip; "Add filter" adds one. A quick chip (the list's `chips`)
// opens its sidebar editor in a popover and applies as you pick; any other
// criterion opens the edit filter dialog.

export interface IFilterChip {
  // the criterion option's type, e.g. "tags"
  type: CriterionType;
  messageID: string;
  // the editor shown in the chip's popover: one of the Sidebar*Filter
  // components, which apply to the filter as they change
  editor: (
    filter: ListFilterModel,
    setFilter: (f: ListFilterModel) => void
  ) => React.ReactNode;
}

// The sidebar editors are collapsible sections; in a popover every one is open.
const allOpen = new Proxy({} as SidebarSectionStates, { get: () => true });
const popoverSectionState = { sectionOpen: allOpen, setSectionOpen: () => {} };

function useCriterionLabel() {
  const intl = useIntl();
  const { configuration } = useConfigurationContext();
  const sfw = configuration.interface.sfwContentMode;
  return (c: Criterion) => c.getLabel(intl, sfw);
}

const ChipRemove: React.FC<{ onRemove: () => void }> = ({ onRemove }) => {
  const intl = useIntl();
  return (
    <button
      type="button"
      className="filter-chip-remove"
      title={intl.formatMessage({ id: "actions.remove" })}
      onClick={(e) => {
        e.stopPropagation();
        onRemove();
      }}
    >
      <Icon icon={faTimes} />
    </button>
  );
};

const PinnedChip: React.FC<{
  chip: IFilterChip;
  filter: ListFilterModel;
  setFilter: (f: ListFilterModel) => void;
  // open on mount: the chip was just added from More
  startOpen?: boolean;
  onOpened: () => void;
  onClosed: () => void;
}> = ({ chip, filter, setFilter, startOpen = false, onOpened, onClosed }) => {
  // a state ref, so a chip that starts open has its target on first paint
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  const [show, setShow] = useState(startOpen);
  const label = useCriterionLabel();

  const criterion = filter.criteria.find(
    (c) => c.criterionOption.type === chip.type
  );

  return (
    <>
      <div
        ref={setTarget}
        className={cx("filter-chip", { set: !!criterion, open: show })}
      >
        <button
          type="button"
          className="filter-chip-main"
          onClick={() => {
            if (show) onClosed();
            else onOpened();
            setShow(!show);
          }}
        >
          {criterion ? (
            <span className="filter-chip-label">{label(criterion)}</span>
          ) : (
            <>
              <FormattedMessage id={chip.messageID} />
              <Icon icon={faChevronDown} className="filter-chip-caret" />
            </>
          )}
        </button>
        {criterion && (
          <ChipRemove
            onRemove={() => setFilter(filter.removeCriterion(chip.type))}
          />
        )}
      </div>
      <Overlay
        target={target}
        show={show && !!target}
        placement="bottom-start"
        rootClose
        onHide={() => {
          setShow(false);
          onClosed();
        }}
      >
        <Popover
          id={`filter-chip-${chip.type}`}
          className="filter-chip-popover"
        >
          <Popover.Content>
            <SidebarStateContext.Provider value={popoverSectionState}>
              {chip.editor(filter, setFilter)}
            </SidebarStateContext.Provider>
          </Popover.Content>
        </Popover>
      </Overlay>
    </>
  );
};

export const FilterChips: React.FC<{
  filter: ListFilterModel;
  setFilter: (f: ListFilterModel) => void;
  chips: IFilterChip[];
  // filters that don't apply to this list, left out of + Filter
  notApplicable?: CriterionType[];
  showEditFilter: (editingCriterion?: string) => void;
}> = ({ filter, setFilter, chips, notApplicable, showEditFilter }) => {
  const intl = useIntl();
  const label = useCriterionLabel();
  const { configuration } = useConfigurationContext();
  const sfw = configuration.interface.sfwContentMode;

  // the quick chip being edited: picked from More and shown before it has a
  // value, or open and kept while its last value is deselected
  const [adding, setAdding] = useState<CriterionType>();

  const setTypes = new Set(filter.criteria.map((c) => c.criterionOption.type));

  const pinned = useMemo(
    () => new Set<CriterionType>(chips.map((c) => c.type)),
    [chips]
  );

  // only the filters in use have a chip
  const shownChips = chips.filter(
    (c) => setTypes.has(c.type) || adding === c.type
  );

  // criteria set some other way (the dialog, a link, a saved filter)
  const others = filter.criteria.filter(
    (c) => !pinned.has(c.criterionOption.type)
  );

  // More: the quick ones first (they open as a chip), then the rest
  // (they open the edit filter dialog); a filter in use is edited on its chip
  const quickOptions = chips
    .filter((c) => !setTypes.has(c.type))
    .map((c) => ({
      type: c.type,
      label: intl.formatMessage({ id: c.messageID }),
    }));

  const moreOptions = useMemo(
    () =>
      getFilterOptions(filter.mode)
        .criterionOptions.filter((o) => !o.hidden && !pinned.has(o.type))
        .map((o) => ({
          type: o.type,
          label: intl.formatMessage({
            id: sfw ? (o.sfwMessageID ?? o.messageID) : o.messageID,
          }),
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [filter.mode, pinned, intl, sfw]
  ).filter((o) => !setTypes.has(o.type) && !notApplicable?.includes(o.type));

  return (
    <div className="filter-chips">
      <Dropdown className="filter-chip-more">
        <Dropdown.Toggle
          variant="link"
          className="filter-chip filter-chip-main"
        >
          <Icon icon={faPlus} />
          <FormattedMessage id="search_filter.add_filter" />
        </Dropdown.Toggle>
        <Dropdown.Menu className="filter-chip-more-menu">
          {quickOptions.map((o) => (
            <Dropdown.Item
              key={o.type}
              className="filter-chip-quick"
              // after the click has finished, or it closes the new popover
              onClick={() => window.setTimeout(() => setAdding(o.type), 0)}
            >
              {o.label}
            </Dropdown.Item>
          ))}
          {quickOptions.length > 0 && moreOptions.length > 0 && (
            <Dropdown.Divider />
          )}
          {moreOptions.map((o) => (
            <Dropdown.Item key={o.type} onClick={() => showEditFilter(o.type)}>
              {o.label}
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown>

      {filter.criteria.length > 0 && (
        <Button
          variant="link"
          className="filter-chips-clear"
          onClick={() => setFilter(filter.clearCriteria())}
        >
          <FormattedMessage id="actions.clear" />
        </Button>
      )}

      {shownChips.map((chip) => (
        <PinnedChip
          key={chip.type}
          chip={chip}
          filter={filter}
          setFilter={setFilter}
          startOpen={adding === chip.type}
          onOpened={() => setAdding(chip.type)}
          // only its own: clicking another chip opens that one first
          onClosed={() => setAdding((a) => (a === chip.type ? undefined : a))}
        />
      ))}

      {others.map((c) => (
        <div key={c.getId()} className="filter-chip set">
          <button
            type="button"
            className="filter-chip-main"
            onClick={() => showEditFilter(c.criterionOption.type)}
          >
            <span className="filter-chip-label">{label(c)}</span>
          </button>
          <ChipRemove
            onRemove={() =>
              setFilter(filter.removeCriterion(c.criterionOption.type))
            }
          />
        </div>
      ))}
    </div>
  );
};
