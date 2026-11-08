// fork: how the scene list's results change (scene-results.scss).
// While the next results load, the cards on screen stay, dimmed. Once they've
// loaded, the old cards fade out together, then the new cards rise into their
// slots in one diagonal wave from the top-left corner. The
// first screen's thumbnails are loaded before the cards rise, so they come up
// with their cards; any other thumbnail fades in once its image has loaded.
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import cx from "classnames";
import { DisplayMode } from "src/models/list-filter/types";

interface IHasID {
  id: string;
}

// The timings, here once and handed to the CSS as custom properties.
const OUT_DURATION = 200; // ms, the old cards fading out, all together
const IN_DURATION = 450; // ms, one card rising in
const IN_STEP = 75; // ms between one card and the next
const IN_SPREAD = 1500; // ms, at most, from the first card to the last on screen
const PRELOAD_CAP = 500; // ms, at most, the swap waits for the first thumbnails
const PRELOAD_COUNT = 24; // scenes whose images load ahead of their cards

// in: showing; out: fading away; gone: away, about to be replaced
type Phase = "in" | "out" | "gone";

// the cards that rise, in grid, wall and list views
const CARDS = ".scene-grid > .scene-card, .wall-item, tbody > tr";

function idsOf(items: IHasID[]) {
  return items.map((i) => i.id).join(",");
}

// the latest results' images loaded ahead of their cards, by resolved URL
const preloaded = new Set<string>();

// Resolves when every image is loaded and decoded, or failed, or at the cap;
// a slow disk mustn't hold up the results.
function preloadImages(urls: string[]) {
  preloaded.clear();

  const loads = urls.map((url) => {
    const img = new Image();
    img.src = url;
    return img.decode().then(
      () => {
        preloaded.add(img.src);
      },
      () => {}
    );
  });

  let cap: number;
  return Promise.race([
    Promise.all(loads),
    new Promise((resolve) => {
      cap = window.setTimeout(resolve, PRELOAD_CAP);
    }),
  ]).finally(() => window.clearTimeout(cap));
}

// Which scenes to show, and in which phase. A change of results is a change
// of the scenes' ids (in order); an update to the same scenes (a rating, a
// view, a selection) shows straight away, no animation. The old scenes stay
// until the new ones have loaded, so the space is never empty.
export function useResultsTransition<T extends IHasID>(
  items: T[],
  loading: boolean,
  imagesOf: (item: T) => (string | null | undefined)[]
) {
  const ids = idsOf(items);
  const [state, setState] = useState<{
    items: T[];
    ids: string;
    generation: number;
    phase: Phase;
  }>({ items: [], ids: "", generation: 0, phase: "gone" });

  const changed = !loading && ids !== state.ids;

  // the results whose first thumbnails are loaded, or have run out of time
  const [preloadedIds, setPreloadedIds] = useState<string>();

  // the new results are here: load their first thumbnails, while the current
  // ones fade out
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per set of scenes, not per update to them
  useEffect(() => {
    if (!changed) return;

    let stale = false;
    // once each: many scenes can share a studio
    const urls = new Set(
      items
        .slice(0, PRELOAD_COUNT)
        .flatMap(imagesOf)
        .filter((url): url is string => !!url)
    );

    preloadImages(Array.from(urls)).then(() => {
      if (!stale) setPreloadedIds(ids);
    });

    return () => {
      stale = true;
    };
  }, [changed, ids]);

  // in a ref, not the effect's cleanup: the effect re-runs as the phase moves
  // to "out", and that mustn't cancel it
  const outTimer = useRef<number>();
  useEffect(() => () => window.clearTimeout(outTimer.current), []);

  // the new results are here: fade the current ones out
  useEffect(() => {
    if (!changed || state.phase !== "in") return;

    if (state.items.length === 0) {
      setState((s) => ({ ...s, phase: "gone" }));
      return;
    }

    setState((s) => ({ ...s, phase: "out" }));
    outTimer.current = window.setTimeout(
      () => setState((s) => ({ ...s, phase: "gone" })),
      OUT_DURATION
    );
  }, [changed, state.phase, state.items.length]);

  // the old ones are away and the first thumbnails ready: bring the new ones in
  useEffect(() => {
    if (state.phase !== "gone" || loading) return;
    if (ids !== state.ids && ids !== preloadedIds) return;
    setState((s) => ({
      items,
      ids,
      generation: s.generation + 1,
      phase: "in",
    }));
  }, [state.phase, state.ids, loading, items, ids, preloadedIds]);

  const fresh = state.phase === "in" && ids === state.ids;

  return {
    // the same scenes, updated, while showing; otherwise the held ones
    shown: fresh ? items : state.items,
    generation: state.generation,
    phase: state.phase,
    // the held scenes, dimmed while the next ones load
    dim: state.phase === "out" || (loading && state.items.length > 0),
    // loading with nothing to show yet: the first load, or after no results
    waiting: loading && state.items.length === 0,
  };
}

