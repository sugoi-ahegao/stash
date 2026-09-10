// hardcoded to the "${featured}" group in this library - there's no
// config setting yet to choose the featured group.
//
// The server stamps the custom fields below and kicks off generation when a
// scene joins or leaves this group - keep these in sync with the constants in
// internal/api/scene_featured.go.
export const FEATURED_GROUP_ID = "25";

// custom field stamped on a scene when it's added to the featured
// group, so the carousel (or anything else) can see when that happened.
export const FEATURED_ADDED_AT_FIELD = "featured_added_at";

// custom field stamped on a scene when its carousel slide is unlocked
// (the hold-to-reveal completes). Null/missing means still locked.
export const FEATURE_UNLOCKED_AT_FIELD = "feature_unlocked_at";

interface IFeaturedGroupable {
  groups: { group: { id: string }; scene_index?: number | null }[];
}

export function isFeatured(o: IFeaturedGroupable) {
  return o.groups.some((g) => g.group.id === FEATURED_GROUP_ID);
}

// The group list to send in a scene update, with the featured group added or
// removed. The other groups are passed through untouched, scene indexes and
// all - a groups update replaces the whole list.
export function withFeatured(o: IFeaturedGroupable, featured: boolean) {
  const groups = o.groups.map((g) => ({
    group_id: g.group.id,
    scene_index: g.scene_index,
  }));

  if (!featured) {
    return groups.filter((g) => g.group_id !== FEATURED_GROUP_ID);
  }

  return groups.some((g) => g.group_id === FEATURED_GROUP_ID)
    ? groups
    : [...groups, { group_id: FEATURED_GROUP_ID, scene_index: null }];
}
