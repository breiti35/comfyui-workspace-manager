import {
  Box,
  HStack,
  Input,
  Popover,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Text,
  useDisclosure,
} from "@chakra-ui/react";
import { IconChevronDown } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../../i18n/LanguageContext";
import {
  FALLBACK_BASE_MODELS,
  baseModelLabel,
  filterBaseModels,
  toBaseModelOptions,
} from "./util/baseModels";
import { fetchBaseModels } from "./util/fetchBaseModels";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

/**
 * Base model filter with a search box. Civitai lists ~70 active base models
 * by now - far too many for a plain menu - and new ones keep arriving, so the
 * list is fetched live (see fetchBaseModels.ts) instead of hard-coded.
 */
export default function BaseModelPicker({ value, onChange }: Props) {
  const { t } = useT();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [keys, setKeys] = useState<string[]>(FALLBACK_BASE_MODELS);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    fetchBaseModels().then((list) => {
      if (alive) setKeys(list);
    });
    return () => {
      alive = false;
    };
  }, []);

  const options = useMemo(() => toBaseModelOptions(keys), [keys]);
  const filtered = useMemo(
    () => filterBaseModels(options, query),
    [options, query],
  );

  const pick = (key: string) => {
    onChange(key);
    setQuery("");
    onClose();
  };

  const item = (key: string, label: string) => {
    const active = key === value;
    return (
      <Box
        as={"button"}
        key={key || "__all"}
        display={"block"}
        w={"100%"}
        textAlign={"left"}
        px={3}
        py={1.5}
        fontSize={"sm"}
        borderRadius={"md"}
        fontWeight={active ? 600 : 400}
        color={active ? "blue.300" : undefined}
        _hover={{ bg: "rowHoverBg" }}
        onClick={() => pick(key)}
      >
        {label}
      </Box>
    );
  };

  return (
    <Popover
      isOpen={isOpen}
      onOpen={onOpen}
      onClose={() => {
        setQuery("");
        onClose();
      }}
      initialFocusRef={inputRef}
      placement={"bottom-start"}
      isLazy
    >
      <PopoverTrigger>
        <Box
          as={"button"}
          px={3}
          py={1}
          borderRadius={"md"}
          border={"1px solid"}
          borderColor={value ? "blue.400" : "rowBorderColor"}
          color={value ? "blue.300" : undefined}
          _hover={{ bg: "rowHoverBg" }}
        >
          <HStack gap={1}>
            <Text fontSize={"sm"}>
              {value ? baseModelLabel(value) : t("install.baseModel.all")}
            </Text>
            <IconChevronDown size={14} />
          </HStack>
        </Box>
      </PopoverTrigger>
      <PopoverContent w={"280px"}>
        <PopoverBody p={2}>
          <Input
            ref={inputRef}
            size={"sm"}
            mb={2}
            placeholder={t("install.baseModel.searchPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // Enter takes the first hit - quickest way to "krea" + Enter.
              if (e.key === "Enter" && filtered.length) {
                pick(filtered[0].key);
              }
            }}
          />
          <Box maxH={"320px"} overflowY={"auto"}>
            {!query && item("", t("install.baseModel.all"))}
            {filtered.map((o) => item(o.key, o.label))}
            {!filtered.length && (
              <Text fontSize={"sm"} color={"gray.500"} px={3} py={2}>
                {t("install.baseModel.noMatch")}
              </Text>
            )}
          </Box>
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
}
