import {
  Box,
  Button,
  Flex,
  IconButton,
  Input,
  InputGroup,
  InputRightElement,
  Text,
} from "@chakra-ui/react";
import { IconEye, IconEyeOff } from "@tabler/icons-react";
import { useState } from "react";
import { getCivitApiKey, setCivitApiKey } from "../utils/civitUtils";
import { useT } from "../i18n/LanguageContext";

export default function CivitaiApiKeySetting() {
  const { t } = useT();
  const [value, setValue] = useState(getCivitApiKey() ?? "");
  const [hasKey, setHasKey] = useState(!!getCivitApiKey());
  const [show, setShow] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = () => {
    setCivitApiKey(value.trim());
    setHasKey(!!value.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };
  const clear = () => {
    setCivitApiKey("");
    setValue("");
    setHasKey(false);
  };

  return (
    <Box>
      <Text fontWeight={500} fontSize={"sm"}>
        {t("apikey.title")}
      </Text>
      <Text fontSize={"xs"} color={"gray.500"} mt={0.5} mb={2}>
        {t("apikey.help")}
      </Text>
      <Flex gap={2} align={"center"} wrap={"wrap"}>
        <InputGroup size={"sm"} maxW={"420px"}>
          <Input
            type={show ? "text" : "password"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t("apikey.placeholder")}
            borderRadius={"md"}
          />
          <InputRightElement>
            <IconButton
              size={"xs"}
              variant={"ghost"}
              aria-label={"toggle key visibility"}
              icon={show ? <IconEyeOff size={15} /> : <IconEye size={15} />}
              onClick={() => setShow((s) => !s)}
            />
          </InputRightElement>
        </InputGroup>
        <Button
          size={"sm"}
          colorScheme={"blue"}
          onClick={save}
          isDisabled={!value.trim()}
        >
          {saved ? t("apikey.saved") : t("apikey.save")}
        </Button>
        {hasKey && (
          <Button size={"sm"} variant={"ghost"} onClick={clear}>
            {t("apikey.delete")}
          </Button>
        )}
      </Flex>
    </Box>
  );
}
