import React from "react";

// The decorative layers that make a golden scene card burn. They are all
// absolutely positioned and pointer-events: none, and they place themselves
// front-to-back with z-index rather than by DOM order, so the whole set can be
// handed to GridCard as one child.
//
// The flame and ember layers blend with `screen`, so their near-black
// background drops out and only the light they add survives - fire over the
// preview rather than fire instead of it. See styles.scss.
export const SceneFire: React.FC = () => (
  <>
    <div className="fire-surface" />
    <div className="fire-flames">
      <span className="fire-tongue" />
      <span className="fire-tongue" />
      <span className="fire-tongue" />
      <span className="fire-tongue" />
      <span className="fire-tongue" />
      <span className="fire-tongue" />
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
