import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverArrow,
  PopoverCloseButton,
  useDisclosure,
  Button,
  Input,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useState } from "react";
import { setCivitApiKey } from "../../utils/civitUtils";
import { useT } from "../../i18n/LanguageContext";

export default function AddApiKeyPopover() {
  const { t } = useT();
  const [apiKeyInput, setApiKeyInput] = useState("");
  const { onOpen, onClose, isOpen } = useDisclosure();

  const saveApiKey = () => {
    setCivitApiKey(apiKeyInput);
    onClose();
  };

  return (
    <Popover
      isOpen={isOpen}
      onOpen={onOpen}
      onClose={onClose}
      placement="right"
      closeOnBlur={false}
    >
      <PopoverTrigger>
        <Button size={"sm"} py={1} mr={8}>
          {t("install.apiKey.button")}
        </Button>
      </PopoverTrigger>
      <PopoverContent p={5} onKeyDown={(e) => e.stopPropagation()}>
        <PopoverArrow />
        <PopoverCloseButton />
        <Stack spacing={4}>
          <Text fontSize={14}>{t("install.apiKey.description")}</Text>
          <Input
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder={t("install.apiKey.inputPlaceholder")}
          />
          <Button size={"sm"} py={1} mr={8} onClick={saveApiKey}>
            {t("install.apiKey.save")}
          </Button>
        </Stack>
      </PopoverContent>
    </Popover>
  );
}
