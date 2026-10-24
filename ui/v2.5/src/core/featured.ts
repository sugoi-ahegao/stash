// The featured group feeds the landing page carousel. Which group it is comes
// from the featuredGroupId setting (src/core/forkConfig.ts), which the server
// reads too: when a scene joins or leaves the group it stamps or clears the
// custom fields below and queues generation for it. See
// internal/api/scene_featured.go, whose field names must match these.

// custom field stamped on a scene when it's added to the featured
// group, so the carousel (or anything else) can see when that happened.
export const FEATURED_ADDED_AT_FIELD = "featured_added_at";

// custom field stamped on a scene when its carousel slide is unlocked
// (the hold-to-reveal completes). Null/missing means still locked.
export const FEATURE_UNLOCKED_AT_FIELD = "feature_unlocked_at";

interface IFeaturedGroupable {
  groups: { group: { id: string }; scene_index?: number | null }[];
}

export function isFeatured(
  o: IFeaturedGroupable,
  featuredGroupId: string | undefined
) {
  return (
    !!featuredGroupId && o.groups.some((g) => g.group.id === featuredGroupId)
  );
}

// The group list to send in a scene update, with the featured group added or
// removed. The other groups are passed through untouched, scene indexes and
// all - a groups update replaces the whole list.
export function withFeatured(
  o: IFeaturedGroupable,
  featured: boolean,
  featuredGroupId: string
) {
  const groups = o.groups.map((g) => ({
    group_id: g.group.id,
    scene_index: g.scene_index,
  }));

  if (!featured) {
    return groups.filter((g) => g.group_id !== featuredGroupId);
  }

  return groups.some((g) => g.group_id === featuredGroupId)
    ? groups
    : [...groups, { group_id: featuredGroupId, scene_index: null }];
}
