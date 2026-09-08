// The "Golden" tag marks a scene as a favourite of favourites: golden scenes
// get a distinct treatment on their cards.
//
// The tag is matched by ID rather than by name so that renaming the tag - or
// having another tag that happens to be called "Golden" - can't silently turn
// the treatment on or off. Point this at the ID of the Golden tag in your
// stash instance.
export const goldenTagID = "1414";

interface IGoldenTaggable {
  tags: { id: string }[];
}

export function isGolden(o: IGoldenTaggable) {
  return o.tags.some((t) => t.id === goldenTagID);
}

export function withGolden(o: IGoldenTaggable, golden: boolean) {
  const tagIDs = o.tags.map((t) => t.id);

  if (!golden) {
    return tagIDs.filter((id) => id !== goldenTagID);
  }

  return tagIDs.includes(goldenTagID) ? tagIDs : [...tagIDs, goldenTagID];
}

// How long a golden card must be hovered before its treatment wakes up. Kept
// here rather than in the stylesheet because the timer is the component's, and
// the CSS picks up from the moment the class lands.
export const goldenActivationDelay = 1000;
