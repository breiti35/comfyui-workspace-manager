import {
  Stack,
  Text,
  NumberInput,
  NumberInputField,
} from "@chakra-ui/react";
import { useState, useEffect } from "react";
import { userSettingsTable } from "../db-tables/WorkspaceDB";
import type { UserSettings } from "../types/dbTypes";

export function CommonNumberSetting({
  label,
  settingKey,
}: {
  label: string;
  settingKey: keyof UserSettings;
}) {
  const [inputNumber, setInputNumber] = useState<number>(200);
  const onInputChange = (newValue: string) => {
    if (!newValue.length) {
      setInputNumber(0);
      return;
    }
    setInputNumber(parseInt(newValue));
  };

  const onBlur = async () => {
    if (inputNumber < 0) {
      setInputNumber(0);
    }
    await userSettingsTable?.upsert({
      [settingKey]: Number(inputNumber),
    });
  };
  const loadCurrentSetting = () => {
    userSettingsTable?.getSetting(settingKey).then((res) => {
      setInputNumber(res as number);
    });
  };

  useEffect(() => {
    loadCurrentSetting();
  }, []);

  return (
    <Stack>
      <Text>{label}</Text>

      <NumberInput
        defaultValue={200}
        min={0}
        keepWithinRange={true}
        placeholder="Enter a number"
        maxWidth={"300px"}
        value={inputNumber}
        onChange={(e) => onInputChange(e)}
        onBlur={() => {
          onBlur();
        }}
        onKeyUp={(e) => {
          if (e.key === "Enter") {
            onBlur();
          }
        }}
      >
        <NumberInputField />
      </NumberInput>
    </Stack>
  );
}
