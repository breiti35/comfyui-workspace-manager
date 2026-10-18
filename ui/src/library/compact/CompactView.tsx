import {
  Suspense,
  lazy,
  useEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  IconBook2,
  IconBroadcast,
  IconDownload,
  IconFolder,
  IconPackage,
  IconPhoto,
  IconSettings,
} from "@tabler/icons-react";
import { useT } from "../../i18n/LanguageContext";
import type { TransKey } from "../../i18n/translations";
import ErrorBoundary from "../../components/ErrorBoundary";
import { useDockSections } from "./dockSections";
import {
  setCompactSection,
  useCompactSection,
  type CompactSection,
} from "./compactState";
import { setLibraryIntent } from "./libraryIntent";
import { OpenInLibraryContext, type OpenInLibrary } from "./openInLibraryContext";
import "./compact.css";

const LiveView = lazy(() => import("./LiveView"));
const ModelsView = lazy(() => import("./ModelsView"));
const PromptsView = lazy(() => import("./PromptsView"));
const DownloadsView = lazy(() => import("./DownloadsView"));
// The window's own section content, shown narrow in the bar.
const WorkflowsSection = lazy(() => import("../WorkflowsSection"));
const GalleryModal = lazy(() => import("../../gallery/GalleryModal"));
const WorkspaceSettingsModal = lazy(
  () => import("../../RecentFilesDrawer/WorkspaceSettingsModal"),
);

const ENTRIES: Record<
  CompactSection,
  { label: TransKey; icon: ReactNode }
> = {
  live: { label: "compact.nav.live", icon: <IconBroadcast size={18} /> },
  models: { label: "compact.nav.models", icon: <IconPackage size={18} /> },
  prompts: { label: "library.nav.prompts", icon: <IconBook2 size={18} /> },
  workflows: { label: "library.nav.workflows", icon: <IconFolder size={18} /> },
  gallery: { label: "library.nav.gallery", icon: <IconPhoto size={18} /> },
  downloads: { label: "library.nav.downloads", icon: <IconDownload size={18} /> },
  settings: { label: "library.nav.settings", icon: <IconSettings size={18} /> },
};

/**
 * Docked bar: a narrow cabinet column (same laschen as the window's sidebar,
 * icon only, name in tooltip + aria-label) and one compact area next to it.
 * Area, search and scroll live in compactState, so they survive undocking.
 */
export default function CompactView({
  onOpenInLibrary,
  errorLabel,
  workflowsReady,
  onClickNewFlow,
  onClose,
}: {
  onOpenInLibrary: OpenInLibrary;
  errorLabel: string;
  /** workflow DB loaded - the workflows area needs it */
  workflowsReady: boolean;
  onClickNewFlow: () => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const stored = useCompactSection();
  const shown = useDockSections();
  // An area that was switched off falls back to the first visible one.
  const active = shown.includes(stored) ? stored : shown[0];
  useEffect(() => {
    if (active !== stored) setCompactSection(active);
  }, [active, stored]);
  const railRef = useRef<HTMLElement>(null);

  // A hand-over that was never picked up must not fire on a later window visit.
  useEffect(() => setLibraryIntent(null), []);

  // Arrow keys move between the rail rows (roving focus, like the sidebar).
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const rows = Array.from(
      railRef.current?.querySelectorAll<HTMLButtonElement>(".lib-row") ?? [],
    );
    const i = rows.indexOf(document.activeElement as HTMLButtonElement);
    if (i === -1) return;
    e.preventDefault();
    rows[(i + (e.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length]?.focus();
  };

  return (
    <OpenInLibraryContext.Provider value={onOpenInLibrary}>
      <nav
        ref={railRef}
        className="lib-cabinet narrow"
        aria-label={t("compact.rail")}
        onKeyDown={onKeyDown}
      >
        <div className="lib-grp" />
        {shown.map((s) => {
          const on = s === active;
          const label = t(ENTRIES[s].label);
          return (
            <button
              key={s}
              type="button"
              className={"lib-row" + (on ? " act" : "")}
              aria-current={on ? "page" : undefined}
              title={label}
              aria-label={label}
              onClick={() => setCompactSection(s)}
            >
              <span className="tab" />
              <span className="ico">{ENTRIES[s].icon}</span>
            </button>
          );
        })}
      </nav>
      <div className="lib-main lib-cmp">
        <ErrorBoundary label={errorLabel}>
          <Suspense fallback={null}>
            {active === "live" && <LiveView />}
            {active === "models" && <ModelsView />}
            {active === "prompts" && <PromptsView />}
            {active === "workflows" && workflowsReady && (
              <WorkflowsSection onClickNewFlow={onClickNewFlow} />
            )}
            {active === "gallery" && <GalleryModal onclose={onClose} />}
            {active === "downloads" && <DownloadsView />}
            {active === "settings" && (
              <WorkspaceSettingsModal onClose={onClose} />
            )}
          </Suspense>
        </ErrorBoundary>
      </div>
    </OpenInLibraryContext.Provider>
  );
}
