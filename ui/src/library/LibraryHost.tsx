import {
  Suspense,
  lazy,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  IconArrowsLeftRight,
  IconLayoutSidebarRight,
  IconWindowMaximize,
  IconX,
} from "@tabler/icons-react";
import { WorkspaceContext } from "../WorkspaceContext";
import { useT } from "../i18n/LanguageContext";
import ErrorBoundary from "../components/ErrorBoundary";
import { mediaTable, workflowsTable } from "../db-tables/WorkspaceDB";
import { listPrompts } from "../prompt-library/promptsStore";
import { useDownloads } from "../model-manager/install-models/useDownloads";
import {
  LibraryContext,
  isLibrarySection,
  type LibrarySection,
} from "./libraryContext";
import {
  DOCK_LEFT_OFFSET,
  DOCK_MAX_WIDTH,
  DOCK_MIN_WIDTH,
  rememberLibrarySection,
  setLibraryDocked,
  setLibraryDockSide,
  useLibraryDockSide,
  setLibraryDockWidth,
  useLibraryDocked,
  useLibraryDockWidth,
} from "./libraryState";
import LibrarySidebar from "./LibrarySidebar";
import "./library.css";

const WorkflowsSection = lazy(() => import("./WorkflowsSection"));
const GalleryModal = lazy(() => import("../gallery/GalleryModal"));
const PromptLibraryModal = lazy(
  () => import("../prompt-library/PromptLibraryModal"),
);
const WorkspaceSettingsModal = lazy(
  () => import("../RecentFilesDrawer/WorkspaceSettingsModal"),
);
const ModelsPanel = lazy(() => import("../model-manager/ModelsPanel"));
const DownloadsSection = lazy(() => import("./sections/DownloadsSection"));

// Elements that handle Esc themselves (menus, popovers, dialogs opened from a
// section). The library must not also back out when Esc was meant for them.
const OWN_ESC = '[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"],.chakra-popover__popper';

interface Props {
  /** workflow DB loaded - the workflows section needs it */
  ready: boolean;
  onClickNewFlow: () => void;
}

/**
 * One library, two presentations: a large window over a dimmed canvas, or a
 * docked panel on the right that leaves the canvas usable. Sections are the
 * sibling routes of routeStack.ts; switching sections replaces, Esc steps
 * back one level (section detail first, then the library), the X closes all.
 * Once opened the host stays mounted (hidden), so Models keep their state
 * until the page is reloaded.
 */
