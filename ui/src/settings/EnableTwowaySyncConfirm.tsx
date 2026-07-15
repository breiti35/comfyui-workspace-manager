import { Button, Heading, Stack } from "@chakra-ui/react";
import { downloadWorkflowsZip } from "../utils/downloadWorkflowsZip";
import { workflowsTable } from "../db-tables/WorkspaceDB";
import { useT } from "../i18n/LanguageContext";

export default function EnableTwoWaySyncConfirm({
  myWorkflowsDir,
}: {
  myWorkflowsDir: string;
}) {
  const { t } = useT();
  return (
    <Stack gap={3}>
      <Heading size={"md"}>{t("sync.confirmDialog.heading")}</Heading>
      <p>{t("sync.confirmDialog.pathIntro")}</p>
      <p>
        <b>{myWorkflowsDir}</b>
      </p>
      <p>{t("sync.confirmDialog.pathInstructions")}</p>
      <p>
        <b>{t("sync.confirmDialog.backupWarning")}</b>{" "}
        {t("sync.confirmDialog.backupNote")}
      </p>
      <Button
        colorScheme="teal"
        variant={"outline"}
        width={"fit-content"}
        onClick={async () => {
          const workflows = await workflowsTable?.listAll();
          downloadWorkflowsZip(workflows ?? []);
        }}
      >
        {t("sync.confirmDialog.downloadButton")}
      </Button>
    </Stack>
  );
}
