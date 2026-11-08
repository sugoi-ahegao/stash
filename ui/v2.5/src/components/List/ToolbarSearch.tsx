// fork: the list toolbar's search bar, the row's centrepiece. Upstream's
// SearchTermInput (ListFilter.tsx) stays as it is for the sidebar.
import React, { useEffect, useState } from "react";
import Mousetrap from "mousetrap";
import { useIntl } from "react-intl";
import cx from "classnames";
import { faMagnifyingGlass, faXmark } from "@fortawesome/free-solid-svg-icons";
import { ListFilterModel } from "src/models/list-filter/filter";
import { FilterMode } from "src/core/generated-graphql";
import useFocus from "src/utils/focus";
import { Icon } from "../Shared/Icon";
import { useDebouncedSearchInput } from "./ListFilter";

// the countables message naming what a list holds, for the placeholder
const countableID: Partial<Record<FilterMode, string>> = {
  [FilterMode.Galleries]: "galleries",
  [FilterMode.Groups]: "groups",
  [FilterMode.Movies]: "groups",
  [FilterMode.Images]: "images",
  [FilterMode.Performers]: "performers",
  [FilterMode.Scenes]: "scenes",
  [FilterMode.SceneMarkers]: "markers",
  [FilterMode.Studios]: "studios",
  [FilterMode.Tags]: "tags",
};

export const ToolbarSearch: React.FC<{
  filter: ListFilterModel;
  onFilterUpdate: (newFilter: ListFilterModel) => void;
}> = ({ filter, onFilterUpdate }) => {
  const intl = useIntl();
  const [value, setValue] = useState(filter.searchTerm);
  const [focused, setFocused] = useState(false);
  const [inputRef, setInputFocus] = useFocus();

  // a saved filter, the URL or Clear can change the term from outside
  useEffect(() => {
    setValue(filter.searchTerm);
  }, [filter.searchTerm]);

  const { searchCallback, onClear } = useDebouncedSearchInput(
    filter,
    onFilterUpdate
  );

  // "/" from anywhere: focus, with the term selected so typing replaces it.
  // Bound every render: the edit filter dialog binds "/" too, and unbinds it
  // when it closes.
  useEffect(() => {
    Mousetrap.bind("/", (e) => {
      e.preventDefault();
      setInputFocus();
      setInputFocus(true);
    });
    return () => {
      Mousetrap.unbind("/");
    };
  });

  function clear() {
    searchCallback.cancel();
    setValue("");
    onClear();
  }

  function onChange(next: string) {
    setValue(next);
    if (next) {
      searchCallback(next);
    } else {
      clear();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      // don't wait out the debounce
      searchCallback.flush();
    } else if (e.key === "Escape") {
      // first press clears, the next one leaves
      if (value) {
        e.stopPropagation();
        clear();
      } else {
        inputRef.current?.blur();
      }
    }
  }

  const id = filter.mode ? countableID[filter.mode] : undefined;
  const search = intl.formatMessage({ id: "actions.search" });
  const placeholder = id
    ? `${search} ${intl.formatMessage({ id: `countables.${id}` }, { count: 2 }).toLowerCase()}…`
    : `${search}…`;

  return (
    <div
      className={cx("toolbar-search", {
        focused,
        "has-value": !!value,
      })}
      onMouseDown={(e) => {
        // a click anywhere on the bar lands in the field
        if (e.target !== inputRef.current) {
          e.preventDefault();
          setInputFocus();
        }
      }}
    >
      <Icon icon={faMagnifyingGlass} className="toolbar-search-icon" />
      <input
        ref={inputRef}
        className="toolbar-search-input"
        type="text"
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
        aria-label={search}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {value ? (
        <button
          type="button"
          className="toolbar-search-clear"
          title={intl.formatMessage({ id: "actions.clear" })}
          onClick={clear}
        >
          <Icon icon={faXmark} />
        </button>
      ) : (
        !focused && (
          <kbd className="toolbar-search-key" aria-hidden>
            /
          </kbd>
        )
      )}
    </div>
  );
};
