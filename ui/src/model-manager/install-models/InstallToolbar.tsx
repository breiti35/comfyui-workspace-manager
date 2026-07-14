import {
  Box,
  Button,
  Flex,
  HStack,
  IconButton,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Text,
} from "@chakra-ui/react";
import {
  IconChevronDown,
  IconDotsVertical,
  IconLink,
} from "@tabler/icons-react";
import SearchInput from "../../components/SearchInput";
import CategoryTabs from "../components/CategoryTabs";
import NsfwToggleButton from "../models-list-drawer/NsfwToggleButton";
import AddApiKeyPopover from "./AddApiKeyPopover";
import { ALL_MODEL_TYPES, type MODEL_TYPE } from "./util/modelTypes";
import { useT } from "../../i18n/LanguageContext";
import type { TransKey } from "../../i18n/translations";

export const SORT_OPTIONS: { key: string; labelKey: TransKey }[] = [
  { key: "Most Downloaded", labelKey: "install.sort.mostDownloaded" },
  { key: "Highest Rated", labelKey: "install.sort.highestRated" },
  { key: "Newest", labelKey: "install.sort.newest" },
];

// Civitai `limit` accepts up to 100; we offer a small, sensible set. Standard 25.
export const PAGE_SIZE_OPTIONS = [10, 15, 25, 50];

// key = exakter Civitai-`baseModels`-Wert (muss 1:1 zur API passen, sonst leere
// Treffer); "" = kein Filter. Label = derselbe String, damit unmissverständlich.
// Nach Familien geordnet, gängige oben. Neue Basismodelle tauchen bei Civitai
// laufend auf - Liste bei Bedarf ergänzen.
export const BASE_MODEL_OPTIONS: { key: string; label: string }[] = [
  { key: "", label: "Alle Basismodelle" },
  // SD 1.x / 2.x
  { key: "SD 1.5", label: "SD 1.5" },
  { key: "SD 1.5 LCM", label: "SD 1.5 LCM" },
  { key: "SD 1.5 Hyper", label: "SD 1.5 Hyper" },
  { key: "SD 2.0", label: "SD 2.0" },
  { key: "SD 2.1 768", label: "SD 2.1 768" },
  // SDXL + Varianten
  { key: "SDXL 0.9", label: "SDXL 0.9" },
  { key: "SDXL 1.0", label: "SDXL 1.0" },
  { key: "SDXL 1.0 LCM", label: "SDXL 1.0 LCM" },
  { key: "SDXL Lightning", label: "SDXL Lightning" },
  { key: "SDXL Hyper", label: "SDXL Hyper" },
  // SDXL-basierte Anime-Modelle
  { key: "Pony", label: "Pony" },
  { key: "Illustrious", label: "Illustrious" },
  { key: "NoobAI", label: "NoobAI" },
  // Flux
  { key: "Flux.1 S", label: "Flux.1 S" },
  { key: "Flux.1 D", label: "Flux.1 D" },
  { key: "Flux.1 Kontext", label: "Flux.1 Kontext" },
  { key: "Flux.1 Krea", label: "Flux.1 Krea" },
  { key: "Flux.2 D", label: "Flux.2 D" },
  // Weitere Bildmodelle
  { key: "Chroma", label: "Chroma" },
  { key: "HiDream", label: "HiDream" },
  { key: "Qwen", label: "Qwen" },
  { key: "Krea 2", label: "Krea 2" },
  { key: "Stable Cascade", label: "Stable Cascade" },
  { key: "Kolors", label: "Kolors" },
  { key: "AuraFlow", label: "AuraFlow" },
  { key: "PixArt a", label: "PixArt α" },
  { key: "PixArt E", label: "PixArt Σ" },
  { key: "Hunyuan 1", label: "Hunyuan DiT" },
  // Video
  { key: "Wan Video", label: "Wan Video" },
  { key: "LTXV 2.3", label: "LTXV 2.3" },
];

interface InstallToolbarProps {
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  onSearch: () => void;
  modelType?: MODEL_TYPE;
  onSelectModelType: (t?: MODEL_TYPE) => void;
  sortBy: string;
  setSortBy: (v: string) => void;
  baseModel: string;
  setBaseModel: (v: string) => void;
  pageSize: number;
  setPageSize: (v: number) => void;
  onCustomUrlInstall: () => void;
  resultCount: number;
  loading: boolean;
}

