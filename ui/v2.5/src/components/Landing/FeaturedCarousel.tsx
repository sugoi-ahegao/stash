import React, { useEffect, useMemo, useRef, useState } from "react";
import Slider from "@ant-design/react-slick";
import { Link } from "react-router-dom";
import cx from "classnames";
import * as GQL from "src/core/generated-graphql";
import { useSceneUpdate } from "src/core/StashService";
import { LoadingIndicator } from "../Shared/LoadingIndicator";
import { objectTitle } from "src/core/files";
import {
  FEATURED_ADDED_AT_FIELD,
  FEATURED_GROUP_ID,
  FEATURE_UNLOCKED_AT_FIELD,
} from "./featuredGroup";
import {
  canUnlockMore,
  shouldRemoveFromFeatured,
  startOfToday,
} from "./featuredPolicy";

const FEATURED_COUNT = 10;
const PREVIEW_DELAY_MS = 1000;
const HOLD_DURATION_MS = 2000;

const SlideGlass: React.FC<{
  holding: boolean;
  locked: boolean;
  onHoldStart: () => void;
  onHoldEnd: () => void;
}> = ({ holding, locked, onHoldStart, onHoldEnd }) => {
  function startHold(e: React.SyntheticEvent) {
    e.preventDefault();
    e.stopPropagation();
    onHoldStart();
  }

  return (
    <div
      className={cx("slide-glass", {
        "is-holding": holding,
        "is-locked-out": locked,
      })}
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
  canUnlock: boolean;
  onUnlock: () => void;
}> = ({ scene, active, canUnlock, onUnlock }) => {
  const [showPreview, setShowPreview] = useState(false);
  const [holding, setHolding] = useState(false);
  const [revealed, setRevealed] = useState(
    () => !!scene.custom_fields[FEATURE_UNLOCKED_AT_FIELD]
  );
  const [justUnlocked, setJustUnlocked] = useState(false);
  const videoEl = useRef<HTMLVideoElement>(null);
  const holdTimer = useRef<number>();
  const [updateScene] = useSceneUpdate();

  function handleHoldStart() {
    if (revealed || holdTimer.current || !canUnlock) return;
    setHolding(true);
    holdTimer.current = window.setTimeout(() => {
      setRevealed(true);
      setJustUnlocked(true);
      onUnlock();
      updateScene({
        variables: {
          input: {
            id: scene.id,
            custom_fields: {
              partial: {
                [FEATURE_UNLOCKED_AT_FIELD]: new Date().toISOString(),
              },
            },
          },
        },
      }).catch(() => {});
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
            "is-complete": justUnlocked,
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
          locked={!canUnlock}
          onHoldStart={handleHoldStart}
          onHoldEnd={handleHoldEnd}
        />
      )}
      {justUnlocked && <div className="reveal-burst" />}
    </div>
  );
};

export const FeaturedCarousel: React.FC = () => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [unlockedThisSession, setUnlockedThisSession] = useState(0);
  const [updateScene] = useSceneUpdate();
  const removedRef = useRef<Set<string>>(new Set());

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

  // how many scenes have been unlocked today, library-wide - not just the
  // ones still in the featured group (a scene can be unlocked and later
  // removed by policy, but it should still count against today's limit).
  const { data: unlockedTodayData } = GQL.useCountScenesByCustomFieldQuery({
    variables: {
      scene_filter: {
        custom_fields: [
          {
            field: FEATURE_UNLOCKED_AT_FIELD,
            modifier: GQL.CriterionModifier.GreaterThan,
            value: [startOfToday().toISOString()],
          },
        ],
      },
    },
  });
  const unlockedToday =
    (unlockedTodayData?.findScenes.count ?? 0) + unlockedThisSession;
  const canUnlock = canUnlockMore(unlockedToday);

  const scenes = useMemo(
    () =>
      (data?.findScenes.scenes ?? [])
        .slice()
        .sort(byFeaturedAddedAt)
        .slice(0, FEATURED_COUNT),
    [data]
  );

  // lazily enforce the removal rules (rated, or unlocked-and-unrated past
  // the expiry window) whenever the featured list loads/changes. This
  // only runs when someone actually visits the carousel - there's no
  // background job sweeping it on a schedule.
  useEffect(() => {
    const now = new Date();
    for (const scene of scenes) {
      if (removedRef.current.has(scene.id)) continue;
      if (!shouldRemoveFromFeatured(scene, now)) continue;

      removedRef.current.add(scene.id);
      updateScene({
        variables: {
          input: {
            id: scene.id,
            groups: scene.groups
              .filter((g) => g.group.id !== FEATURED_GROUP_ID)
              .map((g) => ({
                group_id: g.group.id,
                scene_index: g.scene_index,
              })),
            custom_fields: {
              remove: [FEATURED_ADDED_AT_FIELD, FEATURE_UNLOCKED_AT_FIELD],
            },
          },
        },
      }).catch(() => {
        removedRef.current.delete(scene.id);
      });
    }
  }, [scenes, updateScene]);

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
        autoplaySpeed={10000}
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
            <FeaturedSlide
              scene={scene}
              active={index === activeIndex}
              canUnlock={canUnlock}
              onUnlock={() => setUnlockedThisSession((n) => n + 1)}
            />
          </div>
        ))}
      </Slider>
    </div>
  );
};
