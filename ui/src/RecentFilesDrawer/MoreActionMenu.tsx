import { ChangeEvent, useContext, useRef, useState } from "react";
import {
  IconButton,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Tooltip,
  useToast,
} from "@chakra-ui/react";
import {
  IconCopy,
  IconDotsVertical,
  IconExternalLink,
  IconLink,
  IconLock,
  IconLockOpen,
  IconUpload,
} from "@tabler/icons-react";
import { Workflow } from "../types/dbTypes";
import {
  mediaTable,
  userSettingsTable,
  workflowsTable,
} from "../db-tables/WorkspaceDB";
import { WorkspaceContext } from "../WorkspaceContext";
import { openWorkflowInNewTab } from "../utils";
import { fetchApi } from "../Api";
import { useT } from "../i18n/LanguageContext";

type Props = {
  workflow: Workflow;
};
export default function MoreActionMenu({ workflow }: Props) {
  const { t } = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const { onDuplicateWorkflow } = useContext(WorkspaceContext);

  const [isLocked, setIsLocked] = useState(workflow.saveLock ?? false);

  const onLockChange = async () => {
    const newLocked = !isLocked!;
    setIsLocked(newLocked);
    await workflowsTable?.updateMetaInfo(workflow.id, {
      saveLock: newLocked,
    });
    toast({
      title: newLocked
        ? t("drawer.lockedSuccess")
        : t("drawer.unlockedSuccess"),
      status: "success",
      duration: 2000,
    });
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const body = new FormData();

    Array.from(files).forEach((file, index) => {
      body.append(`images[${index}]`, file, file.name);
    });
    body.append("subfolder", "workspace_manager");
    const response = await fetchApi("/workspace/images/save", {
      method: "POST",
      body,
    });
    if (!response.ok) {
      console.error("Cover-Upload fehlgeschlagen", await response.text());
      return;
    }
    // Only the files the backend actually stored (rejected ones are left out,
    // possibly renamed to avoid overwriting another workflow's cover).
    const { savedNames = [] }: { savedNames?: string[] } = await response.json();
    savedNames.forEach((name) => {
      const localPath = `workspace_manager/${name}`;
      mediaTable?.create({
        workflowID: workflow.id,
        localPath: localPath,
      });
      workflowsTable?.updateMetaInfo(workflow.id, {
        coverMediaPath: localPath,
      });
    });
  };

  return (
    <>
      <Menu isLazy closeOnSelect={false} placement="right" gutter={0}>
        <MenuButton
          border={0}
          as={IconButton}
          aria-label={t("drawer.menu.optionsAria")}
          icon={<IconDotsVertical size={20} />}
          size={"sm"}
          variant="outline"
        />
        <MenuList zIndex={101}>
          <MenuItem
            icon={<IconCopy />}
            onClick={() =>
              onDuplicateWorkflow && onDuplicateWorkflow(workflow.id)
            }
          >
            {t("drawer.duplicate")}
          </MenuItem>
          <MenuItem
            icon={<IconExternalLink size={20} />}
            onClick={() => openWorkflowInNewTab(workflow.id)}
          >
            {t("drawer.openInNewTab")}
          </MenuItem>
          {/* <AddTagToWorkflowPopover workflow={workflow} /> */}
          <Tooltip
            hasArrow
            label={
              isLocked ? t("drawer.unlockTooltip") : t("drawer.lockTooltip")
            }
            placement="bottom"
          >
            <MenuItem
              icon={isLocked ? <IconLock /> : <IconLockOpen />}
              onClick={onLockChange}
            >
              {isLocked ? t("drawer.unlock") : t("drawer.lock")}
            </MenuItem>
          </Tooltip>
          <MenuItem
            icon={<IconUpload />}
            onClick={() => {
              fileInputRef.current?.click();
            }}
          >
            {t("drawer.uploadThumbnail")}
          </MenuItem>
        </MenuList>
      </Menu>
      <input
        style={{ display: "none" }}
        ref={fileInputRef}
        type="file"
        accept=".json,image/png"
        multiple
        onChange={handleFileChange}
        onClick={(e) => {
          e.stopPropagation();
        }}
      />
    </>
  );
}
