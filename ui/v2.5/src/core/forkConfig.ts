import { useConfigurationContext } from "src/hooks/Config";
import { IUIConfig } from "./config";

// The settings that point the fork's features at things in this library, and
// turn its hover behaviour on or off. They live in the UI config (Settings >
// Interface > This library, see ForkSettings.tsx), so the server can read them
// too: internal/api/scene_featured.go reads featuredGroupId.
//
// An ID that isn't set turns its feature off: no carousel without a featured
// group, no golden cards without a golden tag.
export interface IForkConfig {
  // the group whose scenes the landing page carousel shows
  featuredGroupId?: string;
  // the tag that makes a scene golden
  goldenTagId?: string;
  // whether the UI records views at all: off when the player's "track
  // activity" setting is
  recordViews: boolean;
  // whether resting the cursor on a scene card records a view, per page.
  // Never on without recordViews.
  viewOnHover: Record<ViewOnHoverPage, boolean>;
}

export type ViewOnHoverPage = "landing" | "scenes";

export function forkConfig(ui: IUIConfig | undefined): IForkConfig {
  const recordViews = ui?.trackActivity ?? true;

  return {
    featuredGroupId: ui?.featuredGroupId || undefined,
    goldenTagId: ui?.goldenTagId || undefined,
    recordViews,
    viewOnHover: {
      landing: recordViews && (ui?.viewOnHoverLanding ?? true),
      scenes: recordViews && (ui?.viewOnHoverScenes ?? false),
    },
  };
}

export function useForkConfig() {
  const { configuration } = useConfigurationContext();
  return forkConfig(configuration?.ui);
}
