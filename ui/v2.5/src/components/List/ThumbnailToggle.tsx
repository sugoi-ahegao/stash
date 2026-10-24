import React, { useCallback } from "react";
import { Button } from "react-bootstrap";
import { useIntl } from "react-intl";
import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { useInterfaceLocalForage } from "src/hooks/LocalForage";
import { DisplayMode } from "src/models/list-filter/types";
import { Icon } from "../Shared/Icon";
import { View } from "./views";

// Scene lists can hide their card thumbnails, leaving the text. Hidden is the
// default. The choice is remembered per list in this browser (the interface
// local forage, beside the sidebar's), so the landing page and the scenes
// page keep their own.
export function useShowThumbnails(
  view: View | undefined
): [boolean, (show: boolean) => void] {
  const [{ data }, setData] = useInterfaceLocalForage();
  const show = (view && data?.viewConfig?.[view]?.showThumbnails) ?? false;

  const setShow = useCallback(
    (v: boolean) => {
      if (!view) return;
      setData((prev) => ({
        ...prev,
        viewConfig: {
          ...prev.viewConfig,
          [view]: { ...prev.viewConfig?.[view], showThumbnails: v },
        },
      }));
    },
    [view, setData]
  );

  return [show, setShow];
}

export interface IThumbnailToggleProps {
  showThumbnails?: boolean;
  onSetShowThumbnails?: (v: boolean) => void;
}

// The toolbar button, shown in the display modes that have thumbnails to hide.
export const ThumbnailToggle: React.FC<
  IThumbnailToggleProps & { displayMode: DisplayMode }
> = ({ showThumbnails, onSetShowThumbnails, displayMode }) => {
  const intl = useIntl();

  if (!onSetShowThumbnails || showThumbnails === undefined) return null;
  if (
    displayMode !== DisplayMode.Grid &&
    displayMode !== DisplayMode.Collections
  ) {
    return null;
  }

  return (
    <Button
      className="thumbnail-toggle"
      variant="secondary"
      active={!showThumbnails}
      title={intl.formatMessage({
        id: showThumbnails
          ? "actions.hide_thumbnails"
          : "actions.show_thumbnails",
      })}
      onClick={() => onSetShowThumbnails(!showThumbnails)}
    >
      <Icon icon={showThumbnails ? faEye : faEyeSlash} />
    </Button>
  );
};
