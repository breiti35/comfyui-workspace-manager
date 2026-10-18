import { Flex, Switch, Text } from "@chakra-ui/react";
import { useT } from "../i18n/LanguageContext";
import type { TransKey } from "../i18n/translations";
import {
  COMPACT_SECTIONS,
  type CompactSection,
} from "../library/compact/compactState";
import {
  setDockSectionEnabled,
  useDockSections,
} from "../library/compact/dockSections";

const LABELS: Record<CompactSection, TransKey> = {
  live: "compact.nav.live",
  models: "compact.nav.models",
  prompts: "library.nav.prompts",
  workflows: "library.nav.workflows",
  gallery: "library.nav.gallery",
  downloads: "library.nav.downloads",
  settings: "library.nav.settings",
};

/** One switch per area of the docked bar; the last one on cannot be turned off. */
export default function DockSectionsSetting() {
  const { t } = useT();
  const shown = useDockSections();
  return (
    <>
      <Text fontSize={"xs"} color={"gray.500"}>
        {t("settings.dock.help")}
      </Text>
      {COMPACT_SECTIONS.map((s) => {
        const on = shown.includes(s);
        return (
          <Flex key={s} align={"center"} justify={"space-between"} gap={4}>
            <Text fontWeight={500} fontSize={"sm"}>
              {t(LABELS[s])}
            </Text>
            <Switch
              isChecked={on}
              isDisabled={on && shown.length === 1}
              colorScheme={"blue"}
              aria-label={t(LABELS[s])}
              onChange={(e) => void setDockSectionEnabled(s, e.target.checked)}
              flexShrink={0}
            />
          </Flex>
        );
      })}
    </>
  );
}
