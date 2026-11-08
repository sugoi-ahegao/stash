import { useMemo } from "react";
import { FormattedMessage } from "react-intl";
import { ListFilterModel } from "src/models/list-filter/filter";
import { StudiosCriterionOption } from "src/models/list-filter/criteria/studios";
import { PerformersCriterionOption } from "src/models/list-filter/criteria/performers";
import { TagsCriterionOption } from "src/models/list-filter/criteria/tags";
import { RatingCriterionOption } from "src/models/list-filter/criteria/rating";
import {
  DurationCriterionOption,
  PerformerAgeCriterionOption,
} from "src/models/list-filter/scenes";
import { OrganizedCriterionOption } from "src/models/list-filter/criteria/organized";
import { HasMarkersCriterionOption } from "src/models/list-filter/criteria/has-markers";
import { DuplicatedCriterionOption } from "src/models/list-filter/criteria/phash";
import { FolderCriterionOption } from "src/models/list-filter/criteria/folder";
import { IFilterChip } from "../List/FilterChips";
import { SidebarStudiosFilter } from "../List/Filters/StudiosFilter";
import { SidebarPerformersFilter } from "../List/Filters/PerformersFilter";
import { SidebarTagsFilter } from "../List/Filters/TagsFilter";
import { SidebarRatingFilter } from "../List/Filters/RatingFilter";
import { SidebarDurationFilter } from "../List/Filters/SidebarDurationFilter";
import { SidebarBooleanFilter } from "../List/Filters/BooleanFilter";
import { SidebarDuplicateFilter } from "../List/Filters/DuplicateFilter";
import { SidebarAgeFilter } from "../List/Filters/SidebarAgeFilter";
import { SidebarFolderFilter } from "../List/Filters/FolderFilter";
import { View } from "../List/views";

// fork: the filters + Filter leaves out for a list, as they don't apply there
export function sceneFiltersNotApplicable(view?: View) {
  return view === View.StudioScenes ? [StudiosCriterionOption.type] : [];
}

// fork: the scene list's quick filters, in the order + Filter lists them:
// the sidebar's sections, each opening its Sidebar*Filter in a chip popover.
// Everything else goes through the edit filter dialog. A studio's scenes have
// no studio filter. An editor needs a sectionID, or its section starts closed.
export function useSceneFilterChips(
  view?: View,
  filterHook?: (f: ListFilterModel) => ListFilterModel
): IFilterChip[] {
  return useMemo(() => {
    const chips: IFilterChip[] = [];

    if (view !== View.StudioScenes) {
      chips.push({
        type: StudiosCriterionOption.type,
        messageID: StudiosCriterionOption.messageID,
        editor: (filter, setFilter) => (
          <SidebarStudiosFilter
            filter={filter}
            setFilter={setFilter}
            filterHook={filterHook}
          />
        ),
      });
    }

    chips.push(
      {
        type: PerformersCriterionOption.type,
        messageID: PerformersCriterionOption.messageID,
        editor: (filter, setFilter) => (
          <SidebarPerformersFilter
            filter={filter}
            setFilter={setFilter}
            filterHook={filterHook}
          />
        ),
      },
      {
        type: TagsCriterionOption.type,
        messageID: TagsCriterionOption.messageID,
        editor: (filter, setFilter) => (
          <SidebarTagsFilter
            filter={filter}
            setFilter={setFilter}
            filterHook={filterHook}
          />
        ),
      },
      {
        type: RatingCriterionOption.type,
        messageID: "rating",
        editor: (filter, setFilter) => (
          <SidebarRatingFilter filter={filter} setFilter={setFilter} />
        ),
      },
      {
        type: DurationCriterionOption.type,
        messageID: DurationCriterionOption.messageID,
        editor: (filter, setFilter) => (
          <SidebarDurationFilter filter={filter} setFilter={setFilter} />
        ),
      },
      {
        type: OrganizedCriterionOption.type,
        messageID: OrganizedCriterionOption.messageID,
        editor: (filter, setFilter) => (
          <SidebarBooleanFilter
            title={<FormattedMessage id="organized" />}
            option={OrganizedCriterionOption}
            filter={filter}
            setFilter={setFilter}
            sectionID="organized"
          />
        ),
      },
      {
        type: HasMarkersCriterionOption.type,
        messageID: HasMarkersCriterionOption.messageID,
        editor: (filter, setFilter) => (
          <SidebarBooleanFilter
            title={<FormattedMessage id="hasMarkers" />}
            option={HasMarkersCriterionOption}
            filter={filter}
            setFilter={setFilter}
            sectionID="hasMarkers"
          />
        ),
      },
      {
        type: DuplicatedCriterionOption.type,
        messageID: DuplicatedCriterionOption.messageID,
        editor: (filter, setFilter) => (
          <SidebarDuplicateFilter
            title={<FormattedMessage id="duplicated" />}
            filter={filter}
            setFilter={setFilter}
            sectionID="duplicated"
          />
        ),
      },
      {
        type: PerformerAgeCriterionOption.type,
        messageID: PerformerAgeCriterionOption.messageID,
        editor: (filter, setFilter) => (
          <SidebarAgeFilter
            title={<FormattedMessage id="performer_age" />}
            option={PerformerAgeCriterionOption}
            filter={filter}
            setFilter={setFilter}
            sectionID="performer_age"
          />
        ),
      },
      {
        type: FolderCriterionOption.type,
        messageID: FolderCriterionOption.messageID,
        editor: (filter, setFilter) => (
          <SidebarFolderFilter
            text={<FormattedMessage id="folder" />}
            filter={filter}
            setFilter={setFilter}
            sectionID="folder"
          />
        ),
      }
    );

    return chips;
  }, [view, filterHook]);
}
