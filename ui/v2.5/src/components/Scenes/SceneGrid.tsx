// fork: the scene list's grid view as a CSS grid (scene-grid.scss), in place
// of upstream's SceneCardGrid, which works the cards' width out in JS from
// the container's measured width. That measurement comes after the first
// paint (and 50ms debounced), so a grid newly on screen lays its cards out at
// a default width first and then snaps to the real one. Here the zoom level
// is a number of cards per row, the same on any screen (fewer on tablets and
// phones), and the browser sizes the cards itself, before anything is drawn.
import React from "react";
import * as GQL from "src/core/generated-graphql";
import { SceneQueue } from "src/models/sceneQueue";
import { SceneCard } from "./SceneCard";

// cards per row at each zoom level, smallest to biggest
const perRow = [6, 5, 4, 3, 2, 1];

interface ISceneGrid {
  scenes: GQL.SlimSceneDataFragment[];
  queue?: SceneQueue;
  selectedIds: Set<string>;
  zoomIndex: number;
  onSelectChange: (id: string, selected: boolean, shiftKey: boolean) => void;
  fromGroupId?: string;
}

export const SceneGrid: React.FC<ISceneGrid> = ({
  scenes,
  queue,
  selectedIds,
  zoomIndex,
  onSelectChange,
  fromGroupId,
}) => {
  const cards = perRow[zoomIndex] ?? perRow[1];

  return (
    <div
      className="scene-grid"
      style={{ "--scene-cards": cards } as React.CSSProperties}
    >
      {scenes.map((scene, index) => (
        <SceneCard
          key={scene.id}
          scene={scene}
          queue={queue}
          index={index}
          zoomIndex={zoomIndex}
          selecting={selectedIds.size > 0}
          selected={selectedIds.has(scene.id)}
          onSelectedChanged={(selected: boolean, shiftKey: boolean) =>
            onSelectChange(scene.id, selected, shiftKey)
          }
          fromGroupId={fromGroupId}
        />
      ))}
    </div>
  );
};
