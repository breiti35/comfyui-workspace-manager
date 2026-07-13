import { Box, Grid, GridItem } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { ModelsListRespItem } from "../types";
import { ModelItem } from "./ModelItem";

interface Props {
  list: ModelsListRespItem[];
  onOpenDetail: (data: ModelsListRespItem) => void;
}

const BATCH = 48;

export function ModelsList({ list, onOpenDetail }: Props) {
  // Dependency-free windowing: render only the first `visibleCount` cards and
  // grow the window as a bottom sentinel scrolls into view. Keeps React's
  // render + the mounted cards' work bounded no matter how big the collection.
  const [visibleCount, setVisibleCount] = useState(BATCH);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Restart the window whenever the underlying list changes (new category,
  // search, sort) so we don't keep a huge window across a smaller list.
  useEffect(() => {
    setVisibleCount(BATCH);
  }, [list]);

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
      <Grid
        templateColumns="repeat(auto-fill, minmax(190px, 1fr))"
        gap={3}
        marginTop={2}
      >
        {shown.map((v) => (
          <GridItem key={v.model_name + v.date.getTime()}>
            <ModelItem data={v} onOpenDetail={onOpenDetail} />
          </GridItem>
        ))}
      </Grid>
      {visibleCount < list.length && <Box ref={sentinelRef} h="1px" />}
    </>
  );
}