export default function InstallToolbar({
  searchQuery,
  setSearchQuery,
  onSearch,
  modelType,
  onSelectModelType,
  sortBy,
  setSortBy,
  baseModel,
  setBaseModel,
  pageSize,
  setPageSize,
  onCustomUrlInstall,
  resultCount,
  loading,
}: InstallToolbarProps) {
  const { t } = useT();
  const sortLabel = t(
    SORT_OPTIONS.find((o) => o.key === sortBy)?.labelKey ??
      SORT_OPTIONS[0].labelKey,
  );
  const baseLabel =
    baseModel === ""
      ? t("install.baseModel.all")
      : (BASE_MODEL_OPTIONS.find((o) => o.key === baseModel)?.label ??
        t("install.baseModel.all"));

  return (
    <Box flexShrink={0}>
      {/* Zeile 1: Titel + Suche + Custom URL + NSFW + ⋯ */}
      <Flex
        align={"center"}
        gap={3}
        px={4}
        py={3}
        pr={14}
        bg={"galleryPanelBg"}
        borderBottom={"1px solid"}
        borderColor={"rowBorderColor"}
      >
        <Text fontWeight={700} fontSize={"lg"} flexShrink={0}>
          {t("install.title")}
        </Text>
        <Box flex={1} maxW={"640px"}>
          <SearchInput
            searchValue={searchQuery}
            onUpdateSearchValue={setSearchQuery}
            onEnter={onSearch}
            placeholder={t("install.search.placeholder")}
            variant={"filled"}
            borderRadius={"full"}
            mb={0}
          />
        </Box>
        <Button
          size={"sm"}
          variant={"outline"}
          flexShrink={0}
          leftIcon={<IconLink size={16} />}
          onClick={onCustomUrlInstall}
        >
          {t("install.customUrl.button")}
        </Button>
        <NsfwToggleButton />
        {/* ⋯: vorerst nur der API-Key - der zieht später in die (dann
            umgestalteten) Einstellungen um. */}
        <Menu>
          <MenuButton
            as={IconButton}
            aria-label={"more install options"}
            icon={<IconDotsVertical size={18} />}
            size={"sm"}
            variant={"ghost"}
          />
          <MenuList>
            <Box px={3} py={1}>
              <AddApiKeyPopover />
            </Box>
          </MenuList>
        </Menu>
      </Flex>

      {/* Zeile 2: Kategorie-Tabs */}
      <Box bg={"galleryActiveBg"} px={2}>
        <CategoryTabs
          items={[
            { key: "", label: t("install.categoryAll") },
            ...ALL_MODEL_TYPES.map((mt) => ({ key: mt, label: mt })),
          ]}
          value={modelType ?? ""}
          onChange={(key) =>
            onSelectModelType(key === "" ? undefined : (key as MODEL_TYPE))
          }
        />
      </Box>

      {/* Zeile 3: Sort + Basismodell + Trefferzahl */}
      <Flex
        align={"center"}
        gap={2}
        px={4}
        py={2}
        borderBottom={"1px solid"}
        borderColor={"rowBorderColor"}
      >
        <Menu>
          <MenuButton
            as={Box}
            cursor={"pointer"}
            px={3}
            py={1}
            borderRadius={"md"}
            border={"1px solid"}
            borderColor={"rowBorderColor"}
            _hover={{ bg: "rowHoverBg" }}
          >
            <HStack gap={1}>
              <Text fontSize={"sm"}>
                {t("install.sort.label")} {sortLabel}
              </Text>
              <IconChevronDown size={14} />
            </HStack>
          </MenuButton>
          <MenuList>
            {SORT_OPTIONS.map((o) => (
              <MenuItem key={o.key} onClick={() => setSortBy(o.key)}>
                {t(o.labelKey)}
              </MenuItem>
            ))}
          </MenuList>
        </Menu>

        <Menu>
          <MenuButton
            as={Box}
            cursor={"pointer"}
            px={3}
            py={1}
            borderRadius={"md"}
            border={"1px solid"}
            borderColor={baseModel ? "blue.400" : "rowBorderColor"}
            color={baseModel ? "blue.300" : undefined}
            _hover={{ bg: "rowHoverBg" }}
          >
            <HStack gap={1}>
              <Text fontSize={"sm"}>{baseLabel}</Text>
              <IconChevronDown size={14} />
            </HStack>
          </MenuButton>
          <MenuList>
            {BASE_MODEL_OPTIONS.map((o) => (
              <MenuItem key={o.key} onClick={() => setBaseModel(o.key)}>
                {o.key === "" ? t("install.baseModel.all") : o.label}
              </MenuItem>
            ))}
          </MenuList>
        </Menu>

        <Menu>
          <MenuButton
            as={Box}
            cursor={"pointer"}
            px={3}
            py={1}
            borderRadius={"md"}
            border={"1px solid"}
            borderColor={"rowBorderColor"}
            _hover={{ bg: "rowHoverBg" }}
          >
            <HStack gap={1}>
              <Text fontSize={"sm"}>
                {t("install.pageSize.label")} {pageSize}
              </Text>
              <IconChevronDown size={14} />
            </HStack>
          </MenuButton>
          <MenuList>
            {PAGE_SIZE_OPTIONS.map((n) => (
              <MenuItem key={n} onClick={() => setPageSize(n)}>
                {n} {t("install.pageSize.perPage")}
              </MenuItem>
            ))}
          </MenuList>
        </Menu>

        <Box flex={1} />
        <Text fontSize={"sm"} color={"gray.500"}>
          {loading
            ? t("install.loading")
            : `${resultCount} ${t("install.results.onThisPage")}`}
        </Text>
      </Flex>
    </Box>
  );
}
