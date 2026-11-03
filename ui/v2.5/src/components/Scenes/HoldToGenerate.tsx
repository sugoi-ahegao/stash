import React, { useCallback, useEffect, useRef, useState } from "react";
import cx from "classnames";
import { faCheck, faCog, faXmark } from "@fortawesome/free-solid-svg-icons";
import * as GQL from "src/core/generated-graphql";
import { mutateMetadataGenerate } from "src/core/StashService";
import { useConfigurationContext } from "src/hooks/Config";
import { useToast } from "src/hooks/Toast";
import { useMonitorJob } from "src/utils/job";
import { withoutTypename } from "src/utils/data";
import { Icon } from "../Shared/Icon";

// Press and hold a scene card's thumbnail to generate for that scene. After
// the blast, a glowing gear stays on the thumbnail until the job is done.
//
// Holding for holdDuration queues two jobs, the preview job first so it runs
// first:
//
//   1. the preview (and the webp, if the defaults make one), overwriting what's
//      there, with the segments slid to new positions - so a scene that
//      already has a preview gets a different one, not the same one again
//   2. everything else the generate defaults (Settings > Tasks > Generate)
//      ask for, without overwrite, so it only fills in what's missing
//
// When the preview job finishes, every card showing the scene reloads its
// preview (usePreviewVersion).

// Long enough to never be an accident, and longer than the hover-view delay,
// so a hold on a page that views on hover records the view as well.
export const holdDuration = 5000;
// A press let go before this is an ordinary click: it shows nothing and opens
// the scene. Once the dial is showing, letting go is a hold given up on -
// nothing happens, and the scene doesn't open. Platforms call a press a long
// press at around 400-500 ms; much under this and a slow, deliberate click
// would be taken for a hold and eaten.
const revealDelay = 350;
// A hold given up on doesn't just vanish: the ring drains back from wherever
// it got to, over this long, so letting go reads as backing out.
const drainDuration = 350;
// How long the "done" or "failed" state stays up before the card settles.
const settleDelay = 1800;
// The server never cuts a segment shorter than this (minSegmentDuration in
// pkg/scene/generate/preview.go).
const minSegmentDuration = 0.75;

// ---- preview versions -------------------------------------------------------
// A regenerated preview has the same URL as the old one, so a card that has
// already loaded it won't fetch it again. Each regeneration bumps the scene's
// version; the card appends it to the URL and remounts its preview.

const previewVersions = new Map<string, number>();
const versionListeners = new Set<() => void>();

function bumpPreviewVersion(sceneID: string) {
  previewVersions.set(sceneID, (previewVersions.get(sceneID) ?? 0) + 1);
  for (const l of versionListeners) l();
}

export function usePreviewVersion(sceneID: string) {
  const [version, setVersion] = useState(previewVersions.get(sceneID) ?? 0);

  useEffect(() => {
    const listener = () => setVersion(previewVersions.get(sceneID) ?? 0);
    versionListeners.add(listener);
    listener();
    return () => {
      versionListeners.delete(listener);
    };
  }, [sceneID]);

  return version;
}

// The server ignores the parameter; it only makes the URL new. Not "t": that
// one makes the server mark the response immutable.
export function withPreviewVersion(url: string | undefined, version: number) {
  if (!url || version === 0) return url;
  return `${url}${url.includes("?") ? "&" : "?"}v=${version}`;
}

// ---- a different preview ----------------------------------------------------

// Same parsing as getExcludeValue in pkg/scene/generate/preview.go: seconds,
// or a percentage of the duration.
function excludeSeconds(value: string | null | undefined, duration: number) {
  const v = value?.trim() ?? "";
  if (v.endsWith("%") && v.length > 1) {
    return ((parseFloat(v.slice(0, -1)) || 0) / 100) * duration;
  }
  return parseFloat(v) || 0;
}

