// fork: suggestions under the toolbar search (ToolbarSearch.tsx), on the scene
// list: studios, performers and tags matching the typed term. Picking one
// filters by it in place of the typed term; + adds it to the filter, − adds
// it as an exclusion.
import React, { useEffect, useMemo, useState } from "react";
import { FormattedMessage, FormattedNumber, useIntl } from "react-intl";
import cx from "classnames";
import {
  faMinus,
  faPlus,
  faTag,
  faUser,
  faVideo,
  IconDefinition,
} from "@fortawesome/free-solid-svg-icons";
import * as GQL from "src/core/generated-graphql";
import {
  CriterionModifier,
  FindSearchSuggestionsQuery,
  SortDirectionEnum,
  useFindSearchSuggestionsQuery,
} from "src/core/generated-graphql";
import { ListFilterModel } from "src/models/list-filter/filter";
import {
  IHierarchicalLabeledIdCriterion,
  ModifierCriterion,
} from "src/models/list-filter/criteria/criterion";
import { ILabeledValueListValue } from "src/models/list-filter/types";
import { Icon } from "../Shared/Icon";

export type SuggestionKind = "studios" | "performers" | "tags";

export interface ISuggestion {
  kind: SuggestionKind;
  id: string;
  name: string;
  image?: string;
  sceneCount: number;
}

const kinds: SuggestionKind[] = ["studios", "performers", "tags"];
const kindIcon: Record<SuggestionKind, IconDefinition> = {
  studios: faVideo,
  performers: faUser,
  tags: faTag,
};

export const minSuggestionTerm = 2;
const perGroup = 5;
// the server answers in ~50ms, and Apollo shows only the latest term's
// answer (the last list stays up meanwhile), so this only saves requests
// while a word is typed in one go
const debounceMs = 100;

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function imageOf(path?: string | null) {
  return path && !path.includes("default=true") ? path : undefined;
}

type Result = FindSearchSuggestionsQuery;
type Tier = "exact" | "prefix" | "word" | "any";
// best first: the name is the term, starts with it, has a word that does,
// then anything `q` finds (aliases too); each tier busiest first
const tiers: Tier[] = ["exact", "prefix", "word", "any"];
// a tier repeats the ones before it, so it fetches more than it shows
const tierSize = 10;
const anySize = 15;

type Row =
  | GQL.SearchSuggestionStudioFragment
  | GQL.SearchSuggestionPerformerFragment
  | GQL.SearchSuggestionTagFragment;

function rowsOf(result: Result, kind: SuggestionKind, tier: Tier): Row[] {
  switch (kind) {
    case "studios":
      return [
        ...(result[`studios_${tier}`]?.studios ?? []),
        ...(tier === "exact"
          ? []
          : (result[`studios_${tier}_parents`]?.studios ?? [])),
      ];
    // the "any" tier is left out when `q` can't take the term
    case "performers":
      return result[`performers_${tier}`]?.performers ?? [];
    case "tags":
      return result[`tags_${tier}`]?.tags ?? [];
  }
}

function toSuggestion(kind: SuggestionKind, r: Row): ISuggestion {
  const disambiguation = "disambiguation" in r ? r.disambiguation : undefined;
  return {
    kind,
    id: r.id,
    name: disambiguation ? `${r.name} (${disambiguation})` : r.name,
    image: imageOf(r.image_path),
    sceneCount: r.scene_count,
  };
}

function suggestionsOf(result: Result, kind: SuggestionKind) {
  const seen = new Set<string>();
  const ret: ISuggestion[] = [];
  for (const tier of tiers) {
    // the server sorts studios by their own scenes; the count shown takes in
    // their sub-studios', so a network ranks by that
    const rows = [...rowsOf(result, kind, tier)].sort(
      (a, b) => b.scene_count - a.scene_count
    );
    for (const r of rows) {
      if (ret.length >= perGroup) return ret;
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      ret.push(toSuggestion(kind, r));
    }
  }
  return ret;
}

