// hardcoded to the "${featured}" group in this library - there's no
// config setting yet to choose the featured group.
export const FEATURED_GROUP_ID = "25";

// custom field stamped on a scene when it's added to the featured
// group, so the carousel (or anything else) can see when that happened.
export const FEATURED_ADDED_AT_FIELD = "featured_added_at";

// custom field stamped on a scene when its carousel slide is unlocked
// (the hold-to-reveal completes). Null/missing means still locked.
export const FEATURE_UNLOCKED_AT_FIELD = "feature_unlocked_at";
