import React, { useEffect, useRef, useState } from "react";
import Mousetrap from "mousetrap";
import { Button, Overlay, Popover } from "react-bootstrap";
import { FormattedMessage, useIntl } from "react-intl";
import {
  faChevronDown,
  faEye,
  faEyeSlash,
  faList,
  faSquare,
  faTags,
  faThLarge,
} from "@fortawesome/free-solid-svg-icons";
import cx from "classnames";
import { DisplayMode } from "src/models/list-filter/types";
import { Icon } from "../Shared/Icon";
import { ZoomSelect } from "./ZoomSlider";
import { IThumbnailToggleProps } from "./ThumbnailToggle";

// fork: one toolbar button for everything about how a list is shown — the
// display mode, the card size, the thumbnail toggle and the page size — in
// place of upstream's row of mode buttons, slider and eye (ListViewButtonGroup)
// and its page size select (PageSizeSelector).

interface IDisplayOptionsProps extends IThumbnailToggleProps {
  zoomIndex?: number;
  onSetZoom?: (zoomIndex: number) => void;
  displayMode: DisplayMode;
  onSetDisplayMode: (m: DisplayMode) => void;
  displayModeOptions: DisplayMode[];
  pageSize?: number;
  onSetPageSize?: (pageSize: number) => void;
}

const PAGE_SIZES = [20, 40, 60, 120, 250, 500, 1000];

// The presets and Custom as one 4 × 2 grid of buttons, as tall as the other
// controls. Custom shows the size when it isn't a preset; clicked, it turns
// into a field in place that applies on Enter or blur (Escape cancels).
const PageSizeOptions: React.FC<{
  pageSize: number;
  onSetPageSize: (pageSize: number) => void;
}> = ({ pageSize, onSetPageSize }) => {
  const intl = useIntl();
  const isPreset = PAGE_SIZES.includes(pageSize);
  const [editing, setEditing] = useState(false);
  const [custom, setCustom] = useState("");

  function startEditing() {
    setCustom(isPreset ? "" : String(pageSize));
    setEditing(true);
  }

  function applyCustom() {
    setEditing(false);
    const n = Number.parseInt(custom, 10);
    if (!Number.isNaN(n) && n > 0 && n !== pageSize) onSetPageSize(n);
  }

  return (
    <div className="display-options-segmented page-sizes" role="radiogroup">
      {PAGE_SIZES.map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={pageSize === n}
          className={cx({ active: pageSize === n })}
          onClick={() => onSetPageSize(n)}
        >
          {n}
        </button>
      ))}
      {editing ? (
        <input
          autoFocus
          type="number"
          min={1}
          className="page-size-custom-input"
          aria-label={intl.formatMessage({ id: "custom" })}
          value={custom}
          onChange={(e) => setCustom(e.currentTarget.value)}
          onBlur={applyCustom}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              applyCustom();
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setEditing(false);
            }
          }}
          onWheel={(e) => e.currentTarget.blur()}
        />
      ) : (
        <button
          type="button"
          role="radio"
          aria-checked={!isPreset}
          className={cx("page-size-custom", { active: !isPreset })}
          onClick={startEditing}
        >
          {isPreset ? <FormattedMessage id="custom" /> : pageSize}
        </button>
      )}
    </div>
  );
};

const modes: Record<
  DisplayMode,
  { icon: typeof faThLarge; label: string; key: string }
> = {
  [DisplayMode.Grid]: { icon: faThLarge, label: "display_mode.grid", key: "g" },
  [DisplayMode.List]: { icon: faList, label: "display_mode.list", key: "l" },
  [DisplayMode.Wall]: { icon: faSquare, label: "display_mode.wall", key: "w" },
  [DisplayMode.Tagger]: {
    icon: faTags,
    label: "display_mode.tagger",
    key: "t",
  },
};

