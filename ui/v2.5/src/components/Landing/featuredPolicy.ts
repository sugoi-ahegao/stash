import { FEATURE_UNLOCKED_AT_FIELD } from "src/core/featured";

// --- tunables - change these to adjust how the featured carousel behaves ---

// how many slides you're allowed to hold-to-reveal per calendar day, and
// therefore how many LOCKED slides the carousel shows at once - there's no
// point showing a slide you can't open, so the carousel carries only as
// many locked slides as you have unlocks left. Spend the budget and the
// locked slides are gone until midnight local time; already-unlocked ones
// stay for UNLOCKED_VISIBLE_DAYS.
//
// Counted library-wide from feature_unlocked_at, so a scene that was
// unlocked and has since left the group still counts against the day - see
// the unlock budget notes in docs/codebase/07-this-fork.md. Raise this
// while testing; put it back afterwards.
export const MAX_UNLOCKS_PER_DAY = 3;

// how long an unlocked slide keeps its place in the carousel, in days.
// DISPLAY ONLY - the scene stays in the featured group, it just stops
// taking one of the FEATURED_COUNT slots. Lower this to cycle the carousel
// faster. Together with MAX_UNLOCKS_PER_DAY this sets the carousel's
// steady-state size: roughly MAX_UNLOCKS_PER_DAY * UNLOCKED_VISIBLE_DAYS
// unlocked slides, plus whatever is left of today's unlock budget.
export const UNLOCKED_VISIBLE_DAYS = 2;

// how long an unlocked-but-still-unrated scene stays in the featured group,
// in days. This one MUTATES: the sweep drops the scene from the group and
// deletes both custom fields. Rating a scene removes it immediately
// regardless, so this is only the deadline for ones you never rated.
//
// Keep this >= UNLOCKED_VISIBLE_DAYS. Setting it lower means scenes are
// removed outright before the hide window is ever reached, which makes
// UNLOCKED_VISIBLE_DAYS do nothing.
export const UNRATED_EXPIRY_DAYS = 7;

// -----------------------------------------------------------------------

export function startOfToday(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// how many unlocks are left today. Also the number of locked slides the
// carousel is willing to show.
export function remainingUnlocks(unlockedToday: number): number {
  return Math.max(0, MAX_UNLOCKS_PER_DAY - unlockedToday);
}

export function canUnlockMore(unlockedToday: number): boolean {
  return remainingUnlocks(unlockedToday) > 0;
}

export interface FeaturedPolicyScene {
  rating100?: number | null;
  custom_fields: { [key: string]: unknown };
}

// days elapsed since an ISO timestamp custom field, or undefined if the
// field is missing or unparseable - callers treat that as "no opinion"
// rather than as zero.
function daysSince(value: unknown, now: Date): number | undefined {
  if (typeof value !== "string") return undefined;

  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return undefined;

  return (now.getTime() - then) / (24 * 60 * 60 * 1000);
}

// a slide that was unlocked more than UNLOCKED_VISIBLE_DAYS ago has been
// seen and stops taking up a carousel slot. This is a *display* rule, not a
// removal rule - the scene stays in the featured group until one of the
// removal rules below catches it, so its rating still gets a chance to
// arrive. Move this into removalRules to have it drop out of the group too.
export function isUnlockExpired(
  scene: FeaturedPolicyScene,
  now: Date = new Date()
): boolean {
  const days = daysSince(scene.custom_fields[FEATURE_UNLOCKED_AT_FIELD], now);
  return days !== undefined && days > UNLOCKED_VISIBLE_DAYS;
}

type RemovalRule = (scene: FeaturedPolicyScene, now: Date) => boolean;

// a rated scene has served its purpose in the carousel.
const ratedRule: RemovalRule = (scene) => scene.rating100 != null;

// an unlocked-but-still-unrated scene has had its chance; move on.
const staleUnratedRule: RemovalRule = (scene, now) => {
  if (scene.rating100 != null) return false;

  const days = daysSince(scene.custom_fields[FEATURE_UNLOCKED_AT_FIELD], now);
  return days !== undefined && days > UNRATED_EXPIRY_DAYS;
};

// add future removal rules here - a scene is removed from the featured
// group as soon as any one of these matches.
const removalRules: RemovalRule[] = [ratedRule, staleUnratedRule];

export function shouldRemoveFromFeatured(
  scene: FeaturedPolicyScene,
  now: Date = new Date()
): boolean {
  return removalRules.some((rule) => rule(scene, now));
}
