import React, { useEffect, useRef, useState } from "react";
import Slider from "@ant-design/react-slick";
import { Link } from "react-router-dom";
import { useIntl } from "react-intl";
import cx from "classnames";
import * as GQL from "src/core/generated-graphql";
import { LoadingIndicator } from "../Shared/LoadingIndicator";
import { objectTitle } from "src/core/files";
import { FEATURED_ADDED_AT_FIELD, FEATURED_GROUP_ID } from "./featuredGroup";

const FEATURED_COUNT = 10;
const PREVIEW_DELAY_MS = 1000;
const REVEAL_DURATION_MS = 900;

const SlideGlass: React.FC<{
  revealing: boolean;
  onReveal: () => void;
}> = ({ revealing, onReveal }) => {
  const intl = useIntl();

  function handleReveal(e: React.SyntheticEvent) {
    e.preventDefault();
    e.stopPropagation();
    onReveal();
  }

  return (
    <div
      className={cx("slide-glass", { "is-revealing": revealing })}
      role="button"
      tabIndex={0}
      onClick={handleReveal}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") handleReveal(e);
      }}
    >
      <div className="slide-teaser-button">
        <div className="slide-teaser-ring" />
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>
      <div className="slide-teaser-hint">
        {intl.formatMessage({ id: "actions.click_to_reveal" })}
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
  const [revealing, setRevealing] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const videoEl = useRef<HTMLVideoElement>(null);

  function handleReveal() {
    if (revealing) return;
    setRevealing(true);
    window.setTimeout(() => setRevealed(true), REVEAL_DURATION_MS);
  }

  useEffect(() => {
    if (!active) {
      setShowPreview(false);
      return;
    }

    const timer = setTimeout(() => setShowPreview(true), PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [active]);

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
      <Link
        to={`/scenes/${scene.id}`}
        className={cx("featured-slide-link", { "is-revealed": revealing })}
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
            <div className="featured-slide-studio">{scene.studio.name}</div>
          )}
          <h2 className="featured-slide-title">{objectTitle(scene)}</h2>
          {scene.date && (
            <div className="featured-slide-date">{scene.date}</div>
          )}
        </div>
      </Link>
      {!revealed && (
        <SlideGlass revealing={revealing} onReveal={handleReveal} />
      )}
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
