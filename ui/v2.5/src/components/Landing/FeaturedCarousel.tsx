import React, { useEffect, useRef, useState } from "react";
import Slider from "@ant-design/react-slick";
import { Link } from "react-router-dom";
import cx from "classnames";
import * as GQL from "src/core/generated-graphql";
import { LoadingIndicator } from "../Shared/LoadingIndicator";
import { objectTitle } from "src/core/files";
import { FEATURED_ADDED_AT_FIELD, FEATURED_GROUP_ID } from "./featuredGroup";

const FEATURED_COUNT = 10;
const PREVIEW_DELAY_MS = 1000;
const HOLD_DURATION_MS = 2000;

const SlideGlass: React.FC<{
  holding: boolean;
  onHoldStart: () => void;
  onHoldEnd: () => void;
}> = ({ holding, onHoldStart, onHoldEnd }) => {
  function startHold(e: React.SyntheticEvent) {
    e.preventDefault();
    e.stopPropagation();
    onHoldStart();
  }

  return (
    <div
      className={cx("slide-glass", { "is-holding": holding })}
      role="button"
      tabIndex={0}
      onMouseDown={startHold}
      onMouseUp={onHoldEnd}
      onMouseLeave={onHoldEnd}
      onTouchStart={startHold}
      onTouchEnd={onHoldEnd}
      onTouchCancel={onHoldEnd}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !e.repeat) startHold(e);
      }}
      onKeyUp={(e) => {
        if (e.key === "Enter" || e.key === " ") onHoldEnd();
      }}
    >
      <div className="slide-teaser-button">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 17a2 2 0 0 0 2-2 2 2 0 0 0-2-2 2 2 0 0 0-2 2 2 2 0 0 0 2 2m6-9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2h1V6a5 5 0 0 1 5-5 5 5 0 0 1 5 5v2zm-6-5a3 3 0 0 0-3 3v2h6V6a3 3 0 0 0-3-3z" />
        </svg>
      </div>
    </div>
  );
};

type FeaturedScene = GQL.FindFeaturedScenesQuery["findScenes"]["scenes"][number];

// scenes without a recorded add date sort last; ISO strings compare
// correctly with plain < / >.
function byFeaturedAddedAt(a: FeaturedScene, b: FeaturedScene) {
  const aDate = a.custom_fields[FEATURED_ADDED_AT_FIELD] as string | undefined;
  const bDate = b.custom_fields[FEATURED_ADDED_AT_FIELD] as string | undefined;

  if (!aDate && !bDate) return 0;
  if (!aDate) return 1;
  if (!bDate) return -1;
  return aDate < bDate ? -1 : aDate > bDate ? 1 : 0;
}

const FeaturedSlide: React.FC<{
  scene: FeaturedScene;
  active: boolean;
}> = ({ scene, active }) => {
  const [showPreview, setShowPreview] = useState(false);
  const [holding, setHolding] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const videoEl = useRef<HTMLVideoElement>(null);
  const holdTimer = useRef<number>();

  function handleHoldStart() {
    if (revealed || holdTimer.current) return;
    setHolding(true);
    holdTimer.current = window.setTimeout(() => {
      setRevealed(true);
    }, HOLD_DURATION_MS);
  }

  function handleHoldEnd() {
    setHolding(false);
    if (holdTimer.current) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = undefined;
    }
  }

  useEffect(() => {
    return () => {
      if (holdTimer.current) window.clearTimeout(holdTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!active || !revealed) {
      setShowPreview(false);
      return;
    }

    const timer = setTimeout(() => setShowPreview(true), PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [active, revealed]);

  useEffect(() => {
    if (showPreview) {
      videoEl.current?.play()?.catch(() => {});
    } else {
      videoEl.current?.pause();
      if (videoEl.current) {
        videoEl.current.currentTime = 0;
      }
    }
  }, [showPreview]);

  return (
    <div className="featured-slide">
      <div
        className={cx("slide-reveal-clip", {
          "is-open": holding || revealed,
        })}
      >
        <Link
          to={`/scenes/${scene.id}`}
          className={cx("featured-slide-link", {
            "is-revealed": holding || revealed,
            "is-complete": revealed,
          })}
        >
          <div
            className="featured-slide-image"
            style={
              scene.paths.screenshot
                ? { backgroundImage: `url(${scene.paths.screenshot})` }
                : undefined
            }
          />
          {scene.paths.preview && (
            <video
              ref={videoEl}
              className={cx("featured-slide-video", {
                "is-visible": showPreview,
              })}
              src={scene.paths.preview}
              muted
              loop
              playsInline
              preload="none"
            />
          )}
          <div className="featured-slide-overlay" />
          <div className="featured-slide-info">
            {scene.studio && (
              <div className="featured-slide-studio">
                {scene.studio.name}
              </div>
            )}
            <h2 className="featured-slide-title">{objectTitle(scene)}</h2>
            {scene.date && (
              <div className="featured-slide-date">{scene.date}</div>
            )}
          </div>
        </Link>
      </div>
      {!revealed && (
        <SlideGlass
          holding={holding}
          onHoldStart={handleHoldStart}
          onHoldEnd={handleHoldEnd}
        />
      )}
      {revealed && <div className="reveal-burst" />}
    </div>
  );
};

export const FeaturedCarousel: React.FC = () => {
  const [activeIndex, setActiveIndex] = useState(0);

  const { data, loading } = GQL.useFindFeaturedScenesQuery({
    variables: {
      filter: {
        // fetch every scene in the group - we sort by featured_added_at
        // client-side, so the backend's default ordering doesn't matter.
        per_page: -1,
      },
      scene_filter: {
        groups: {
          value: [FEATURED_GROUP_ID],
          modifier: GQL.CriterionModifier.Includes,
        },
      },
    },
  });

  const scenes = (data?.findScenes.scenes ?? [])
    .slice()
    .sort(byFeaturedAddedAt)
    .slice(0, FEATURED_COUNT);

  if (loading) {
    return <LoadingIndicator />;
  }

  if (!scenes.length) {
    return null;
  }

  return (
    <div className="featured-carousel">
      <Slider
        dots
        arrows
        infinite
        autoplay
        autoplaySpeed={6000}
        speed={600}
        fade
        pauseOnHover
        slidesToShow={1}
        slidesToScroll={1}
        afterChange={(index: number) => setActiveIndex(index)}
      >
        {scenes.map((scene, index) => (
          // react-slick clones this outer element and injects its own
          // width/display inline styles onto it - nest the real slide
          // markup one level deeper so those styles don't clobber ours.
          <div key={scene.id}>
            <FeaturedSlide scene={scene} active={index === activeIndex} />
          </div>
        ))}
      </Slider>
    </div>
  );
};
