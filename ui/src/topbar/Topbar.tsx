import { createPortal } from "react-dom";
import { Button, HStack, IconButton, Tooltip } from "@chakra-ui/react";
import Draggable from "../components/Draggable";
import {
  IconBooks,
  IconDeviceFloppy,
  IconGripVertical,
  IconLayoutSidebarRight,
  IconPhoto,
  IconSettings,
  IconLock,
} from "@tabler/icons-react";
import DropdownTitle from "../components/DropdownTitle";
import {
  Suspense,
  lazy,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import EditFlowName from "../components/EditFlowName";
import { WorkspaceContext } from "../WorkspaceContext";
import { PanelPosition } from "../types/dbTypes";
import "./Topbar.css";
import VersionNameTopbar from "./VersionNameTopbar";
import { userSettingsTable, workflowsTable } from "../db-tables/WorkspaceDB";
import TopbarNewWorkflowButton from "./TopbarNewWorkflowButton";
import { useT } from "../i18n/LanguageContext";
import { isLibrarySection } from "../library/libraryContext";
import {
  getLastLibrarySection,
  setLibraryDocked,
  useLibraryDocked,
} from "../library/libraryState";
const AppIsDirtyEventListener = lazy(() => import("./AppIsDirtyEventListener"));
const ModelManagerTopbar = lazy(
  () => import("../model-manager/topbar/ModelManagerTopbar"),
);
const SpotlightSearch = lazy(() => import("../components/SpotlightSearch"));

interface Props {
  curFlowName: string | null;
  setCurFlowName: (newName: string) => void;
}
// Matches the buttons of ComfyUI's own action bar next to it (32px, 6px radius,
// theme text colour, subtle hover) so the bar reads as one piece.
const BAR_BTN = {
  variant: "ghost",
  height: "32px",
  minWidth: "32px",
  borderRadius: "6px",
  color: "var(--fg-color, #fff)",
  _hover: { bg: "rgba(128,128,128,0.22)" },
  _focus: { boxShadow: "none" },
  _focusVisible: { boxShadow: "0 0 0 2px #c77a12" },
} as const;

export function Topbar({ curFlowName, setCurFlowName }: Props) {
  const { t } = useT();
  const {
    isDirty,
    saveCurWorkflow,
    openRoute,
    resetRoutes,
    curFlowID,
    route,
    routeStack,
  } = useContext(WorkspaceContext);
  const docked = useLibraryDocked();
  // Embedded mode: live inside ComfyUI's own action bar (the row with the Run
  // button), where other add-ons (e.g. resource monitors) dock too, so none
  // of them can cover another. Falls back to the saved, draggable floating
  // bar when that container can't be found (other ComfyUI frontend versions).
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const ensure = () => {
      setHost((cur) => {
        if (cur && cur.isConnected) return cur;
        const row = document.querySelector(
          ".actionbar .p-panel-content > div",
        );
        if (!row) return cur ? null : cur;
        const el = document.createElement("div");
        el.className = "workspaceManagerHost";
        el.style.display = "contents";
        row.insertBefore(el, row.firstChild);
        return el;
      });
    };
    ensure();
    const id = window.setInterval(ensure, 500);
    return () => {
      window.clearInterval(id);
      setHost((cur) => {
        cur?.remove();
        return null;
      });
    };
  }, []);
  const libraryOpen = routeStack.some(isLibrarySection);
  const [positionStyle, setPositionStyle] = useState<PanelPosition>();
  const updatePanelPosition: (
    position?: PanelPosition,
    needUpdateDB?: boolean,
  ) => void = useCallback(
    (position?: PanelPosition, needUpdateDB: boolean = false) => {
      const { top: curTop = 0, left: curLeft = 0 } = positionStyle || {};
      let { top = 0, left = 0 } = position ?? {};
      top += curTop;
      left += curLeft;
      const clientWidth = document.documentElement.clientWidth;
      const clientHeight = document.documentElement.clientHeight;
      const panelElement = document.getElementById("workspaceManagerPanel");
      const offsetWidth = panelElement?.offsetWidth || 392;

      if (top + 36 > clientHeight) top = clientHeight - 36;
      if (left + offsetWidth >= clientWidth) left = clientWidth - offsetWidth;

      setPositionStyle({ top: Math.max(0, top), left: Math.max(0, left) });

      needUpdateDB &&
        userSettingsTable?.upsert({
          topBarStyle: { top, left },
        });
    },
    [positionStyle],
  );
  useEffect(() => {
    userSettingsTable?.getSetting("topBarStyle").then((res) => {
      updatePanelPosition(res, false);
    });
  }, []);
  if (!positionStyle) {
    return null;
  }
  const groups = (
    <>
        {/* Group 1: the current workflow */}
        <HStack gap={1} role="group" aria-label={t("library.workflowGroup")}>
          <TopbarNewWorkflowButton />
          <EditFlowName
            isDirty={isDirty}
            displayName={curFlowName ?? ""}
            updateFlowName={(newName) => {
              setCurFlowName(newName);
              requestAnimationFrame(() => {
                updatePanelPosition();
              });
            }}
          />
          {workflowsTable?.curWorkflow?.saveLock && (
            <Tooltip label={t("topbar.workflowLockedTooltip")}>
              <IconLock size={18} color="var(--fg-color, #fff)" />
            </Tooltip>
          )}
          {curFlowID && isDirty && (
            <Tooltip label={t("topbar.saveWorkflowTooltip")}>
              <IconButton
                onClick={() => saveCurWorkflow()}
                icon={<IconDeviceFloppy size={18} />}
                {...BAR_BTN}
                aria-label={t("topbar.saveWorkspaceAria")}
                variant={"ghost"}
              />
            </Tooltip>
          )}
          <VersionNameTopbar />
          <AppIsDirtyEventListener />
          {curFlowID && (
            <HStack gap={"4px"}>
              <DropdownTitle />
              <Tooltip label={t("library.galleryOfWorkflow")}>
                <Button
                  onClick={() => openRoute("gallery")}
                  leftIcon={<IconPhoto size={18} />}
                  {...BAR_BTN}
                  aria-label={t("topbar.openGalleryAria")}
                  px={3}
                  fontWeight={500}
                >
                  {t("library.nav.gallery")}
                </Button>
              </Tooltip>
            </HStack>
          )}
        </HStack>
        <div
          aria-hidden
          style={{
            width: 1,
            alignSelf: "stretch",
            background: "rgba(128,128,128,0.35)",
          }}
        />
        {/* Group 2: the library */}
        <HStack gap={1} role="group" aria-label={t("library.title")}>
          <Tooltip label={t("library.openTooltip")}>
            <Button
              onClick={() =>
                libraryOpen ? resetRoutes() : openRoute(getLastLibrarySection())
              }
              leftIcon={<IconBooks size={18} />}
              {...BAR_BTN}
              px={3}
              fontWeight={600}
              bg={libraryOpen ? "var(--lib-amber, #c77a12)" : "rgba(128,128,128,0.18)"}
              color={libraryOpen ? "var(--lib-on-amber, #1d1a17)" : "var(--fg-color, #fff)"}
              _hover={{ bg: libraryOpen ? "#d98a1c" : "rgba(128,128,128,0.32)" }}
              aria-pressed={libraryOpen}
            >
              {t("library.openButton")}
            </Button>
          </Tooltip>
          <Suspense fallback={<div style={{ width: "28px" }} />}>
            <ModelManagerTopbar />
          </Suspense>
          <Tooltip label={docked ? t("library.undock") : t("library.dock")}>
            <IconButton
              onClick={() => setLibraryDocked(!docked)}
              icon={<IconLayoutSidebarRight size={18} />}
              {...BAR_BTN}
              aria-label={docked ? t("library.undock") : t("library.dock")}
              aria-pressed={docked}
              bg={docked ? "rgba(199,122,18,0.4)" : undefined}
            />
          </Tooltip>
          <Tooltip label={t("topbar.settingsTooltip")}>
            <IconButton
              onClick={() => openRoute("settings")}
              icon={<IconSettings size={18} />}
              {...BAR_BTN}
              aria-label={t("topbar.settingsAria")}
            />
          </Tooltip>
          {!host && (
            <Tooltip label={t("topbar.dragToolbarTooltip")}>
              <IconGripVertical
                id="dragPanelIcon"
                className="dragPanelIcon"
                cursor="move"
                size={15}
                color="white"
              />
            </Tooltip>
          )}
        </HStack>
        {route === "spotlightSearch" && <SpotlightSearch />}
    </>
  );
  if (host) {
    return createPortal(
      <HStack
        gap={3}
        alignItems="center"
        id="workspaceManagerPanel"
        // "workspace_manager" brings the scoped CSS reset along: this subtree
        // lives in ComfyUI's DOM, outside the app root that normally carries it.
        className="workspace_manager workspaceManagerPanel"
        // docked library is already open: the bar steps aside (kept mounted,
        // it hosts the dirty-state listener) and returns when it closes
        style={{ display: docked && libraryOpen ? "none" : undefined }}
      >
        {groups}
      </HStack>,
      host,
    );
  }
  return (
    <Draggable
      onDragEnd={(position: { x: number; y: number }) => {
        updatePanelPosition({ top: position.y, left: position.x }, true);
      }}
      dragIconId="dragPanelIcon"
    >
      <HStack
        style={{
          // 5px vertical padding lands the bar at 42px, ComfyUI's toolbar height.
          padding: "5px 8px",
          position: "fixed",
          // above the library's dimmed canvas, so the bar stays usable
          zIndex: 3,
          // Docked library is already open: the bar steps aside (kept mounted,
          // it hosts the dirty-state listener) and returns when the library closes.
          display: docked && libraryOpen ? "none" : undefined,
          ...positionStyle,
        }}
        // Warm-tinted ComfyUI menu colour: same family as the library.
        backgroundColor="color-mix(in srgb, var(--comfy-menu-bg, #262729) 92%, #b07a3a 8%)"
        borderRadius="2px"
        justifyContent={"space-between"}
        alignItems={"center"}
        gap={3}
        draggable={false}
        id="workspaceManagerPanel"
        className="workspaceManagerPanel"
      >
        {groups}
      </HStack>
    </Draggable>
  );
}
