// fork: the list toolbar's search bar, the row's centrepiece. Upstream's
// SearchTermInput (ListFilter.tsx) stays as it is for the sidebar.
import React, {
  startTransition,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import Mousetrap from "mousetrap";
import { useIntl } from "react-intl";
import cx from "classnames";
import { faMagnifyingGlass, faXmark } from "@fortawesome/free-solid-svg-icons";
import { ListFilterModel } from "src/models/list-filter/filter";
import { FilterMode } from "src/core/generated-graphql";
import useFocus from "src/utils/focus";
import { Icon } from "../Shared/Icon";
import { useDebouncedSearchInput } from "./ListFilter";
import {
  addSuggestionToFilter,
  filterBySuggestion,
  ISuggestion,
  SuggestionAction,
  ToolbarSearchSuggestions,
  useSearchSuggestions,
} from "./ToolbarSearchSuggestions"; // fork

// as toolbar-search.scss sizes the suggestions' + for a finger: a touch
// screen, or phone width (Bootstrap's xs)
const touchOrPhone = "(pointer: coarse), (max-width: 575.98px)";

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
  // studios, performers and tags matching the term, under the bar
  suggestions?: boolean;
}> = ({ filter, onFilterUpdate, suggestions = false }) => {
  const intl = useIntl();
  const [value, setValue] = useState(filter.searchTerm);
  const [focused, setFocused] = useState(false);
  const [inputRef, setInputFocus] = useFocus();
  const listID = useId();

  // the suggestions: open while focused with matches, until Escape or a pick;
  // typing opens them again
  const matches = useSearchSuggestions(value, suggestions && focused);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(-1);
  const open = suggestions && focused && !dismissed && matches.length > 0;

  // new matches: nothing highlighted
  const [shownMatches, setShownMatches] = useState(matches);
  if (shownMatches !== matches) {
    setShownMatches(matches);
    setActive(-1);
  }

  // the term as typed goes to the list as a transition: re-rendering the
  // list takes a few hundred ms, and typing (and the suggestions) mustn't
  // wait on it. It can land after more is typed, so the term it carries
  // doesn't overwrite the field.
  const sentTerm = useRef<string>();
  function searchUpdate(next: ListFilterModel) {
    sentTerm.current = next.searchTerm;
    startTransition(() => onFilterUpdate(next));
  }

  // a saved filter, the URL or Clear can change the term from outside
  useEffect(() => {
    if (
      sentTerm.current !== undefined &&
      filter.searchTerm === sentTerm.current
    ) {
      sentTerm.current = undefined;
      return;
    }
    sentTerm.current = undefined;
    setValue(filter.searchTerm);
  }, [filter.searchTerm]);

  const { searchCallback, onClear } = useDebouncedSearchInput(
    filter,
    searchUpdate
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
    setDismissed(false);
    if (next) {
      searchCallback(next);
    } else {
      clear();
    }
  }

  // a pick shows just that item; add and exclude put it in the current filter
  function pick(s: ISuggestion, action: SuggestionAction) {
    searchCallback.cancel();
    setValue("");
    setDismissed(true);
    onFilterUpdate(
      action === "only"
        ? filterBySuggestion(filter, s)
        : addSuggestionToFilter(filter, s, action === "exclude")
    );
    // a phone: leave the field, so its keyboard makes way for the results.
    // Elsewhere stay in it, ready for the next term (and keys don't fall
    // through to the page's hotkeys).
    if (window.matchMedia(touchOrPhone).matches) {
      inputRef.current?.blur();
    }
  }

  function onSuggestionKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!suggestions) return false;

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!open) {
        if (e.key === "ArrowDown" && dismissed && matches.length) {
          e.preventDefault();
          setDismissed(false);
          return true;
        }
        return false;
      }
      e.preventDefault();
      const n = matches.length;
      setActive((i) =>
        e.key === "ArrowDown" ? (i + 1) % n : i <= 0 ? n - 1 : i - 1
      );
      return true;
    }
    if (!open) return false;
    if (e.key === "Enter" && active >= 0 && matches[active]) {
      e.preventDefault();
      pick(matches[active], e.altKey ? "exclude" : e.shiftKey ? "add" : "only");
      return true;
    }
    if (e.key === "Escape") {
      e.stopPropagation();
      setDismissed(true);
      setActive(-1);
      return true;
    }
    return false;
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (onSuggestionKey(e)) {
      return;
    }
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
        "suggestions-open": open,
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
        onBlur={() => {
          setFocused(false);
          setDismissed(false);
        }}
        {...(suggestions && {
          role: "combobox",
          "aria-autocomplete": "list" as const,
          "aria-expanded": open,
          "aria-controls": listID,
          "aria-activedescendant":
            open && active >= 0 ? `${listID}-${active}` : undefined,
        })}
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
      {open && (
        <ToolbarSearchSuggestions
          id={listID}
          items={matches}
          active={active}
          term={value}
          onHover={setActive}
          onPick={pick}
        />
      )}
    </div>
  );
};
