import { copyText } from "../../utils/copyToClipboard";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { IconCheck, IconCopy, IconExternalLink } from "@tabler/icons-react";
import { useT } from "../../i18n/LanguageContext";
import {
  getCompactScroll,
  saveCompactScroll,
  setCompactSearch,
  useCompactSearch,
  type CompactSection,
} from "./compactState";

/** One-click copy with a short "copied" state per id. */
export function useCopied(ms = 1400) {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = useCallback(
    (text: string, id: string) => {
      void copyText(text).then((ok) => {
        // clipboard unavailable or rejected: show nothing misleading
        if (!ok) return;
        setCopied(id);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(null), ms);
      });
    },
    [ms],
  );
  return { copied, copy };
}

export function CopyButton({
  label,
  done,
  onClick,
}: {
  label: string;
  done: boolean;
  onClick: () => void;
}) {
  const { t } = useT();
  const text = done ? t("compact.copied") : label;
  return (
    <button
      type="button"
      className={"lib-btn icon-sm lib-cmp-copy" + (done ? " done" : "")}
      title={text}
      aria-label={text}
      onClick={onClick}
    >
      {done ? <IconCheck size={15} /> : <IconCopy size={15} />}
      <span className="lib-cmp-sr" role="status">
        {done ? t("compact.copied") : ""}
      </span>
    </button>
  );
}

export function OpenButton({ onClick }: { onClick: () => void }) {
  const { t } = useT();
  return (
    <button
      type="button"
      className="lib-btn icon-sm"
      title={t("compact.openInLibrary")}
      aria-label={t("compact.openInLibrary")}
      onClick={onClick}
    >
      <IconExternalLink size={15} />
    </button>
  );
}

/**
 * Frame of one compact area: title + count, optional search field, scrolling
 * body (position remembered per area) and an optional foot line.
 */
export function CompactFrame({
  section,
  title,
  count,
  searchPlaceholder,
  restoreWhen = true,
  foot,
  children,
}: {
  section: CompactSection;
  title: string;
  count?: string;
  searchPlaceholder?: string;
  /** scroll position is applied once this is true (content has loaded) */
  restoreWhen?: boolean;
  foot?: ReactNode;
  children: ReactNode;
}) {
  const query = useCompactSearch(section);
  const scrollRef = useRef<HTMLDivElement>(null);
  const restored = useRef(false);

  useLayoutEffect(() => {
    if (!restoreWhen || restored.current || !scrollRef.current) return;
    restored.current = true;
    scrollRef.current.scrollTop = getCompactScroll(section);
  }, [restoreWhen, section]);

  return (
    <div className="lib-cmp-frame">
      <div className="lib-cmp-head">
        <h1 title={title}>{title}</h1>
        {count != null && <small>{count}</small>}
      </div>
      {searchPlaceholder != null && (
        <div className="lib-cmp-tools">
          <input
            className="lib-input"
            type="search"
            value={query}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            onChange={(e) => setCompactSearch(section, e.target.value)}
          />
        </div>
      )}
      <div
        ref={scrollRef}
        className="lib-cmp-scroll"
        onScroll={(e) => {
          if (restored.current)
            saveCompactScroll(section, e.currentTarget.scrollTop);
        }}
      >
        {children}
      </div>
      {foot != null && <div className="lib-cmp-foot">{foot}</div>}
    </div>
  );
}