export const DisplayOptions: React.FC<IDisplayOptionsProps> = ({
  zoomIndex,
  onSetZoom,
  showThumbnails,
  onSetShowThumbnails,
  displayMode,
  onSetDisplayMode,
  displayModeOptions,
  pageSize,
  onSetPageSize,
}) => {
  const intl = useIntl();
  const target = useRef<HTMLButtonElement>(null);
  const [show, setShow] = useState(false);

  // v g / v l / v w / v t switch modes, as upstream's ListViewOptions did.
  useEffect(() => {
    for (const m of displayModeOptions) {
      Mousetrap.bind(`v ${modes[m].key}`, () => onSetDisplayMode(m));
    }
    return () => {
      for (const m of displayModeOptions) {
        Mousetrap.unbind(`v ${modes[m].key}`);
      }
    };
  });

  const showModes = displayModeOptions.length > 1;
  const showZoom =
    !!onSetZoom &&
    zoomIndex !== undefined &&
    (displayMode === DisplayMode.Grid || displayMode === DisplayMode.Wall);
  const showThumbs =
    !!onSetShowThumbnails &&
    showThumbnails !== undefined &&
    displayMode === DisplayMode.Grid;

  const showPageSize = !!onSetPageSize && pageSize !== undefined;

  if (!showModes && !showZoom && !showThumbs && !showPageSize) return null;

  const current = intl.formatMessage({ id: modes[displayMode].label });

  return (
    <>
      <Button
        ref={target}
        variant="secondary"
        className={cx("display-options-button", { active: show })}
        title={intl.formatMessage(
          { id: "display_mode.label_current" },
          { current }
        )}
        onClick={() => setShow(!show)}
      >
        <Icon icon={modes[displayMode].icon} />
        <Icon size="xs" icon={faChevronDown} />
      </Button>
      <Overlay
        target={target.current}
        show={show}
        placement="bottom-end"
        rootClose
        onHide={() => setShow(false)}
      >
        <Popover id="display-options-popover" className="display-options">
          <Popover.Content>
            {showModes && (
              <section>
                <h6>
                  <FormattedMessage id="display_mode.view" />
                </h6>
                <div className="display-options-segmented" role="radiogroup">
                  {displayModeOptions.map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={displayMode === m}
                      className={cx({ active: displayMode === m })}
                      title={`${intl.formatMessage({
                        id: modes[m].label,
                      })} (v ${modes[m].key})`}
                      onClick={() => onSetDisplayMode(m)}
                    >
                      <Icon icon={modes[m].icon} />
                      <span>
                        <FormattedMessage id={modes[m].label} />
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {showZoom && (
              <section>
                <h6>
                  <FormattedMessage id="display_mode.card_size" />
                </h6>
                <div className="display-options-zoom">
                  <Icon icon={faThLarge} className="zoom-small" />
                  <ZoomSelect
                    zoomIndex={zoomIndex!}
                    onChangeZoom={onSetZoom!}
                  />
                  <Icon icon={faSquare} className="zoom-large" />
                </div>
              </section>
            )}

            {showThumbs && (
              <section>
                <h6>
                  <FormattedMessage id="display_mode.thumbnails" />
                </h6>
                <div
                  className="display-options-segmented compact"
                  role="radiogroup"
                >
                  {[true, false].map((v) => (
                    <button
                      key={String(v)}
                      type="button"
                      role="radio"
                      aria-checked={showThumbnails === v}
                      className={cx({ active: showThumbnails === v })}
                      onClick={() => onSetShowThumbnails!(v)}
                    >
                      <Icon icon={v ? faEye : faEyeSlash} />
                      <span>
                        <FormattedMessage
                          id={v ? "actions.show" : "actions.hide"}
                        />
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}
            {showPageSize && (
              <section>
                <h6>
                  <FormattedMessage id="display_mode.per_page" />
                </h6>
                <PageSizeOptions
                  pageSize={pageSize!}
                  onSetPageSize={onSetPageSize!}
                />
              </section>
            )}
          </Popover.Content>
        </Popover>
      </Overlay>
    </>
  );
};
