import React, { useCallback, useContext, useEffect, useRef } from "react";
import { useSceneAddView } from "src/core/StashService";
import { useForkConfig, ViewOnHoverPage } from "src/core/forkConfig";

// The ways the UI records that a scene was seen, besides the mark-viewed
// button (MarkViewedButton.tsx):
//
//   - opening the scene page: useViewOnOpen
//   - resting the cursor on a scene card, on the pages whose setting turns it
//     on: ViewOnHover around the page, useDwellView in the card
//
// A view is not a play: it never touches play count, play duration or resume
// time. See docs/decisions/0004-views-apart-from-plays.md. Turning off "track
// activity" in the player settings turns all of these off.

// How long the cursor has to stay on a card before the view is recorded. Long
// enough that sweeping the cursor across the grid on the way somewhere else
// doesn't rack up views.
export const hoverViewDelay = 3000;

// Opening the scene page records a view. Guarded by a ref so StrictMode's
// double-invoke records it once.
export function useViewOnOpen(sceneID: string) {
  const { recordViews } = useForkConfig();
  const [addView] = useSceneAddView();
  const viewedSceneID = useRef<string>();

  useEffect(() => {
    if (!recordViews) return;
    if (viewedSceneID.current === sceneID) return;

    viewedSceneID.current = sceneID;
    addView({ variables: { id: sceneID } });
  }, [sceneID, addView, recordViews]);
}

// Which page the scene cards below it are on, for the per-page "view on hover"
// settings. Cards outside any ViewOnHover - the scene page's queue, a
// performer's scenes - never record views by hovering.
const ViewOnHoverContext = React.createContext<ViewOnHoverPage | undefined>(
  undefined
);

export const ViewOnHover: React.FC<{ page: ViewOnHoverPage }> = ({
  page,
  children,
}) => (
  <ViewOnHoverContext.Provider value={page}>
    {children}
  </ViewOnHoverContext.Provider>
);

interface IHoverHandlers {
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

// Resting the cursor on a card records a view, once per card: leaving and
// coming back doesn't view it again. Returns no handlers where it's off.
export function useDwellView(sceneID: string): IHoverHandlers {
  const page = useContext(ViewOnHoverContext);
  const { viewOnHover } = useForkConfig();
  const enabled = page !== undefined && viewOnHover[page];

  // no list eviction: refetching the scene list would replace the grid with a
  // spinner and drop the card the cursor is sitting on
  const [addView] = useSceneAddView();
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const viewed = useRef(false);

  const onMouseEnter = useCallback(() => {
    if (viewed.current) return;

    timer.current = setTimeout(() => {
      viewed.current = true;
      addView({ variables: { id: sceneID } });
    }, hoverViewDelay);
  }, [addView, sceneID]);

  const onMouseLeave = useCallback(() => clearTimeout(timer.current), []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return enabled ? { onMouseEnter, onMouseLeave } : {};
}
