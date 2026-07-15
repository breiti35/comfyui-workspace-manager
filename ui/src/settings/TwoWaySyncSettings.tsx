import { Checkbox, Stack, Text } from "@chakra-ui/react";
import { useState, useEffect } from "react";
import { userSettingsTable } from "../db-tables/WorkspaceDB";
import { useDialog } from "../components/AlertDialogProvider";
import EnableTwowaySyncConfirm from "./EnableTwowaySyncConfirm";
import { useT } from "../i18n/LanguageContext";

export default function TwoWaySyncSettings() {
  const [checked, setChecked] = useState(false);
  const [savingDir, setSavingDir] = useState("");
  const { showDialog } = useDialog();
  const { t } = useT();
  const getTwoWaySync = () => {
    userSettingsTable?.getSetting("myWorkflowsDir").then((res) => {
      setSavingDir(res ?? "undefined");
    });
    userSettingsTable?.getSetting("twoWaySync").then((res) => {
      setChecked(res ?? false);
    });
  };

  useEffect(() => {
    getTwoWaySync();
  }, []);
  const onTwoWaySyncChange = async (e: any) => {
    // setChecked(e.target.checked);
    if (!e.target.checked) {
      await userSettingsTable?.upsert({ twoWaySync: e.target.checked });
      getTwoWaySync();
      return;
    }
    const myWorkflowsDir =
      await userSettingsTable?.getSetting("myWorkflowsDir");
    showDialog(
      <EnableTwowaySyncConfirm
        myWorkflowsDir={myWorkflowsDir ?? "undefined"}
      />,
      [
        {
          label: t("sync.confirmButton"),
          onClick: async () => {
            await userSettingsTable?.upsert({ twoWaySync: true });
            getTwoWaySync();
          },
          colorScheme: "red",
        },
      ],
    );
  };

  return (
    <Stack>
      <Text fontSize="sm" color="gray.400">
        {t("sync.description")}
        <br />
        {t("sync.warning")}
      </Text>
      <Checkbox isChecked={checked} onChange={onTwoWaySyncChange}>
        {t("sync.enableLabel")}
      </Checkbox>
    </Stack>
  );
}
