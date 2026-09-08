import React from "react";

// The decorative layers that make a golden scene card burn. They are all
// absolutely positioned and pointer-events: none, and they place themselves
// front-to-back with z-index rather than by DOM order, so the whole set can be
// handed to GridCard as one child. See styles.scss.
//
// The flames are empty on purpose: each is a ten-frame sprite strip that the
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