function markReady(img: HTMLImageElement) {
  if (!img.classList.contains("img-preloaded")) img.classList.add("img-ready");
}

// Shown as its card rises, without a fade of its own. Eager, as a lazy image
// waits for its turn even when it's already in the cache.
function markPreloaded(img: HTMLImageElement) {
  img.loading = "eager";
  img.classList.add("img-preloaded");
}

// Each card's place in the wave (--i), and the step between places
// (--results-in-step). The wave spreads diagonally from the top-left corner: a
// card's place is its row plus its column, so the page moves as one front
// rather than row after row. Cards below the fold all take the place after the
// last one on screen: there's no one to see them, and they're there when
// scrolled to. A screen with many places gets a shorter step, so the wave stays
// short.
function stagger(el: HTMLElement) {
  const cards = Array.from(el.querySelectorAll<HTMLElement>(CARDS));
  const fold = window.innerHeight;

  // offsetTop, as the entrance already has each card moved down by its height
  let row = -1;
  let column = 0;
  let rowTop: number | undefined;
  const places = cards.map((c) => {
    if (c.offsetTop !== rowTop) {
      rowTop = c.offsetTop;
      row++;
      column = 0;
    }
    return row + column++;
  });

  // the same move is in the rect, so a card's real top is a height above it
  const lastPlace = Math.max(
    0,
    ...places.filter((_, i) => {
      const rect = cards[i].getBoundingClientRect();
      return rect.top - rect.height < fold;
    })
  );

  cards.forEach((c, i) => {
    c.style.setProperty("--i", String(Math.min(places[i], lastPlace + 1)));
  });

  const step = lastPlace > 0 ? Math.min(IN_STEP, IN_SPREAD / lastPlace) : 0;
  el.style.setProperty("--results-in-step", `${step}ms`);
}

const timings = {
  "--results-out": `${OUT_DURATION}ms`,
  "--results-in": `${IN_DURATION}ms`,
  "--results-in-step": `${IN_STEP}ms`,
} as React.CSSProperties;

export const SceneResults: React.FC<{
  generation: number;
  phase: Phase;
  dim: boolean;
  displayMode: DisplayMode;
  children: React.ReactNode;
}> = ({ generation, phase, dim, displayMode, children }) => {
  const ref = useRef<HTMLDivElement>(null);

  // Per generation and display mode (a new mode mounts new cards, which rise
  // too), before the first paint: the rising order; and one listener for every
  // image's load and error, which don't bubble but do pass through ancestors in
  // the capture phase.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measured for each new set of cards
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    stagger(el);

    // images loaded ahead of their cards, and those already loaded (from the
    // cache) before we were listening
    el.querySelectorAll("img").forEach((img) => {
      if (preloaded.has(img.src)) markPreloaded(img);
      else if (img.complete) markReady(img);
    });

    function onLoad(e: Event) {
      if (e.target instanceof HTMLImageElement) markReady(e.target);
    }

    el.addEventListener("load", onLoad, true);
    el.addEventListener("error", onLoad, true);
    return () => {
      el.removeEventListener("load", onLoad, true);
      el.removeEventListener("error", onLoad, true);
    };
  }, [generation, displayMode]);

  return (
    // Not keyed by generation: the grid inside would mount afresh and lay
    // the cards out at a default width until it had measured itself, a
    // snap partway through the rise. The entrance plays anyway, as the
    // cards get their animation only with the move from "gone" to "in".
    <div
      ref={ref}
      className={cx("scene-results", `results-${phase}`, {
        "results-dim": dim,
      })}
      style={timings}
    >
      {children}
    </div>
  );
};
