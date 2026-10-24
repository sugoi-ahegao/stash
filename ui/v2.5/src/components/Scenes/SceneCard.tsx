import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button, ButtonGroup, OverlayTrigger, Tooltip } from "react-bootstrap";
import { useHistory } from "react-router-dom";
import cx from "classnames";
import * as GQL from "src/core/generated-graphql";
import { Icon } from "../Shared/Icon";
import { GalleryLink, TagLink, SceneMarkerLink } from "../Shared/TagLink";
import { HoverPopover } from "../Shared/HoverPopover";
import { TruncatedText } from "../Shared/TruncatedText";
import NavUtils from "src/utils/navigation";
import TextUtils from "src/utils/text";
import { SceneQueue } from "src/models/sceneQueue";
import { useConfigurationContext } from "src/hooks/Config";
import { PerformerPopoverButton } from "../Shared/PerformerPopoverButton";
import { GridCard } from "../Shared/GridCard/GridCard";
import { RatingBanner } from "../Shared/RatingBanner";
import { FormattedMessage, useIntl } from "react-intl";
import {
  faBox,
  faCopy,
  faEye,
  faFilm,
  faImages,
  faMapMarkerAlt,
  faTag,
} from "@fortawesome/free-solid-svg-icons";
import { objectPath, objectTitle } from "src/core/files";
import { PreviewScrubber } from "./PreviewScrubber";
import { PatchComponent } from "src/patch";
import { StudioOverlay } from "../Shared/GridCard/StudioOverlay";
import { GroupTag } from "../Groups/GroupTag";
import { FileSize } from "../Shared/FileSize";
import { OCounterButton } from "../Shared/CountButton";
import { defaultPreviewVolume } from "src/core/config";
import { goldenActivationDelay, isGolden } from "src/core/golden";
import { hoverViewDelay } from "src/core/hoverView";
import { SceneFire } from "./SceneFire";
import { View } from "../List/views";
import { useSceneAddView } from "src/core/StashService";
import { useToast } from "src/hooks/Toast";
import { viewedToday } from "src/core/viewed";

interface IScenePreviewProps {
  isPortrait: boolean;
  image?: string;
  video?: string;
  soundActive: boolean;
  volume?: number;
  vttPath?: string;
  onScrubberClick?: (timestamp: number) => void;
  disabled?: boolean;
}

export const ScenePreview: React.FC<IScenePreviewProps> = React.memo(
  ({
    image,
    video,
    isPortrait,
    soundActive,
    vttPath,
    onScrubberClick,
    disabled,
    volume,
  }) => {
    const videoEl = useRef<HTMLVideoElement>(null);
    // every scene is given a preview URL, generated or not, so whether one
    // exists is only known once the video loads or fails
    const [hasPreview, setHasPreview] = useState(false);

    useEffect(() => {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.intersectionRatio > 0)
            // Catch is necessary due to DOMException if user hovers before clicking on page
            videoEl.current?.play()?.catch(() => {});
          else videoEl.current?.pause();
        });
      });

      if (videoEl.current) observer.observe(videoEl.current);

      return () => observer.disconnect();
    }, []);

    useEffect(() => {
      if (videoEl?.current?.volume)
        videoEl.current.volume = soundActive ? (volume ?? 0) / 100 : 0;
    }, [volume, soundActive]);

    return (
      <div
        className={cx("scene-card-preview", {
          portrait: isPortrait,
          "has-preview": hasPreview,
        })}
      >
        <img
          className="scene-card-preview-image"
          loading="lazy"
          src={image}
          alt=""
        />
        <video
          disableRemotePlayback
          playsInline
          muted={!soundActive}
          className="scene-card-preview-video"
          loop
          preload="none"
          ref={videoEl}
          src={video}
          onLoadedData={() => setHasPreview(true)}
          onError={() => setHasPreview(false)}
        />
        <PreviewScrubber
          vttPath={vttPath}
          onClick={onScrubberClick}
          disabled={disabled}
        />
      </div>
    );
  }
);

interface ISceneCardProps {
  scene: GQL.SlimSceneDataFragment;
  width?: number;
  previewHeight?: number;
  index?: number;
  queue?: SceneQueue;
  compact?: boolean;
  selecting?: boolean;
  selected?: boolean | undefined;
  zoomIndex?: number;
  onSelectedChanged?: (selected: boolean, shiftKey: boolean) => void;
  fromGroupId?: string;
  view?: View;
}

