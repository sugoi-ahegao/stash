import React, { useState } from "react";
import { Button } from "react-bootstrap";
import cx from "classnames";
import { useIntl } from "react-intl";
import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { useSceneAddView } from "src/core/StashService";
import { viewedToday } from "src/core/viewed";
import { useToast } from "src/hooks/Toast";
import { PatchComponent } from "src/patch";
import { Icon } from "../Shared/Icon";

// One-click "I've seen this" for the card grid: stamps a VIEW at the current
// time. Sits with the count buttons at the foot of the card.
//
// A view is not a play - it never touches play count or play duration.
//
// The eye is open while the scene's last view falls on today and shut
// otherwise. That needs no stored state: the mutation writes last_viewed_at
// into the cache, so the button reads its own result back and stays open
// until midnight. It opens on click rather than on the reply, which can take
// a while from a busy server, and shuts again if the request fails. While
// open, clicking it does nothing.
export const MarkViewedButton: React.FC<{
  sceneID: string;
  lastViewedAt?: string | null;
  disabled?: boolean;
}> = PatchComponent(
  "SceneCard.MarkViewedButton",
  ({ sceneID, lastViewedAt, disabled }) => {
    const intl = useIntl();
    const Toast = useToast();

    // no list eviction - refetching the list would replace the grid with a
    // spinner and drop the card being clicked. See useSceneAddView.
    const [addView] = useSceneAddView();

    // clicked, and the server hasn't answered yet
    const [pending, setPending] = useState(false);

    const viewedTodayNow = pending || viewedToday(lastViewedAt);

    async function onClick(event: React.MouseEvent) {
      // the card behind the button navigates and selects
      event.preventDefault();
      event.stopPropagation();

      // a second view the same day would only pad the history
      if (disabled || viewedTodayNow) return;

      setPending(true);
      try {
        await addView({ variables: { id: sceneID } });
      } catch (e) {
        Toast.error(e);
      } finally {
        setPending(false);
      }
    }

    return (
      <Button
        variant="secondary"
        className={cx("minimal", "mark-viewed-button", {
          "viewed-today": viewedTodayNow,
        })}
        title={intl.formatMessage({
          id: viewedTodayNow ? "actions.viewed_today" : "actions.add_view",
        })}
        onClick={onClick}
      >
        <Icon icon={viewedTodayNow ? faEye : faEyeSlash} />
      </Button>
    );
  }
);
