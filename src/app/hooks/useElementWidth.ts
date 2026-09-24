import { useEffect, useRef, useState } from "react";

/**
 * Measures an element's rendered width so map/graphics layers can project at
 * the real pixel size of their container.
 *
 * Why this exists: the slippy-map viewport maths (tiles + route geometry) has
 * to know the container width. A hardcoded 400px assumption put tiles on the
 * left third of a tablet screen while the route SVG scaled independently, so
 * the route drifted off the streets it was drawn on.
 *
 * SSR-safe (the fallback is used for the first paint), degrades to a window
 * resize listener when ResizeObserver is unavailable, and never loops: the
 * observer is attached once and only writes when the value actually changes.
 */
export function useElementWidth<T extends HTMLElement>(fallback = 400, observeKey?: unknown) {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const measure = () => {
      const next = Math.round(node.getBoundingClientRect().width);
      if (next > 0) setWidth((current) => (current === next ? current : next));
    };

    measure();

    if (typeof ResizeObserver === "undefined") {
      if (typeof window === "undefined") return;
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
    // `observeKey` re-attaches the observer when the measured element is
    // replaced in the tree (e.g. a map switching to its fullscreen shell).
  }, [observeKey]);

  return { ref, width };
}

export default useElementWidth;
