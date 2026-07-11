import { Checkbox, Stack, Text } from "@chakra-ui/react";
import { useState, useEffect } from "react";
import { userSettingsTable } from "../db-tables/WorkspaceDB";
import { useDialog } from "../components/AlertDialogProvider";
import EnableTwowaySyncConfirm from "./EnableTwowaySyncConfirm";

export default function TwoWaySyncSettings() {
  const [checked, setChecked] = useState(false);
  const [savingDir, setSavingDir] = useState("");
  const { showDialog } = useDialog();
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
          label: "I have downloaded all my workflows and ready to enable",
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
        Keeps your workflows saved as real files in the folder above (see
        "Storage Location"), so they also show up in File Explorer / Finder.
        New installs enable this automatically; this toggle is only here for
        older installs that haven't switched over yet.
        <br />
        ⛔️ Once this is on, leave it on - turning it back off can make
        workflows that only exist on disk disappear from your list.
      </Text>
      <Checkbox isChecked={checked} onChange={onTwoWaySyncChange}>
        Enable two way sync
      </Checkbox>
    </Stack>
  );
}
