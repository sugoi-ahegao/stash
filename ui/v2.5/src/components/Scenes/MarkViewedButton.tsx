import React from "react";
import { Button } from "react-bootstrap";
import cx from "classnames";
import { useIntl } from "react-intl";
import { faEye } from "@fortawesome/free-solid-svg-icons";
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
// It lights up while the scene's last view falls on today, which needs no
// local state: the mutation writes last_viewed_at into the cache, so the
// button reads its own result back and stays lit until midnight.
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

    const viewedTodayNow = viewedToday(lastViewedAt);

    async function onClick(event: React.MouseEvent) {
      // the card behind the button navigates and selects
      event.preventDefault();
      event.stopPropagation();

      if (disabled) return;

      try {
        await addView({ variables: { id: sceneID } });
      } catch (e) {
        Toast.error(e);
      }
    }

    return (
      <Button
        variant="secondary"
        className={cx("minimal", "mark-viewed-button", {
          "viewed-today": viewedTodayNow,
        })}
        title={intl.formatMessage({ id: "actions.add_view" })}
        onClick={onClick}
      >
        <Icon icon={faEye} />
      </Button>
    );
  }
);