// `q` is a LIKE '%word%' per word, with no escape, and "-word" excludes: a
// term with % or _ or a "-word" would match unrelated items, so it goes to
// the name tiers alone, which take it literally
function qTakes(term: string) {
  return !/[%_]/.test(term) && !/(^|\s)-/.test(term);
}

// the matches for a term, debounced; the last ones stay while the next load
export function useSearchSuggestions(term: string, enabled: boolean) {
  const trimmed = term.trim();
  const [debounced, setDebounced] = useState(trimmed);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(trimmed), debounceMs);
    return () => clearTimeout(t);
  }, [trimmed]);

  const skip = !enabled || debounced.length < minSuggestionTerm;
  const re = escapeRegex(debounced);
  const busiest = {
    sort: "scenes_count",
    direction: SortDirectionEnum.Desc,
  };
  const { data, previousData } = useFindSearchSuggestionsQuery({
    skip,
    variables: {
      any: { q: debounced, per_page: anySize, ...busiest },
      tier: { per_page: tierSize, ...busiest },
      exact: `(?i)^${re}$`,
      prefix: `(?i)^${re}`,
      word: `(?i)\\b${re}`,
      parents: {
        per_page: tierSize,
        sort: "child_count",
        direction: SortDirectionEnum.Desc,
      },
      anyParents: {
        q: debounced,
        per_page: tierSize,
        sort: "child_count",
        direction: SortDirectionEnum.Desc,
      },
      withQ: qTakes(debounced),
    },
  });

  return useMemo(() => {
    if (skip) return [];
    const result = data ?? previousData;
    if (!result) return [];
    return kinds.flatMap((k) => suggestionsOf(result, k));
  }, [skip, data, previousData]);
}

export type SuggestionAction = "only" | "add" | "exclude";

// the filter with the suggestion added to its criterion (to its excluded
// items, with exclude), and no search term
export function addSuggestionToFilter(
  filter: ListFilterModel,
  s: ISuggestion,
  exclude = false
) {
  const existing = filter.criteriaFor(s.kind)[0] as
    | ModifierCriterion<ILabeledValueListValue>
    | undefined;
  const c = (existing?.clone() ??
    filter.makeCriterion(s.kind)) as ModifierCriterion<ILabeledValueListValue>;

  // a studio's count takes in its sub-studios, so a new studios criterion
  // does too; one already there keeps its depth
  const withSubStudios = () => {
    if (c instanceof IHierarchicalLabeledIdCriterion) c.value.depth = -1;
  };
  if (!existing && s.kind === "studios") withSubStudios();

  // "has none" / "has any" can't take items: start over
  if (
    c.modifier === CriterionModifier.IsNull ||
    c.modifier === CriterionModifier.NotNull
  ) {
    c.modifier =
      s.kind === "studios"
        ? CriterionModifier.Includes
        : c.modifierCriterionOption().defaultModifier;
    c.value = { ...c.value, items: [], excluded: [] };
    if (s.kind === "studios") withSubStudios();
  }

  // only "includes" and "includes all" take exclusions: "equals" (an exact
  // set) becomes "includes all" of its items
  if (
    exclude &&
    c.modifier !== CriterionModifier.Includes &&
    c.modifier !== CriterionModifier.IncludesAll
  ) {
    c.modifier = CriterionModifier.IncludesAll;
  }

  const item = { id: s.id, label: s.name };
  const without = (list: typeof c.value.items) =>
    list.filter((i) => i.id !== s.id);
  const plus = (list: typeof c.value.items) =>
    list.some((i) => i.id === s.id) ? list : [...list, item];
  c.value = exclude
    ? {
        ...c.value,
        items: without(c.value.items),
        excluded: plus(c.value.excluded),
      }
    : {
        ...c.value,
        items: plus(c.value.items),
        excluded: without(c.value.excluded),
      };

  const next = filter.replaceCriteria(s.kind, [c]);
  next.searchTerm = "";
  return next;
}

