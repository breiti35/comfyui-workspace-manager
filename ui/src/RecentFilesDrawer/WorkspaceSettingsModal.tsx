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
import { hideScrollbarSx } from "../model-manager/utils";
import { userSettingsTable } from "../db-tables/WorkspaceDB";

export default function WorkspaceSettingsModal({
  onClose,
}: {
  onClose: () => void;
}) {
  // Adult host state drives whether the NSFW-blur toggle is meaningful.
  const [adultOn, setAdultOn] = useState(false);
  useEffect(() => {
    userSettingsTable
      ?.getSetting("civitaiIncludeAdultContent")
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
          <Heading size={"md"}>Einstellungen</Heading>
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
            <SettingsSection title={"Civitai"}>
              <CommonToggleSetting
                settingKey={"civitaiIncludeAdultContent"}
                label={"Adult-Inhalte (18+) anzeigen"}
                helpText={
                  "Nutzt civitai.red statt civitai.com für Suche, Hash-Lookup, Downloads und Links, sodass NSFW-Modelle gefunden und installiert werden können."
                }
                onAfterChange={(v) => {
                  setAdultOn(v);
                  window.dispatchEvent(new Event("civitaiIncludeAdultContent"));
                }}
              />
              <CommonToggleSetting
                settingKey={"showNsfwModelThumbnail"}
                label={"NSFW-Vorschau anzeigen"}
                helpText={
                  "Aus = NSFW-Vorschaubilder werden verblurrt (per Klick aufdecken). Nur wirksam, wenn Adult-Inhalte an sind."
                }
                isDisabled={!adultOn}
                onAfterChange={() =>
                  window.dispatchEvent(new Event("showNsfwModelThumbnail"))
                }
              />
              <CivitaiApiKeySetting />
            </SettingsSection>

            <SettingsSection title={"Speicher & Sync"}>
              <SelectMyWorkflowsDir />
            </SettingsSection>

            <SettingsSection title={"Anzeige"}>
              <CommonToggleSetting
                settingKey={"foldersOnTop"}
                label={"Ordner immer oben"}
              />
              <CommonToggleSetting
                settingKey={"hideCoverImage"}
                label={"Thumbnails in der Workflow-Liste ausblenden"}
              />
            </SettingsSection>

            <SettingsSection title={"Speichern"}>
              <CommonNumberSetting
                label={"Max. gespeicherte Änderungs-Historie"}
                settingKey={"maximumChangelogNumber"}
              />
              <CommonToggleSetting
                settingKey={"disableUnsavedWarning"}
                label={"‚Speichern/Verwerfen'-Warnung deaktivieren"}
                warning={
                  "Vorsicht: Ohne diese Warnung gehen ungespeicherte Änderungen beim Schließen eines Workflows verloren."
                }
              />
            </SettingsSection>

            <SettingsSection title={"Tastenkürzel"}>
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
                    Erweitert
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
