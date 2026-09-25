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
import BaseModelPicker from "./BaseModelPicker";
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

        <BaseModelPicker value={baseModel} onChange={setBaseModel} />

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
