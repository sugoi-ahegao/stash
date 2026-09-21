import React, { useMemo } from "react";
import { useFindScenes } from "src/core/StashService";
import { SceneCard } from "./SceneCard";
import { SceneQueue } from "src/models/sceneQueue";
import { ListFilterModel } from "src/models/list-filter/filter";
import { PatchComponent } from "src/patch";
import { FilteredRecommendationRow } from "../FrontPage/FilteredRecommendationRow";
import { View } from "../List/views";

interface IProps {
  isTouch: boolean;
  filter: ListFilterModel;
  header: string;
  // the list these rows stand in for, when they are standing in for one. The
  // front page's rows belong to no list and leave it unset - it is what tells
  // a card it is on the landing page, where dwelling on it records a view.
  view?: View;
}

export const SceneRecommendationRow: React.FC<IProps> = PatchComponent(
  "SceneRecommendationRow",
  (props) => {
    const result = useFindScenes(props.filter);
    const count = result.data?.findScenes.count ?? 0;

    const queue = useMemo(() => {
      return SceneQueue.fromListFilterModel(props.filter);
    }, [props.filter]);

    return (
      <FilteredRecommendationRow
        className="scene-recommendations"
        heading={props.header}
        url={`/scenes?${props.filter.makeQueryParameters()}`}
        count={count}
        loading={result.loading}
        isTouch={props.isTouch}
        filter={props.filter}
      >
        {result.loading
          ? [...Array(props.filter.itemsPerPage)].map((i) => (
              <div key={`_${i}`} className="scene-skeleton skeleton-card"></div>
            ))
          : result.data?.findScenes.scenes.map((scene, index) => (
              <SceneCard
                key={scene.id}
                scene={scene}
                queue={queue}
                index={index}
                zoomIndex={1}
                view={props.view}
              />
            ))}
      </FilteredRecommendationRow>
    );
  }
);
