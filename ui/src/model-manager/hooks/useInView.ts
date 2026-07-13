import { useEffect, useRef, useState } from "react";

/**
 * Fires once when the element first scrolls near the viewport. Used to defer a
 * card's heavy work (image load + Civitai lookup) until it's actually about to
 * be shown, so a large model list doesn't do all that work up front.
 *
 * `rootMargin` pre-triggers before the element is strictly on screen so content
 * is ready by the time the user reaches it.
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
