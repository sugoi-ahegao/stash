import { FEATURE_UNLOCKED_AT_FIELD } from "./featuredGroup";

// --- tunables - change these to adjust how the featured carousel behaves ---
export const MAX_UNLOCKS_PER_DAY = 3;
export const UNRATED_EXPIRY_DAYS = 7;
// -----------------------------------------------------------------------

export function startOfToday(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function canUnlockMore(unlockedToday: number): boolean {
  return unlockedToday < MAX_UNLOCKS_PER_DAY;
}

export interface FeaturedPolicyScene {
  rating100?: number | null;
  custom_fields: { [key: string]: unknown };
}

type RemovalRule = (scene: FeaturedPolicyScene, now: Date) => boolean;

// a rated scene has served its purpose in the carousel.
const ratedRule: RemovalRule = (scene) => scene.rating100 != null;

// an unlocked-but-still-unrated scene has had its chance; move on.
const staleUnratedRule: RemovalRule = (scene, now) => {
  if (scene.rating100 != null) return false;

  const unlockedAt = scene.custom_fields[FEATURE_UNLOCKED_AT_FIELD];
  if (typeof unlockedAt !== "string") return false;

  const elapsedDays =
    (now.getTime() - new Date(unlockedAt).getTime()) / (24 * 60 * 60 * 1000);
  return elapsedDays > UNRATED_EXPIRY_DAYS;
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