// The preview's segments start at excludeStart + i * step, step being the
// duration left after the excludes over the number of segments. Sliding the
// start along by part of a step, and the end back by the same amount, keeps
// the step and moves every segment: a different preview, still spread over
// the whole scene. The end can go negative - the server only subtracts it -
// which is what lets a scene with no excludes slide at all.
//
// Undefined when there's nothing to slide: a scene too short for segments
// gets one preview of the whole thing.
export function slidPreviewOptions(
  duration: number | undefined,
  general: GQL.ConfigGeneralDataFragment | undefined,
  random = Math.random()
): GQL.GeneratePreviewOptionsInput | undefined {
  if (!duration || !general) return;

  const segments = general.previewSegments;
  const segmentDuration = Math.max(
    general.previewSegmentDuration,
    minSegmentDuration
  );
  if (segments <= 0 || duration < segments * general.previewSegmentDuration) {
    return;
  }

  let start = excludeSeconds(general.previewExcludeStart, duration);
  let end = excludeSeconds(general.previewExcludeEnd, duration);
  if (duration <= start + end) {
    start = 0;
    end = 0;
  }

  const step = (duration - start - end) / segments;
  // the last segment has to end before the video does
  const room = Math.min(step, step + end - segmentDuration);
  if (room <= 0) return;

  // never (almost) where it already was
  const shift = room * (0.15 + 0.85 * random);

  return {
    previewExcludeStart: (start + shift).toFixed(3),
    previewExcludeEnd: (end - shift).toFixed(3),
  };
}

async function generateForScene(
  scene: GQL.SlimSceneDataFragment,
  configuration: GQL.ConfigDataFragment | undefined
) {
  // the same fallback as the generate dialog's, for an install that never
  // saved its defaults
  const defaults: GQL.GenerateMetadataInput = configuration?.defaults.generate
    ? withoutTypename(configuration.defaults.generate)
    : { sprites: true, phashes: true, previews: true, markers: true };

  // the rest of the preview settings are left to the server's configuration
  const previewOptions = slidPreviewOptions(
    scene.files[0]?.duration,
    configuration?.general
  );

  const previewJob = await mutateMetadataGenerate({
    sceneIDs: [scene.id],
    previews: true,
    imagePreviews: defaults.imagePreviews ?? false,
    previewOptions,
    overwrite: true,
  });

  const rest = { ...defaults };
  delete rest.previews;
  delete rest.imagePreviews;
  delete rest.previewOptions;
  if (Object.values(rest).some((v) => v === true)) {
    await mutateMetadataGenerate({
      ...rest,
      sceneIDs: [scene.id],
      overwrite: false,
    });
  }

  return previewJob.data?.metadataGenerate;
}

// ---- the hold ---------------------------------------------------------------

type Phase =
  | "idle"
  | "charging"
  | "draining"
  | "generating"
  | "done"
  | "failed";

// Where the dial had got to when the hold was let go, read off its running
// animations, so the drain starts from there rather than snapping.
interface IDrainFrom {
  offset: string;
  stroke: string;
  cogTransform: string;
  cogColor: string;
}

function readDial(dial: HTMLElement | null): IDrainFrom | undefined {
  const charge = dial?.querySelector(".hold-charge");
  const cog = dial?.querySelector(".hold-cog");
  if (!charge || !cog) return;

  const c = getComputedStyle(charge);
  const g = getComputedStyle(cog);
  return {
    offset: c.strokeDashoffset,
    stroke: c.stroke,
    cogTransform: g.transform,
    cogColor: g.color,
  };
}

interface IHoldToGenerate {
  scene: GQL.SlimSceneDataFragment;
  disabled?: boolean;
}

