import { Flex, IconButton, Tooltip } from "@chakra-ui/react";
import DeleteConfirm from "../components/DeleteConfirm";
import MoreActionMenu from "./MoreActionMenu";
import { useContext } from "react";
import { RecentFilesContext } from "../WorkspaceContext";
import { Workflow } from "../types/dbTypes";
import { useT } from "../i18n/LanguageContext";

export default function WorkflowListItemActionButtons({
  workflow,
}: {
  workflow: Workflow;
}) {
  const { t } = useT();
  const { onDeleteFlow } = useContext(RecentFilesContext);
  return (
    <Flex justifyContent={"flex-end"}>
      <DeleteConfirm
        promptMessage={t("drawer.deleteWorkflowConfirm")}
        onDelete={() => {
          onDeleteFlow && onDeleteFlow(workflow.id);
        }}
      />
      <MoreActionMenu workflow={workflow} />
    </Flex>
  );
}
