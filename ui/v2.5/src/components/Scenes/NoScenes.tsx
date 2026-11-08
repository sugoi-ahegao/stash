// fork: what the scene list shows in place of the cards when there are none
// (no-scenes.scss): "No results", or, for a library with no scenes at all,
// where to go to add some.
import React from "react";
import { FormattedMessage } from "react-intl";
import { Link } from "react-router-dom";
import { faFilm, faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { Icon } from "../Shared/Icon";

export const NoScenes: React.FC<{ emptyLibrary: boolean }> = ({
  emptyLibrary,
}) => (
  <div className="no-scenes">
    <Icon
      icon={emptyLibrary ? faFilm : faMagnifyingGlass}
      className="no-scenes-icon"
    />
    <h4 className="no-scenes-heading">
      <FormattedMessage
        id={
          emptyLibrary
            ? "search_filter.no_scenes_yet"
            : "search_filter.no_results"
        }
      />
    </h4>
    {emptyLibrary && (
      <p className="no-scenes-hint">
        <FormattedMessage
          id="search_filter.no_scenes_yet_hint"
          values={{
            tasks: (
              <Link to="/settings?tab=tasks">
                <FormattedMessage id="search_filter.settings_tasks" />
              </Link>
            ),
          }}
        />
      </p>
    )}
  </div>
);
