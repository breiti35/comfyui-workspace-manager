import { Box, Flex, Switch, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { userSettingsTable } from "../db-tables/WorkspaceDB";
import type { UserSettings } from "../types/dbTypes";

interface CommonToggleSettingProps {
  settingKey: keyof UserSettings;
  label: string;
  helpText?: string;
  warning?: string;
  note?: string;
  isDisabled?: boolean;
  onAfterChange?: (value: boolean) => void;
}

export default function CommonToggleSetting({
  settingKey,
  label,
  helpText,
  warning,
  note,
  isDisabled = false,
  onAfterChange,
}: CommonToggleSettingProps) {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    userSettingsTable?.getSetting(settingKey).then((res) => setChecked(!!res));
  }, [settingKey]);

  const onToggle = async (next: boolean) => {
    // The switch flipping IS the "saved" feedback - no intrusive toast.
    setChecked(next);
    await userSettingsTable?.upsert({ [settingKey]: next });
    onAfterChange?.(next);
  };

  return (
    <Flex
      align={"flex-start"}
      justify={"space-between"}
      gap={4}
      opacity={isDisabled ? 0.5 : 1}
    >
      <Box>
        <Text fontWeight={500} fontSize={"sm"}>
          {label}
        </Text>
        {helpText && (
          <Text fontSize={"xs"} color={"gray.500"} mt={0.5}>
            {helpText}
          </Text>
        )}
        {warning && (
          <Text fontSize={"xs"} color={"red.300"} mt={1}>
            ⛔️ {warning}
          </Text>
        )}
        {note && (
          <Text fontSize={"xs"} color={"blue.300"} mt={1}>
            {note}
          </Text>
        )}
      </Box>
      <Switch
        isChecked={checked}
        isDisabled={isDisabled}
        colorScheme={"blue"}
        onChange={(e) => onToggle(e.target.checked)}
        flexShrink={0}
        mt={1}
      />
    </Flex>
  );
}
