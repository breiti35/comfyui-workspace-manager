import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
  VStack,
} from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { ShortcutSettings } from "../settings/ShortcutSettings";
import TwoWaySyncSettings from "../settings/TwoWaySyncSettings";
import CommonToggleSetting from "../settings/CommonToggleSetting";
import CivitaiApiKeySetting from "../settings/CivitaiApiKeySetting";
import SelectMyWorkflowsDir from "../settings/SelectMyWorkflowsDir";
import { CommonNumberSetting } from "../settings/CommonNumberSetting";
import SettingsSection from "../settings/SettingsSection";
import LanguageSetting from "../settings/LanguageSetting";
import { hideScrollbarSx } from "../model-manager/utils";
import { userSettingsTable } from "../db-tables/WorkspaceDB";
import { useT } from "../i18n/LanguageContext";
import { LibraryHeader } from "../library/primitives";

export default function WorkspaceSettingsModal(_props: {
  onClose?: () => void;
}) {
  const { t } = useT();
  // Adult host state drives whether the NSFW-blur toggle is meaningful.
  const [adultOn, setAdultOn] = useState(false);
  useEffect(() => {
    // Settings are cached in memory (see UserSettingsTable); re-read them
    // once when the panel opens so changes from another tab show up.
    (userSettingsTable?.refresh() ?? Promise.resolve())
      .catch(() => undefined)
      .then(() => userSettingsTable?.getSetting("civitaiIncludeAdultContent"))
      .then((r) => setAdultOn(!!r));
  }, []);

  return (
    <div className="lib-section">
      <LibraryHeader title={t("settings.title")} />
      <Box
        flex={1}
        minH={0}
        overflowY={"auto"}
        px={6}
        py={5}
        sx={{
          ...hideScrollbarSx,
          "--chakra-colors-galleryPanelBg": "var(--lib-card)",
          "--chakra-colors-rowBorderColor": "var(--lib-line)",
        }}
      >
        <Box maxW={"720px"}>
          <VStack spacing={4} align={"stretch"}>
            <SettingsSection title={t("settings.language")}>
              <LanguageSetting />
            </SettingsSection>

            <SettingsSection title={t("settings.group.civitai")}>
              <CommonToggleSetting
                settingKey={"civitaiIncludeAdultContent"}
                label={t("settings.adult.label")}
                helpText={t("settings.adult.help")}
                onAfterChange={(v) => {
                  setAdultOn(v);
                  window.dispatchEvent(new Event("civitaiIncludeAdultContent"));
                }}
              />
              <CommonToggleSetting
                settingKey={"showNsfwModelThumbnail"}
                label={t("settings.nsfwPreview.label")}
                helpText={t("settings.nsfwPreview.help")}
                isDisabled={!adultOn}
                onAfterChange={() =>
                  window.dispatchEvent(new Event("showNsfwModelThumbnail"))
                }
              />
              <CivitaiApiKeySetting />
            </SettingsSection>

            <SettingsSection title={t("settings.group.storage")}>
              <SelectMyWorkflowsDir />
            </SettingsSection>

            <SettingsSection title={t("settings.group.display")}>
              <CommonToggleSetting
                settingKey={"foldersOnTop"}
                label={t("settings.foldersOnTop")}
              />
              <CommonToggleSetting
                settingKey={"hideCoverImage"}
                label={t("settings.hideThumbnails")}
              />
            </SettingsSection>

            <SettingsSection title={t("settings.group.saving")}>
              <CommonNumberSetting
                label={t("settings.maxChangelog")}
                settingKey={"maximumChangelogNumber"}
              />
              <CommonToggleSetting
                settingKey={"disableUnsavedWarning"}
                label={t("settings.disableUnsavedWarning")}
                warning={t("settings.disableUnsavedWarning.warning")}
              />
            </SettingsSection>

            <SettingsSection title={t("settings.group.shortcuts")}>
              <ShortcutSettings />
            </SettingsSection>

            <Accordion allowToggle>
              <AccordionItem
                border={"1px solid"}
                borderColor={"rowBorderColor"}
                borderRadius={"lg"}
              >
                <AccordionButton px={4} py={3}>
                  <Box
                    flex={1}
                    textAlign={"left"}
                    fontSize={"xs"}
                    textTransform={"uppercase"}
                    letterSpacing={"wider"}
                    color={"gray.500"}
                  >
                    {t("settings.group.advanced")}
                  </Box>
                  <AccordionIcon />
                </AccordionButton>
                <AccordionPanel px={4} pb={4}>
                  <TwoWaySyncSettings />
                </AccordionPanel>
              </AccordionItem>
            </Accordion>
          </VStack>
        </Box>
      </Box>
    </div>
  );
}