const Description: React.FC<{
  sceneNumber?: number;
}> = ({ sceneNumber }) => {
  if (!sceneNumber) return null;

  return (
    <>
      <hr />
      {sceneNumber !== undefined && (
        <span className="scene-group-scene-number">
          <FormattedMessage id="scene" /> #{sceneNumber}
        </span>
      )}
    </>
  );
};

// One-click "I've seen this" for the card grid: stamps a VIEW at the current
// time. Sits with the count buttons at the foot of the card.
//
// A view is not a play - it never touches play count or play duration.
//
// It lights up while the scene's last view falls on today, which needs no
// local state: the mutation writes last_viewed_at into the cache, so the
// button reads its own result back and stays lit until midnight.
const MarkViewedButton: React.FC<{
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

const SceneCardPopovers = React.memo(
  PatchComponent("SceneCard.Popovers", (props: ISceneCardProps) => {
    const file = useMemo(
      () => (props.scene.files.length > 0 ? props.scene.files[0] : undefined),
      [props.scene]
    );

    const sceneNumber = useMemo(() => {
      if (!props.fromGroupId) {
        return undefined;
      }

      const group = props.scene.groups.find(
        (g) => g.group.id === props.fromGroupId
      );
      return group?.scene_index ?? undefined;
    }, [props.fromGroupId, props.scene.groups]);

    function maybeRenderTagPopoverButton() {
      if (props.scene.tags.length <= 0) return;

      const popoverContent = props.scene.tags.map((tag) => (
        <TagLink key={tag.id} tag={tag} />
      ));

      return (
        <HoverPopover
          className="tag-count"
          placement="bottom"
          content={popoverContent}
        >
          <Button className="minimal">
            <Icon icon={faTag} />
            <span>{props.scene.tags.length}</span>
          </Button>
        </HoverPopover>
      );
    }

    function maybeRenderPerformerPopoverButton() {
      if (props.scene.performers.length <= 0) return;

      return (
        <PerformerPopoverButton
          performers={props.scene.performers}
          linkType="scene"
        />
      );
    }

    function maybeRenderGroupPopoverButton() {
      if (props.scene.groups.length <= 0) return;

      const popoverContent = props.scene.groups.map((sceneGroup) => (
        <GroupTag key={sceneGroup.group.id} group={sceneGroup.group} />
      ));

      return (
        <HoverPopover
          placement="bottom"
          content={popoverContent}
          className="group-count tag-tooltip"
        >
          <Button className="minimal">
            <Icon icon={faFilm} />
            <span>{props.scene.groups.length}</span>
          </Button>
        </HoverPopover>
      );
    }

    function maybeRenderSceneMarkerPopoverButton() {
      if (props.scene.scene_markers.length <= 0) return;

      const popoverContent = props.scene.scene_markers.map((marker) => {
        const markerWithScene = { ...marker, scene: { id: props.scene.id } };
        return <SceneMarkerLink key={marker.id} marker={markerWithScene} />;
      });

      return (
        <HoverPopover
          className="marker-count"
          placement="bottom"
          content={popoverContent}
        >
          <Button className="minimal">
            <Icon icon={faMapMarkerAlt} />
            <span>{props.scene.scene_markers.length}</span>
          </Button>
        </HoverPopover>
      );
    }

    function maybeRenderOCounter() {
      if (props.scene.o_counter) {
        return <OCounterButton value={props.scene.o_counter} />;
      }
    }

    function maybeRenderGallery() {
      if (props.scene.galleries.length <= 0) return;

      const popoverContent = props.scene.galleries.map((gallery) => (
        <GalleryLink key={gallery.id} gallery={gallery} />
      ));

      return (
        <HoverPopover
          className="gallery-count"
          placement="bottom"
          content={popoverContent}
        >
          <Button className="minimal">
            <Icon icon={faImages} />
            <span>{props.scene.galleries.length}</span>
          </Button>
        </HoverPopover>
      );
    }

    function maybeRenderOrganized() {
      if (props.scene.organized) {
        return (
          <OverlayTrigger
            overlay={<Tooltip id="organised-tooltip">{"Organized"}</Tooltip>}
            placement="bottom"
          >
            <div className="organized">
              <Button className="minimal">
                <Icon icon={faBox} />
              </Button>
            </div>
          </OverlayTrigger>
        );
      }
    }

    function renderMarkViewed() {
      return (
        <MarkViewedButton
          sceneID={props.scene.id}
          lastViewedAt={props.scene.last_viewed_at}
          disabled={props.selecting}
        />
      );
    }

    function maybeRenderDupeCopies() {
      const phash = file
        ? file.fingerprints.find((fp) => fp.type === "phash")
        : undefined;

      if (phash) {
        return (
          <div className="other-copies extra-scene-info">
            <Button
              href={NavUtils.makeScenesPHashMatchUrl(phash.value)}
              className="minimal"
            >
              <Icon icon={faCopy} />
            </Button>
          </div>
        );
      }
    }

    // the mark-played button lives in this row and is always available, so
    // the row itself is now unconditional on anything but compact cards -
    // it used to appear only when the scene had something to count.
    function maybeRenderPopoverButtonGroup() {
      if (!props.compact) {
        return (
          <>
            <Description sceneNumber={sceneNumber} />
            <hr />
            <ButtonGroup className="card-popovers">
              {maybeRenderTagPopoverButton()}
              {maybeRenderPerformerPopoverButton()}
              {maybeRenderGroupPopoverButton()}
              {maybeRenderSceneMarkerPopoverButton()}
              {maybeRenderOCounter()}
              {maybeRenderGallery()}
              {maybeRenderOrganized()}
              {maybeRenderDupeCopies()}
              {renderMarkViewed()}
            </ButtonGroup>
          </>
        );
      }
    }

    return <>{maybeRenderPopoverButtonGroup()}</>;
  })
);

const SceneCardDetails = React.memo(
  PatchComponent("SceneCard.Details", (props: ISceneCardProps) => {
    return (
      <div className="scene-card__details">
        <span className="scene-card__date">{props.scene.date}</span>
        <span className="file-path extra-scene-info">
          {objectPath(props.scene)}
        </span>
        <TruncatedText
          className="scene-card__description"
          text={props.scene.details}
          lineCount={3}
        />
      </div>
    );
  })
);

const SceneCardOverlays = React.memo(
  PatchComponent("SceneCard.Overlays", (props: ISceneCardProps) => {
    const ret = useMemo(() => {
      return (
        <StudioOverlay studio={props.scene.studio} disabled={props.selecting} />
      );
    }, [props.scene.studio, props.selecting]);

    return ret;
  })
);

interface ISceneSpecsOverlay {
  scene: GQL.SlimSceneDataFragment;
}

export const SceneSpecsOverlay: React.FC<ISceneSpecsOverlay> = React.memo(
  PatchComponent("SceneCard.SceneSpecs", ({ scene }) => {
    const file = scene.files?.[0];
    if (!file) return null;
    return (
      <div className="scene-specs-overlay">
        <span className="overlay-filesize extra-scene-info">
          <FileSize size={file.size} />
        </span>
        {file.width && file.height ? (
          <span className="overlay-resolution">
            {TextUtils.resolution(file.width, file.height)}
          </span>
        ) : (
          ""
        )}
        {file.duration > 0 ? (
          <span className="overlay-duration">
            {TextUtils.secondsToTimestamp(file.duration)}
          </span>
        ) : (
          ""
        )}
      </div>
    );
  })
);

const SceneCardImage = React.memo(
  PatchComponent("SceneCard.Image", (props: ISceneCardProps) => {
    const history = useHistory();
    const { configuration } = useConfigurationContext();
    const cont = configuration?.interface.continuePlaylistDefault ?? false;

    const file = useMemo(
      () => (props.scene.files.length > 0 ? props.scene.files[0] : undefined),
      [props.scene]
    );

    function maybeRenderInteractiveSpeedOverlay() {
      return (
        <div className="scene-interactive-speed-overlay">
          {props.scene.interactive_speed ?? ""}
        </div>
      );
    }

    const onScrubberClick = useCallback(
      (timestamp: number) => {
        if (props.selecting) return;
        const link = props.queue
          ? props.queue.makeLink(props.scene.id, {
              sceneIndex: props.index,
              continue: cont,
              start: timestamp,
            })
          : `/scenes/${props.scene.id}?t=${timestamp}`;

        history.push(link);
      },
      [props.selecting, props.queue, props.scene.id, props.index, cont, history]
    );

    function isPortrait() {
      const width = file?.width ? file.width : 0;
      const height = file?.height ? file.height : 0;
      return height > width;
    }

    return (
      <>
        <ScenePreview
          image={props.scene.paths.screenshot ?? undefined}
          video={props.scene.paths.preview ?? undefined}
          isPortrait={isPortrait()}
          soundActive={configuration?.interface?.soundOnPreview ?? false}
          volume={configuration?.ui.previewVolume ?? defaultPreviewVolume}
          vttPath={props.scene.paths.vtt ?? undefined}
          onScrubberClick={onScrubberClick}
          disabled={props.selecting}
        />
        <RatingBanner rating={props.scene.rating100} />
        <SceneSpecsOverlay scene={props.scene} />
        {maybeRenderInteractiveSpeedOverlay()}
      </>
    );
  })
);

export const SceneCard = React.memo(
  PatchComponent("SceneCard", (props: ISceneCardProps) => {
    const { configuration } = useConfigurationContext();

    const file = useMemo(
      () => (props.scene.files.length > 0 ? props.scene.files[0] : undefined),
      [props.scene]
    );

    function zoomIndex() {
      if (!props.compact && props.zoomIndex !== undefined) {
        return `zoom-${props.zoomIndex}`;
      }

      return "";
    }

    function filelessClass() {
      if (!props.scene.files.length) {
        return "fileless";
      }

      return "";
    }

    const golden = isGolden(props.scene);

    // A golden card wakes up after a deliberate hover and then stays awake -
    // the flames and the rim keep burning once they've been earned, rather
    // than dying with the cursor. Hence a timer here instead of a CSS hover
    // delay.
    const [awake, setAwake] = useState(false);
    const wakeTimer = useRef<ReturnType<typeof setTimeout>>();

    // On the landing page, dwelling on a card records a view - the same thing
    // opening the scene page does. Counted once per card: leaving and coming
    // back to the same card doesn't view it again.
    const hoverViews =
      props.view === View.Landing && configuration?.ui?.trackActivity !== false;

    // no list eviction: refetching the scene list would replace the grid with
    // a spinner and drop the card the cursor is sitting on.
    const [addView] = useSceneAddView();
    const viewTimer = useRef<ReturnType<typeof setTimeout>>();
    const viewed = useRef(false);

    const onMouseEnter = useCallback(() => {
      if (golden && !awake) {
        wakeTimer.current = setTimeout(
          () => setAwake(true),
          goldenActivationDelay
        );
      }

      if (hoverViews && !viewed.current) {
        viewTimer.current = setTimeout(() => {
          viewed.current = true;
          addView({ variables: { id: props.scene.id } });
        }, hoverViewDelay);
      }
    }, [golden, awake, hoverViews, addView, props.scene.id]);

    const onMouseLeave = useCallback(() => {
      clearTimeout(wakeTimer.current);
      clearTimeout(viewTimer.current);
    }, []);

    useEffect(
      () => () => {
        clearTimeout(wakeTimer.current);
        clearTimeout(viewTimer.current);
      },
      []
    );

    function goldenClass() {
      if (!golden) return "";
      return awake ? "golden awake" : "golden";
    }

    const cont = configuration?.interface.continuePlaylistDefault ?? false;

    const sceneLink = props.queue
      ? props.queue.makeLink(props.scene.id, {
          sceneIndex: props.index,
          continue: cont,
        })
      : `/scenes/${props.scene.id}`;

    return (
      <GridCard
        className={`scene-card ${zoomIndex()} ${filelessClass()} ${goldenClass()}`}
        url={sceneLink}
        title={objectTitle(props.scene)}
        width={props.width}
        linkClassName="scene-card-link"
        thumbnailSectionClassName="video-section"
        resumeTime={props.scene.resume_time ?? undefined}
        duration={file?.duration ?? undefined}
        interactiveHeatmap={
          props.scene.interactive_speed
            ? (props.scene.paths.interactive_heatmap ?? undefined)
            : undefined
        }
        image={<SceneCardImage {...props} />}
        overlays={<SceneCardOverlays {...props} />}
        details={<SceneCardDetails {...props} />}
        popovers={<SceneCardPopovers {...props} />}
        selected={props.selected}
        selecting={props.selecting}
        onSelectedChanged={props.onSelectedChanged}
        onMouseEnter={golden || hoverViews ? onMouseEnter : undefined}
        onMouseLeave={golden || hoverViews ? onMouseLeave : undefined}
        decorations={golden ? <SceneFire /> : undefined}
      />
    );
  })
);
