import { Box, Button, ButtonGroup, Flex, Text } from "@chakra-ui/react";
import { userSettingsTable } from "../db-tables/WorkspaceDB";
import { useT } from "../i18n/LanguageContext";
import type { Lang } from "../i18n/translations";

const OPTIONS: { key: Lang; label: string }[] = [
  { key: "en", label: "English" },
  { key: "de", label: "Deutsch" },
];

// Segmented EN/DE switch. Writes `language` and fires the `language` event so
// every translated surface re-renders live.
export default function LanguageSetting() {
  const { lang, t } = useT();

  const choose = (next: Lang) => {
    if (next === lang) return;
    userSettingsTable?.upsert({ language: next }).then(() => {
      window.dispatchEvent(new Event("language"));
    });
  };

  return (
    <Flex align={"center"} justify={"space-between"} gap={4}>
      <Box>
        <Text fontSize={"xs"} color={"gray.500"}>
          {t("settings.language.help")}
        </Text>
      </Box>
      <ButtonGroup size={"sm"} isAttached variant={"outline"} flexShrink={0}>
        {OPTIONS.map((o) => {
          const active = o.key === lang;
          return (
            <Button
              key={o.key}
              onClick={() => choose(o.key)}
              colorScheme={active ? "blue" : "gray"}
              variant={active ? "solid" : "outline"}
            >
              {o.label}
            </Button>
          );
        })}
      </ButtonGroup>
    </Flex>
  );
}