// Wraps a scene card's thumbnail. It sits inside the card's link, so it sees
// the press first and can swallow the click that ends a completed hold.
export const HoldToGenerate: React.FC<IHoldToGenerate> = ({
  scene,
  disabled,
  children,
}) => {
  const { configuration } = useConfigurationContext();
  const Toast = useToast();

  const [phase, setPhase] = useState<Phase>("idle");
  const [jobID, setJobID] = useState<string>();
  const [drainFrom, setDrainFrom] = useState<IDrainFrom>();
  const dial = useRef<HTMLDivElement>(null);

  // the card the press is held on: the pointer can wander anywhere over it
  const press = useRef<{ card: Element; at: number }>();
  // removes the window listeners that follow the pointer during a press
  const stopTracking = useRef<() => void>();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const swallowClick = useRef(false);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const endPress = useCallback(() => {
    press.current = undefined;
    stopTracking.current?.();
    stopTracking.current = undefined;
  }, []);

  useEffect(
    () => () => {
      clearTimers();
      endPress();
    },
    [clearTimers, endPress]
  );

  const settle = useCallback((to: Phase) => {
    setPhase(to);
    timers.current.push(setTimeout(() => setPhase("idle"), settleDelay));
  }, []);

  const { job } = useMonitorJob(jobID, (finished) => {
    setJobID(undefined);
    if (finished?.status === GQL.JobStatus.Failed) {
      settle("failed");
      return;
    }
    bumpPreviewVersion(scene.id);
    settle("done");
  });

  const cancel = useCallback(() => {
    if (!press.current) return;
    const shown = Date.now() - press.current.at >= revealDelay;
    endPress();
    clearTimers();

    // given up on, once the dial is up: no click, and the ring drains back
    if (shown) swallowClick.current = true;

    const from = shown ? readDial(dial.current) : undefined;
    if (!from) {
      setPhase("idle");
      return;
    }

    setDrainFrom(from);
    setPhase("draining");
    timers.current.push(setTimeout(() => setPhase("idle"), drainDuration));
  }, [clearTimers, endPress]);

  const fire = useCallback(async () => {
    endPress();
    swallowClick.current = true;
    setPhase("generating");

    try {
      const id = await generateForScene(scene, configuration);
      if (id) setJobID(id);
      else settle("done");
    } catch (e) {
      Toast.error(e);
      settle("failed");
    }
  }, [scene, configuration, settle, Toast, endPress]);

  const busy = phase === "generating";
  const enabled = !disabled && scene.files.length > 0;

  function onPointerDown(e: React.PointerEvent) {
    swallowClick.current = false;
    if (!enabled || busy || e.button !== 0 || !e.isPrimary) return;

    clearTimers();
    endPress();

    const el = e.currentTarget;
    const pointerId = e.pointerId;
    press.current = {
      card: el.closest(".grid-card") ?? el,
      at: Date.now(),
    };

    // The press is followed on the window, not the thumbnail, so dragging
    // around the card keeps the hold going and a release anywhere ends it.
    // Not pointer capture: capturing retargets the click, and a quick click
    // on the preview scrubber has to reach the scrubber.
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId || !press.current) return;
      const r = press.current.card.getBoundingClientRect();
      const inside =
        ev.clientX >= r.left &&
        ev.clientX <= r.right &&
        ev.clientY >= r.top &&
        ev.clientY <= r.bottom;
      // leaving the card gives the hold up
      if (!inside) cancel();
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId) cancel();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    stopTracking.current = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };

    timers.current.push(
      setTimeout(() => setPhase("charging"), revealDelay),
      setTimeout(fire, holdDuration)
    );
  }

  // Moving with the button down on a link starts the browser's own drag and
  // drop, which would take the pointer away from the hold.
  function onDragStart(e: React.DragEvent) {
    if (press.current) e.preventDefault();
  }

  function onClickCapture(e: React.MouseEvent) {
    if (!swallowClick.current) return;
    swallowClick.current = false;
    e.preventDefault();
    e.stopPropagation();
  }

  function onContextMenu(e: React.MouseEvent) {
    // a long press on touch opens the context menu
    if (press.current || swallowClick.current) e.preventDefault();
  }

  // queued behind other jobs until the preview job starts
  const running = job?.status === GQL.JobStatus.Running;

  return (
    <div
      className={cx(
        "hold-generate",
        phase !== "idle" && `hold-${phase}`,
        phase === "generating" && (running ? "hold-running" : "hold-queued")
      )}
      style={
        {
          "--hold-charge": `${holdDuration - revealDelay}ms`,
          "--hold-drain": `${drainDuration}ms`,
          "--hold-drain-from": drainFrom?.offset,
          "--hold-drain-stroke": drainFrom?.stroke,
          "--hold-drain-cog": drainFrom?.cogTransform,
          "--hold-drain-cog-color": drainFrom?.cogColor,
        } as React.CSSProperties
      }
      onPointerDown={onPointerDown}
      onDragStart={onDragStart}
      onClickCapture={onClickCapture}
      onContextMenu={onContextMenu}
    >
      <div className="hold-generate-content">{children}</div>

      {phase !== "idle" && (
        <div className="hold-generate-veil" aria-hidden>
          {(phase === "charging" || phase === "draining") && (
            <div className="hold-generate-dial" ref={dial}>
              <svg viewBox="0 0 100 100">
                <circle className="hold-track" cx="50" cy="50" r="44" />
                <circle
                  className="hold-charge"
                  cx="50"
                  cy="50"
                  r="44"
                  pathLength={100}
                />
              </svg>
              <Icon icon={faCog} className="hold-cog" />
            </div>
          )}

          {phase !== "charging" && phase !== "draining" && (
            <>
              <div className="hold-generate-flash" />
              <div className="hold-generate-shockwave" />
              {/* keyed so the gear and the mark that replaces it each pop in */}
              <div className="hold-generate-emblem" key={phase}>
                <Icon
                  icon={
                    phase === "done"
                      ? faCheck
                      : phase === "failed"
                        ? faXmark
                        : faCog
                  }
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
