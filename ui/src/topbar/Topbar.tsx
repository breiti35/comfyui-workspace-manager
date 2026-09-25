import { Button, HStack, IconButton, Tooltip } from "@chakra-ui/react";
import Draggable from "../components/Draggable";
import {
  IconBook2,
  IconDeviceFloppy,
  IconFolder,
  IconGripVertical,
  IconPhoto,
  IconSettings,
  IconTriangleInvertedFilled,
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
import { TOPBAR_BUTTON_HEIGHT } from "../const";
import TopbarNewWorkflowButton from "./TopbarNewWorkflowButton";
import { useT } from "../i18n/LanguageContext";
const AppIsDirtyEventListener = lazy(() => import("./AppIsDirtyEventListener"));
const ModelManagerTopbar = lazy(
  () => import("../model-manager/topbar/ModelManagerTopbar"),
);
const SpotlightSearch = lazy(() => import("../components/SpotlightSearch"));
const WorkspaceSettingsModal = lazy(
  () => import("../RecentFilesDrawer/WorkspaceSettingsModal"),
);
const PromptLibraryModal = lazy(
  () => import("../prompt-library/PromptLibraryModal"),
);

interface Props {
  curFlowName: string | null;
  setCurFlowName: (newName: string) => void;
}
export function Topbar({ curFlowName, setCurFlowName }: Props) {
  const { t } = useT();
  const { isDirty, saveCurWorkflow, openRoute, closeRoute, curFlowID, route } =
    useContext(WorkspaceContext);
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
  return (
    <Draggable
      onDragEnd={(position: { x: number; y: number }) => {
        updatePanelPosition({ top: position.y, left: position.x }, true);
      }}
      dragIconId="dragPanelIcon"
    >
      <HStack
        style={{
          // Vertical padding bumped by 1px over horizontal (5px vs 4px) so
          // the bar's total height lands at 42px, matching ComfyUI's own
          // toolbar height - horizontal spacing is left untouched.
          padding: "5px 4px",
          position: "fixed",
          ...positionStyle,
        }}
        backgroundColor="comfy.topbarBg"
        // Chakra's "md" radius is 6px, matching ComfyUI's own toolbar corner
        // radius exactly (previously "lg"/8px, which read as a mismatched,
        // separate shape next to ComfyUI's bar).
        borderRadius="md"
        justifyContent={"space-between"}
        alignItems={"center"}
        gap={1}
        draggable={false}
        id="workspaceManagerPanel"
        className="workspaceManagerPanel"
      >
        <Tooltip label={t("topbar.recentFilesTooltip")}>
          <Button
            size={"sm"}
            variant={"ghost"}
            aria-label={t("topbar.workspaceFolderAria")}
            height={TOPBAR_BUTTON_HEIGHT + "px"}
            onClick={() => openRoute("recentFlows")}
            px={2}
          >
            <HStack gap={1}>
              <IconFolder size={21} />
              <IconTriangleInvertedFilled size={8} />
            </HStack>
          </Button>
        </Tooltip>
        <Suspense fallback={<div style={{ width: "60px" }} />}>
          <ModelManagerTopbar />
        </Suspense>
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
            <IconLock color="white" size={20} />
          </Tooltip>
        )}
        {curFlowID && (
          <HStack gap={"4px"}>
            <Tooltip label={t("topbar.openGalleryTooltip")}>
              <IconButton
                onClick={() => openRoute("gallery")}
                icon={<IconPhoto size={22} color="white" />}
                size={"sm"}
                aria-label={t("topbar.openGalleryAria")}
                variant={"ghost"}
              />
            </Tooltip>
            <DropdownTitle />
          </HStack>
        )}
        {curFlowID && isDirty ? (
          <Tooltip label={t("topbar.saveWorkflowTooltip")}>
            <IconButton
              onClick={() => saveCurWorkflow()}
              icon={<IconDeviceFloppy size={23} color="white" />}
              size={"xs"}
              paddingY={4}
              aria-label={t("topbar.saveWorkspaceAria")}
              variant={"ghost"}
            />
          </Tooltip>
        ) : (
          <div style={{ width: 1 }} />
        )}
        <VersionNameTopbar />
        <AppIsDirtyEventListener />
        <Tooltip label={t("topbar.promptLibraryTooltip")}>
          <IconButton
            onClick={() => openRoute("promptLibrary")}
            icon={<IconBook2 size={20} color="white" />}
            size={"sm"}
            aria-label={t("topbar.promptLibraryAria")}
            variant={"ghost"}
          />
        </Tooltip>
        <Tooltip label={t("topbar.settingsTooltip")}>
          <IconButton
            onClick={() => openRoute("settings")}
            icon={<IconSettings size={20} color="white" />}
            size={"sm"}
            aria-label={t("topbar.settingsAria")}
            variant={"ghost"}
          />
        </Tooltip>
        <Tooltip label={t("topbar.dragToolbarTooltip")}>
          <IconGripVertical
            id="dragPanelIcon"
            className="dragPanelIcon"
            cursor="move"
            size={15}
            color="white"
          />
        </Tooltip>
        {route === "spotlightSearch" && <SpotlightSearch />}
        {route === "settings" && (
          <Suspense fallback={null}>
            <WorkspaceSettingsModal onClose={closeRoute} />
          </Suspense>
        )}
        {route === "promptLibrary" && (
          <Suspense fallback={null}>
            <PromptLibraryModal onClose={closeRoute} />
          </Suspense>
        )}
      </HStack>
    </Draggable>
  );
}
