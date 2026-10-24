import React, { useCallback, useEffect, useRef, useState } from "react";
import { useForkConfig } from "src/core/forkConfig";
import { goldenActivationDelay, isGolden } from "src/core/golden";

// A golden scene's card burns: SceneFire's layers, styled in golden-card.scss,
// switched on by the "golden" class and brought fully alight by "awake".

// The decorative layers that make a golden scene card burn. They are all
// absolutely positioned and pointer-events: none, and they place themselves
// front-to-back with z-index rather than by DOM order, so the whole set can be
// handed to GridCard as one child.
//
// The flames are empty on purpose: each is a ten-frame sprite strip
// (flames.png, built by ui/v2.5/scripts/build_flame_sprite.py) that the
// stylesheet steps through. Where they stand, how big they are and which way
// they face are all styling.
export const SceneFire: React.FC = () => (
  <>
    <div className="fire-surface" />
    <div className="fire-flames">
      <span className="fire-tongue" />
      <span className="fire-tongue" />
    </div>
    <div className="fire-embers">
      <span className="fire-ember" />
      <span className="fire-ember" />
      <span className="fire-ember" />
      <span className="fire-ember" />
      <span className="fire-ember" />
      <span className="fire-ember" />
      <span className="fire-ember" />
    </div>
  </>
);

interface IGoldenCard {
  className?: string;
  decorations?: JSX.Element;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

// What a scene card needs to be golden: its class, its fire, and the hover
// handlers that wake it. Empty for a scene that isn't golden.
//
// A golden card wakes up after a deliberate hover and then stays awake - the
// flames and the rim keep burning once they've been earned, rather than dying
// with the cursor. Hence a timer here instead of a CSS hover delay.
export function useGoldenCard(scene: { tags: { id: string }[] }): IGoldenCard {
  const { goldenTagId } = useForkConfig();
  const golden = isGolden(scene, goldenTagId);

  const [awake, setAwake] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const onMouseEnter = useCallback(() => {
    if (awake) return;
    timer.current = setTimeout(() => setAwake(true), goldenActivationDelay);
  }, [awake]);

  const onMouseLeave = useCallback(() => clearTimeout(timer.current), []);

  useEffect(() => () => clearTimeout(timer.current), []);

  if (!golden) return {};

  return {
    className: awake ? "golden awake" : "golden",
    decorations: <SceneFire />,
    onMouseEnter,
    onMouseLeave,
  };
}
