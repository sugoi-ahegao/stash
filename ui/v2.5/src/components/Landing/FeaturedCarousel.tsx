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
  FEATURE_UNLOCKED_AT_FIELD,
  withFeatured,
} from "src/core/featured";
import { useForkConfig } from "src/core/forkConfig";
import {
  canUnlockMore,
  isUnlockExpired,
  remainingUnlocks,
  shouldRemoveFromFeatured,
  startOfToday,
} from "./featuredPolicy";

// --- tunables - the policy ones live in featuredPolicy.ts ---

// the most slides the carousel will show. It's a cap, not a target: slots
// are filled by walking the group oldest-featured-first, and expired
// unlocks and out-of-budget locked slides are skipped, so the carousel
// often runs shorter than this.
const FEATURED_COUNT = 10;

// how long an unlocked slide sits on its still frame before the preview
// video fades in. Long enough that flicking past a slide doesn't start a
// video; the timer resets whenever the slide stops being active.
const PREVIEW_DELAY_MS = 1000;

// how long a slide stays on screen before the carousel advances. Hovering
// the carousel pauses the timer (pauseOnHover), and it does not start until
// the previous transition has finished, so a slide is actually up for about
// SLIDE_DURATION_MS + SLIDE_TRANSITION_MS. Keep it comfortably above
// PREVIEW_DELAY_MS or unlocked slides will move on before their preview has
// had a chance to start, and above HOLD_DURATION_MS so a keyboard hold on a
// locked slide - which doesn't pause the timer - has time to finish.
const SLIDE_DURATION_MS = 10000;

// how long the crossfade between slides takes.
const SLIDE_TRANSITION_MS = 600;

// how long you have to hold a locked slide to reveal it. Releasing early
// cancels with nothing spent - only a completed hold burns one of
// MAX_UNLOCKS_PER_DAY. Keep it in step with the CSS transition on
// .slide-reveal-clip / .slide-glass in styles.scss, which animates the iris
// over the same period.
const HOLD_DURATION_MS = 2000;

// -------------------------------------------------------------

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

type FeaturedScene =
  GQL.FindFeaturedScenesQuery["findScenes"]["scenes"][number];

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
              <div className="featured-slide-studio">{scene.studio.name}</div>
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

// Nothing to show until a featured group is chosen in the settings.
export const FeaturedCarousel: React.FC = () => {
  const { featuredGroupId } = useForkConfig();
  if (!featuredGroupId) return null;

  return <FeaturedGroupCarousel featuredGroupId={featuredGroupId} />;
};

const FeaturedGroupCarousel: React.FC<{ featuredGroupId: string }> = ({
  featuredGroupId,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  // ids, not a count: the unlock budget drives which slides are shown, so we
  // need to know *which* scenes were unlocked in this session and not just
  // how many. See unlockedToday below.
  const [unlockedThisSession, setUnlockedThisSession] = useState<Set<string>>(
    () => new Set()
  );
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
          value: [featuredGroupId],
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
  // both queries above select `findScenes`, so a scene update evicts and
  // refetches both together. Adding every in-session unlock to the count
  // would therefore double-count as soon as the refetch lands, and burn the
  // day's budget at twice the rate. Only count an in-session unlock while
  // the group query still shows the scene without its stamp - once the stamp
  // is there, the count query has it too. A scene that has left the group
  // entirely isn't ours to count; the library-wide count covers it.
  const pendingUnlocks = useMemo(() => {
    const byID = new Map(
      (data?.findScenes.scenes ?? []).map((scene) => [scene.id, scene])
    );

    return [...unlockedThisSession].filter((id) => {
      const scene = byID.get(id);
      return scene && !scene.custom_fields[FEATURE_UNLOCKED_AT_FIELD];
    }).length;
  }, [data, unlockedThisSession]);

  const unlockedToday =
    (unlockedTodayData?.findScenes.count ?? 0) + pendingUnlocks;
  const canUnlock = canUnlockMore(unlockedToday);
  const lockedSlots = remainingUnlocks(unlockedToday);

  // walk the group oldest-featured-first and fill up to FEATURED_COUNT
  // slots. Two things get skipped:
  //   - slides whose unlock has expired (seen, and past their window)
  //   - locked slides beyond `lockedSlots`, because you can't open them
  //     today and a slide you can't open is just a tease
  // A scene unlocked in this session counts as unlocked even before its
  // stamp lands, so spending an unlock doesn't yank a *different* slide out
  // from under you mid-session.
  //
  // `considered` is every scene walked, skipped ones included, because the
  // removal sweep below still has to see them - a hidden slide that never
  // gets swept would sit in the group forever. Note that once locked slides
  // are being skipped the walk runs to the end of the group, so the sweep
  // covers the whole group rather than just the visible window.
  const { scenes, consideredScenes } = useMemo(() => {
    const sorted = (data?.findScenes.scenes ?? [])
      .slice()
      .sort(byFeaturedAddedAt);

    const now = new Date();
    const visible: FeaturedScene[] = [];
    const considered: FeaturedScene[] = [];
    let lockedShown = 0;

    for (const scene of sorted) {
      considered.push(scene);

      if (isUnlockExpired(scene, now)) continue;

      const unlocked =
        !!scene.custom_fields[FEATURE_UNLOCKED_AT_FIELD] ||
        unlockedThisSession.has(scene.id);

      if (!unlocked) {
        if (lockedShown >= lockedSlots) continue;
        lockedShown++;
      }

      visible.push(scene);
      if (visible.length === FEATURED_COUNT) break;
    }

    return { scenes: visible, consideredScenes: considered };
  }, [data, lockedSlots, unlockedThisSession]);

  // lazily enforce the removal rules (rated, or unlocked-and-unrated past
  // the expiry window) whenever the featured list loads/changes. This
  // only runs when someone actually visits the carousel - there's no
  // background job sweeping it on a schedule.
  useEffect(() => {
    const now = new Date();
    for (const scene of consideredScenes) {
      if (removedRef.current.has(scene.id)) continue;
      if (!shouldRemoveFromFeatured(scene, now)) continue;

      removedRef.current.add(scene.id);
      updateScene({
        variables: {
          input: {
            id: scene.id,
            groups: withFeatured(scene, false, featuredGroupId),
            custom_fields: {
              remove: [FEATURED_ADDED_AT_FIELD, FEATURE_UNLOCKED_AT_FIELD],
            },
          },
        },
      }).catch(() => {
        removedRef.current.delete(scene.id);
      });
    }
  }, [consideredScenes, updateScene, featuredGroupId]);

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
        autoplaySpeed={SLIDE_DURATION_MS}
        speed={SLIDE_TRANSITION_MS}
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
              onUnlock={() =>
                setUnlockedThisSession((ids) => new Set(ids).add(scene.id))
              }
            />
          </div>
        ))}
      </Slider>
    </div>
  );
};
