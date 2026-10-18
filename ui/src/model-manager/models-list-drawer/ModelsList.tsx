import { useEffect, useRef, useState } from "react";
import { ModelsListRespItem } from "../types";
import { ModelItem } from "./ModelItem";

interface Props {
  list: ModelsListRespItem[];
  /**
   * Changes when the user changes what they're looking at (category,
   * search, sort, favorites filter). Only then does the render window reset -
   * a new list identity alone (background refresh) keeps the scroll depth.
   */
  resetKey: string;
  onOpenDetail: (data: ModelsListRespItem) => void;
  compact?: boolean;
}

const BATCH = 48;

export function ModelsList({ list, resetKey, onOpenDetail, compact }: Props) {
  // Dependency-free windowing: render only the first `visibleCount` cards and
  // grow the window as a bottom sentinel scrolls into view. Keeps React's
  // render + the mounted cards' work bounded no matter how big the collection.
  const [visibleCount, setVisibleCount] = useState(BATCH);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Restart the window when the view changes (new category, search, sort) so
  // we don't keep a huge window across a smaller list. Deliberately not keyed
  // on `list`: that array is rebuilt on every websocket push / hashing poll.
  useEffect(() => {
    setVisibleCount(BATCH);
  }, [resetKey]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleCount((c) => Math.min(c + BATCH, list.length));
        }
      },
      { rootMargin: "800px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [list.length]);

  const shown = list.slice(0, visibleCount);

  return (
    <>
      <div className={"lib-grid" + (compact ? " compact" : "")}>
        {shown.map((v) => (
          <ModelItem
            key={v.model_name + "@" + v.model_type}
            data={v}
            onOpenDetail={onOpenDetail}
          />
        ))}
      </div>
      {visibleCount < list.length && (
        <div ref={sentinelRef} style={{ height: 1 }} />
      )}
    </>
  );
}
