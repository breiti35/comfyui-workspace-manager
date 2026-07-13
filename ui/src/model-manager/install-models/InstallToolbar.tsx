import {
  Box,
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

export const SORT_OPTIONS: { key: string; label: string }[] = [
  { key: "Most Downloaded", label: "Meiste Downloads" },
  { key: "Highest Rated", label: "Beste Bewertung" },
  { key: "Newest", label: "Neueste" },
];

// key = exakter Civitai-`baseModels`-Wert; "" = kein Filter.
export const BASE_MODEL_OPTIONS: { key: string; label: string }[] = [
  { key: "", label: "Alle Basismodelle" },
  { key: "SD 1.5", label: "SD 1.5" },
  { key: "SDXL 1.0", label: "SDXL" },
  { key: "Pony", label: "Pony" },
  { key: "Flux.1 D", label: "Flux" },
  { key: "Illustrious", label: "Illustrious" },
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
  onCustomUrlInstall,
  resultCount,
  loading,
}: InstallToolbarProps) {
  const sortLabel =
    SORT_OPTIONS.find((o) => o.key === sortBy)?.label ?? SORT_OPTIONS[0].label;
  const baseLabel =
    BASE_MODEL_OPTIONS.find((o) => o.key === baseModel)?.label ??
    BASE_MODEL_OPTIONS[0].label;

  return (
    <Box flexShrink={0}>
      {/* Zeile 1: Titel + Suche + NSFW + ⋯ */}
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
          Install Models
        </Text>
        <Box flex={1} maxW={"640px"}>
          <SearchInput
            searchValue={searchQuery}
            onUpdateSearchValue={setSearchQuery}
            onEnter={onSearch}
            placeholder={"Modelle in Civitai suchen…"}
            variant={"filled"}
            borderRadius={"full"}
            mb={0}
          />
        </Box>
        <NsfwToggleButton />
        <Menu>
          <MenuButton
            as={IconButton}
            aria-label={"more install options"}
            icon={<IconDotsVertical size={18} />}
            size={"sm"}
            variant={"ghost"}
          />
          <MenuList>
            <MenuItem
              icon={<IconLink size={16} />}
              onClick={onCustomUrlInstall}
            >
              Custom URL Install
            </MenuItem>
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
            { key: "", label: "All" },
            ...ALL_MODEL_TYPES.map((t) => ({ key: t, label: t })),
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
              <Text fontSize={"sm"}>Sortierung: {sortLabel}</Text>
              <IconChevronDown size={14} />
            </HStack>
          </MenuButton>
          <MenuList>
            {SORT_OPTIONS.map((o) => (
              <MenuItem key={o.key} onClick={() => setSortBy(o.key)}>
                {o.label}
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
                {o.label}
              </MenuItem>
            ))}
          </MenuList>
        </Menu>

        <Box flex={1} />
        <Text fontSize={"sm"} color={"gray.500"}>
          {loading ? "Lädt…" : `${resultCount} Treffer`}
        </Text>
      </Flex>
    </Box>
  );
}
