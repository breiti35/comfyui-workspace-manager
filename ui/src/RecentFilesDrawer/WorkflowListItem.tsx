import { Box, HStack, Text, Checkbox, Flex } from "@chakra-ui/react";
import { IconLock } from "@tabler/icons-react";
import { formatTimestamp } from "../utils";
import { memo, ChangeEvent, useContext, useState } from "react";
import { RecentFilesContext, WorkspaceContext } from "../WorkspaceContext";
import { Workflow } from "../types/dbTypes";
import MediaPreview from "../components/MediaPreview";
import WorkflowListItemActionButtons from "./WorkflowListItemActionButtons";
import { userSettingsTable } from "../db-tables/WorkspaceDB";
import { useT } from "../i18n/LanguageContext";

type Props = {
  workflow: Workflow;
};
export default memo(function WorkflowListItem({ workflow }: Props) {
  const { t } = useT();
  const {
    setDraggingFile,
    isMultiSelecting,
    onMultiSelectFlow,
    multiSelectedFlowsID,
  } = useContext(RecentFilesContext);
  const isChecked =
    multiSelectedFlowsID &&
    multiSelectedFlowsID.length > 0 &&
    multiSelectedFlowsID.includes(workflow.id);
  const { curFlowID, loadWorkflowID } = useContext(WorkspaceContext);
  const isSelected = curFlowID === workflow.id;
  const [isHovering, setIsHovering] = useState(false);
  const activeRow = isSelected && !isMultiSelecting;
  const hasCover =
    !userSettingsTable?.settings?.hideCoverImage &&
    !!(workflow.coverMediaPath?.length || workflow.latestImage?.length);

  // Name + timestamp stacked together in one compact block, with an optional
  // small cover thumbnail. This is the draggable / click-to-open surface.
  const basicInfoComp = (
    <HStack
      flexGrow={1}
      minW={0}
      gap={2.5}
      draggable={!isMultiSelecting}
      onDragStart={() => setDraggingFile?.(workflow)}
      cursor={"pointer"}
      onClick={() => {
        !isMultiSelecting && loadWorkflowID(workflow.id);
      }}
    >
      {hasCover && (
        <MediaPreview
          mediaLocalPath={workflow.coverMediaPath ?? workflow.latestImage ?? ""}
          size={40}
          hideBrokenImage
        />
      )}
      <Box textAlign={"left"} flexGrow={1} minW={0}>
        <Flex alignItems={"center"} gap={1}>
          <Text
            fontWeight={"500"}
            fontSize={"sm"}
            noOfLines={1}
            wordBreak={"break-all"}
          >
            {workflow.name ?? t("drawer.untitledWorkflow")}
          </Text>
          {workflow.saveLock && (
            <IconLock size={14} style={{ flexShrink: 0 }} />
          )}
        </Flex>
        <Text fontSize={"xs"} color={"GrayText"} noOfLines={1}>
          {formatTimestamp(workflow.updateTime, false, false, "/")}
        </Text>
      </Box>
    </HStack>
  );

  return (
    <Box
      w={"100%"}
      px={1.5}
      py={1}
      borderRadius={"md"}
      borderLeft={"2px solid"}
      borderLeftColor={activeRow ? "blue.400" : "transparent"}
      bg={activeRow ? "galleryActiveBg" : "transparent"}
      _hover={{ bg: activeRow ? "galleryActiveBg" : "rowHoverBg" }}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <HStack w={"100%"} justify={"space-between"} gap={1}>
        {isMultiSelecting ? (
          <Checkbox
            isChecked={isChecked}
            spacing={3}
            w={"100%"}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              onMultiSelectFlow &&
                onMultiSelectFlow(workflow.id, e.target.checked);
            }}
          >
            {basicInfoComp}
          </Checkbox>
        ) : (
          <>
            {basicInfoComp}
            {isHovering && (
              <Box flexShrink={0}>
                <WorkflowListItemActionButtons workflow={workflow} />
              </Box>
            )}
          </>
        )}
      </HStack>
    </Box>
  );
});
