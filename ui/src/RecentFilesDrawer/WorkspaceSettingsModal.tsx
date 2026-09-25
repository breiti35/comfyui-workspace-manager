import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
  Flex,
  Heading,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalOverlay,
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

export default function WorkspaceSettingsModal({
  onClose,
}: {
  onClose: () => void;
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
    <Modal isOpen={true} onClose={onClose} size={"2xl"} scrollBehavior={"inside"}>
      <ModalOverlay />
      <ModalContent maxH={"85vh"}>
        <Flex
          align={"center"}
          px={5}
          py={3}
          pr={14}
          bg={"galleryPanelBg"}
          borderBottom={"1px solid"}
          borderColor={"rowBorderColor"}
          borderTopRadius={"md"}
        >
          <Heading size={"md"}>{t("settings.title")}</Heading>
        </Flex>
        <ModalCloseButton
          top={3}
          right={4}
          size={"md"}
          borderRadius={"md"}
          border={"1px solid"}
          borderColor={"red.400"}
          color={"red.300"}
          bg={"rgba(245, 101, 101, 0.14)"}
          _hover={{ bg: "rgba(245, 101, 101, 0.3)", color: "white" }}
          _active={{ bg: "rgba(245, 101, 101, 0.42)" }}
        />
        <ModalBody py={5} sx={hideScrollbarSx}>
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
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
