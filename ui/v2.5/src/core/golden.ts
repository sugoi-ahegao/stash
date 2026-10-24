// The golden tag marks a scene as a favourite of favourites: golden scenes get
// a distinct treatment on their cards (SceneFire, useGoldenCard).
//
// The tag is matched by ID rather than by name, so renaming it - or having
// another tag that happens to be called "Golden" - can't silently turn the
// treatment on or off. Which tag it is comes from the goldenTagId setting
// (src/core/forkConfig.ts); with none set, no scene is golden.

interface IGoldenTaggable {
  tags: { id: string }[];
}

export function isGolden(o: IGoldenTaggable, goldenTagId: string | undefined) {
  return !!goldenTagId && o.tags.some((t) => t.id === goldenTagId);
}

// The tag ids to send in a scene update, with the golden tag added or removed.
export function withGolden(
  o: IGoldenTaggable,
  golden: boolean,
  goldenTagId: string
) {
  const tagIDs = o.tags.map((t) => t.id);

  if (!golden) {
    return tagIDs.filter((id) => id !== goldenTagId);
  }

  return tagIDs.includes(goldenTagId) ? tagIDs : [...tagIDs, goldenTagId];
}

// How long a golden card must be hovered before its treatment wakes up. Kept
// here rather than in the stylesheet because the timer is the component's, and
// the CSS picks up from the moment the class lands.
export const goldenActivationDelay = 1000;