export default function LibraryHost({ ready, onClickNewFlow }: Props) {
  const { t } = useT();
  const { route, routeStack, closeRoute, resetRoutes, curFlowID } =
    useContext(WorkspaceContext);
  const docked = useLibraryDocked();
  const dockWidth = useLibraryDockWidth();
  const dockSide = useLibraryDockSide();
  const downloads = useDownloads();

  // Active section = topmost library route in the stack, so a dialog opened
  // from a section (version history, share ...) keeps the library visible.
  const active = useMemo(() => {
    for (let i = routeStack.length - 1; i >= 0; i--) {
      const r = routeStack[i];
      if (isLibrarySection(r)) return r;
    }
    return null;
  }, [routeStack]);
  const isOpen = active != null;

  const [everOpened, setEverOpened] = useState(false);
  const [modelsVisited, setModelsVisited] = useState(false);
  useEffect(() => {
    if (isOpen) setEverOpened(true);
    if (active === "modelList" || active === "installModels")
      setModelsVisited(true);
    if (active) rememberLibrarySection(active);
  }, [isOpen, active]);

  const subLevels = useRef<Partial<Record<LibrarySection, () => void>>>({});
  const setSubLevel = useCallback(
    (s: LibrarySection, close: (() => void) | null) => {
      if (close) subLevels.current[s] = close;
      else delete subLevels.current[s];
    },
    [],
  );

  const dismiss = useCallback(() => {
    const sub = active ? subLevels.current[active] : undefined;
    if (sub) sub();
    else closeRoute();
  }, [active, closeRoute]);

  const rootRef = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  // Esc: one level back. Only while a library section is the current route.
  useEffect(() => {
    if (!isOpen || !isLibrarySection(route)) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const target = e.target as Element | null;
      // Docked, the canvas stays usable: Esc there is not ours.
      if (docked && !rootRef.current?.contains(target)) return;
      const own = target?.closest?.(OWN_ESC);
      if (own && own !== rootRef.current) return;
      e.preventDefault();
      dismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, route, dismiss, docked]);

  // Focus returns to whatever opened the library.
  useEffect(() => {
    if (isOpen) {
      opener.current = document.activeElement as HTMLElement | null;
      requestAnimationFrame(() => rootRef.current?.focus());
    } else if (opener.current) {
      opener.current.focus?.();
      opener.current = null;
    }
  }, [isOpen]);

  // Docked panel starts where ComfyUI's own content area starts (below its
  // tab bar), not at a fixed pixel row.
  const [dockTop, setDockTop] = useState(52);
  useEffect(() => {
    if (!isOpen || !docked) return;
    const measure = () => {
      const rail = document.querySelector(".side-tool-bar-container");
      if (rail) setDockTop(Math.round(rail.getBoundingClientRect().top));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [isOpen, docked]);

  const [counts, setCounts] = useState<Partial<Record<LibrarySection, number>>>({});
  useEffect(() => {
    if (!isOpen || !ready) return;
    let cancelled = false;
    (async () => {
      const [flows, media, prompts] = await Promise.all([
        workflowsTable?.listAll().catch(() => []) ?? [],
        mediaTable?.listAll().catch(() => []) ?? [],
        listPrompts().catch(() => []),
      ]);
      if (!cancelled)
        setCounts({
          recentFlows: flows.length,
          gallery: media.length,
          promptLibrary: prompts.length,
        });
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, ready, active, curFlowID]);

  const dlCount = downloads.active.length + downloads.pending.length;
  const allCounts = { ...counts, downloads: dlCount || undefined };

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const move = (ev: PointerEvent) =>
      setLibraryDockWidth(
        dockSide === "left"
          ? ev.clientX - DOCK_LEFT_OFFSET
          : window.innerWidth - ev.clientX,
      );
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const ctx = useMemo(
    () => ({ docked, closeAll: resetRoutes, setSubLevel }),
    [docked, resetRoutes, setSubLevel],
  );

  if (!everOpened) return null;

  const section = active ?? "modelList";
  const body = (
    <>
      <LibrarySidebar active={section} narrow={docked} counts={allCounts} />
      <div className="lib-main">
        <ErrorBoundary label={t("library.errorBoundary")}>
          <Suspense fallback={null}>
            {modelsVisited && (
              <div
                className="lib-section"
                style={{
                  display:
                    section === "modelList" || section === "installModels"
                      ? undefined
                      : "none",
                }}
              >
                <ModelsPanel
                  route={section === "installModels" ? "installModels" : "modelList"}
                />
              </div>
            )}
            {isOpen && ready && section === "recentFlows" && (
              <WorkflowsSection onClickNewFlow={onClickNewFlow} />
            )}
            {isOpen && section === "gallery" && (
              <GalleryModal onclose={closeRoute} />
            )}
            {isOpen && section === "promptLibrary" && (
              <PromptLibraryModal onClose={closeRoute} />
            )}
            {isOpen && section === "settings" && (
              <WorkspaceSettingsModal onClose={closeRoute} />
            )}
            {isOpen && section === "downloads" && <DownloadsSection />}
          </Suspense>
        </ErrorBoundary>
      </div>
    </>
  );

  const dockToggle = (
    <button
      type="button"
      className="lib-dock-toggle"
      onClick={() => setLibraryDocked(!docked)}
      title={docked ? t("library.undock") : t("library.dock")}
      aria-label={docked ? t("library.undock") : t("library.dock")}
    >
      {docked ? <IconWindowMaximize size={16} /> : <IconLayoutSidebarRight size={16} />}
    </button>
  );

  return (
    <LibraryContext.Provider value={ctx}>
      <div
        className="lib-root"
        style={{ display: isOpen ? undefined : "none" }}
        data-docked={docked ? "1" : "0"}
      >
        {docked ? (
          <div
            ref={rootRef}
            tabIndex={-1}
            className={"lib-docked " + dockSide}
            style={{ width: dockWidth, top: dockTop, outline: "none" }}
            role="complementary"
            aria-label={t("library.title")}
          >
            <div
              className="lib-resize"
              onPointerDown={startResize}
              role="separator"
              aria-orientation="vertical"
              aria-valuemin={DOCK_MIN_WIDTH}
              aria-valuemax={DOCK_MAX_WIDTH}
              aria-valuenow={dockWidth}
            />
            {/* Docked: the topbar may be moved away or covered, so the way
                back to the window (and out) lives in the dock itself. */}
            <div className="lib-dock-top">
              {dockToggle}
              <button
                type="button"
                className="lib-dock-toggle"
                onClick={() =>
                  setLibraryDockSide(dockSide === "left" ? "right" : "left")
                }
                title={t("library.swapSide")}
                aria-label={t("library.swapSide")}
              >
                <IconArrowsLeftRight size={16} />
              </button>
              <button
                type="button"
                className="lib-dock-toggle"
                onClick={resetRoutes}
                title={t("library.close")}
                aria-label={t("library.close")}
              >
                <IconX size={16} />
              </button>
            </div>
            {body}
          </div>
        ) : (
          <>
            <div className="lib-shade" onClick={dismiss} />
            <div
              ref={rootRef}
              tabIndex={-1}
              className="lib-window"
              style={{ outline: "none" }}
              role="dialog"
              aria-modal="true"
              aria-label={t("library.title")}
            >
              {body}
              {dockToggle}
            </div>
          </>
        )}
      </div>
    </LibraryContext.Provider>
  );
}
