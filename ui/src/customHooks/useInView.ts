import { useEffect, useRef, useState } from "react";

/**
 * Fires once when the element first scrolls near the viewport (or the nearest
 * scrollable ancestor's clipped viewport - IntersectionObserver accounts for
 * `overflow: auto/hidden` containers even with `root: null`), then stays
 * `true` forever. Used to defer a tile's heavy work (network image fetch,
 * rich hover markup) until it's actually about to be shown, so a large grid
 * doesn't render/request everything up front.
 *
 * Dependency-free (plain IntersectionObserver, no external lib). Shared by the
 * model cards (`ModelItem`, `InstallModelCard`) and the gallery grid tiles.
 *
 * `rootMargin` pre-triggers before the element is strictly on screen so
 * content is ready by the time the user scrolls to it.
 */
export function useInView<T extends HTMLElement>(rootMargin = "300px") {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView, rootMargin]);

  return { ref, inView };
}