// a fresh filter of just the suggestion: the other criteria and the term go;
// sort, page size, display mode and zoom stay
export function filterBySuggestion(filter: ListFilterModel, s: ISuggestion) {
  const c = filter.makeCriterion(
    s.kind
  ) as ModifierCriterion<ILabeledValueListValue>;
  if (s.kind === "studios") {
    c.modifier = CriterionModifier.Includes;
    // a studio's count takes in its sub-studios
    if (c instanceof IHierarchicalLabeledIdCriterion) c.value.depth = -1;
  }
  c.value = { ...c.value, items: [{ id: s.id, label: s.name }], excluded: [] };

  const next = filter.setCriteria([c]);
  next.searchTerm = "";
  return next;
}

const Highlight: React.FC<{ text: string; term: string }> = ({
  text,
  term,
}) => {
  const at = text.toLowerCase().indexOf(term.trim().toLowerCase());
  if (!term.trim() || at < 0) return <>{text}</>;
  const end = at + term.trim().length;
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, end)}</mark>
      {text.slice(end)}
    </>
  );
};

export const ToolbarSearchSuggestions: React.FC<{
  id: string;
  items: ISuggestion[];
  active: number;
  term: string;
  onHover: (index: number) => void;
  // only: in place of the current filter; add, exclude: to it
  onPick: (s: ISuggestion, action: SuggestionAction) => void;
}> = ({ id, items, active, term, onHover, onPick }) => {
  const intl = useIntl();

  return (
    <div className="toolbar-search-suggestions" id={id} role="listbox">
      {kinds.map((kind) => {
        const group = items
          .map((s, index) => ({ s, index }))
          .filter(({ s }) => s.kind === kind);
        if (!group.length) return null;

        return (
          <div className="suggestion-group" key={kind} role="group">
            <div className="suggestion-group-label">
              <FormattedMessage id={kind} />
            </div>
            {group.map(({ s, index }) => (
              <div
                key={`${kind}-${s.id}`}
                id={`${id}-${index}`}
                role="option"
                aria-selected={index === active}
                className={cx("suggestion", `suggestion-${kind}`, {
                  active: index === active,
                })}
                onMouseMove={() => index !== active && onHover(index)}
                onClick={() => onPick(s, "only")}
              >
                <span className="suggestion-image">
                  {s.image ? (
                    <img src={s.image} alt="" loading="lazy" />
                  ) : (
                    <Icon icon={kindIcon[kind]} />
                  )}
                </span>
                <span className="suggestion-name">
                  <Highlight text={s.name} term={term} />
                </span>
                <span
                  className="suggestion-count"
                  title={`${intl.formatNumber(s.sceneCount)} ${intl
                    .formatMessage(
                      { id: "countables.scenes" },
                      { count: s.sceneCount }
                    )
                    .toLowerCase()}`}
                >
                  <FormattedNumber value={s.sceneCount} />
                </span>
                <button
                  type="button"
                  className="suggestion-action suggestion-exclude"
                  tabIndex={-1}
                  title="Exclude from current filter (Alt+Enter)"
                  aria-label={`Exclude ${s.name} from current filter`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPick(s, "exclude");
                  }}
                >
                  <Icon icon={faMinus} />
                </button>
                <button
                  type="button"
                  className="suggestion-action suggestion-add"
                  tabIndex={-1}
                  title="Add to current filter (Shift+Enter)"
                  aria-label={`Add ${s.name} to current filter`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPick(s, "add");
                  }}
                >
                  <Icon icon={faPlus} />
                </button>
              </div>
            ))}
          </div>
        );
      })}
      <div className="suggestion-hint" aria-hidden>
        <kbd>Enter</kbd> show only this · <kbd>Shift</kbd>+<kbd>Enter</kbd> or{" "}
        <Icon icon={faPlus} /> add · <kbd>Alt</kbd>+<kbd>Enter</kbd> or{" "}
        <Icon icon={faMinus} /> exclude
      </div>
    </div>
  );
};
