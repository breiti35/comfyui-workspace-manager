import {
  Badge,
  Box,
  Button,
  Flex,
  Heading,
  HStack,
  Menu,
  MenuButton,
  MenuItemOption,
  MenuList,
  MenuOptionGroup,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import {
  IconChevronDown,
  IconDownload,
  IconHome,
  IconRefresh,
  IconStar,
  IconStarFilled,
  IconStack2,
} from "@tabler/icons-react";
import CategoryTabs from "../components/CategoryTabs";
import SearchInput from "../../components/SearchInput";
import NsfwToggleButton from "./NsfwToggleButton";

interface Props {
  categories: string[];
  selectedModel: string;
  onSelectModel: (m: string) => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  sortBy: string;
  setSortBy: (v: string) => void;
  favoritesOnly: boolean;
  setFavoritesOnly: (b: boolean) => void;
  onRefresh: () => void;
  onInstall: () => void;
  resultCount: number;
}

const SORT_OPTIONS: { value: string; label: string; short: string }[] = [
  { value: "az", label: "Name A–Z", short: "A–Z" },
  { value: "za", label: "Name Z–A", short: "Z–A" },
  { value: "newest", label: "Neueste zuerst", short: "Neu" },
  { value: "oldest", label: "Älteste zuerst", short: "Alt" },
];

const CATEGORY_LABELS: Record<string, string> = {
  checkpoints: "Checkpoints",
  loras: "LoRAs",
  vae: "VAE",
  controlnet: "ControlNet",
  upscale_models: "Upscaler",
  embeddings: "Embeddings",
  hypernetworks: "Hypernetworks",
  clip: "CLIP",
  clip_vision: "CLIP Vision",
  unet: "UNet",
  diffusion_models: "Diffusion",
};

function prettyCategory(key: string): string {
  return CATEGORY_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

export default function ModelsPanelToolbar({
  categories,
  selectedModel,
  onSelectModel,
  searchQuery,
  setSearchQuery,
  sortBy,
  setSortBy,
  favoritesOnly,
  setFavoritesOnly,
  onRefresh,
  onInstall,
  resultCount,
}: Props) {
  const sortShort =
    SORT_OPTIONS.find((o) => o.value === sortBy)?.short ?? "A–Z";

  return (
    <Box flexShrink={0}>
      {/* Row 1 - the "address bar": title, search, NSFW toggle, install. */}
      <Flex
        align={"center"}
        gap={3}
        px={4}
        py={2}
        bg={"galleryPanelBg"}
        borderBottom={"1px solid"}
        borderColor={"rowBorderColor"}
      >
        <HStack gap={2} flexShrink={0}>
          <IconStack2 size={20} />
          <Heading size={"sm"}>Models</Heading>
        </HStack>
        <Box flex={1} />
        <HStack gap={2} flexShrink={0} pr={12}>
          <SearchInput
            searchValue={searchQuery}
            onUpdateSearchValue={setSearchQuery}
            placeholder="Modelle durchsuchen…"
            style={{ width: "300px" }}
            variant={"filled"}
            borderRadius={"full"}
            mb={0}
          />
          <NsfwToggleButton />
          <Button
            size={"sm"}
            colorScheme={"blue"}
            leftIcon={<IconDownload size={16} />}
            onClick={onInstall}
            flexShrink={0}
          >
            Install Models
          </Button>
        </HStack>
      </Flex>

      {/* Row 2 - the tab strip: model categories. */}
      <Box bg={"galleryActiveBg"} px={3}>
        <CategoryTabs
          items={categories.map((c) => ({ key: c, label: prettyCategory(c) }))}
          value={selectedModel}
          onChange={onSelectModel}
        />
      </Box>

      {/* Row 3 - breadcrumb (left) + tools (right). */}
      <Flex
        align={"center"}
        justify={"space-between"}
        gap={2}
        px={4}
        py={1.5}
        bg={"galleryPanelBg"}
        borderBottom={"1px solid"}
        borderColor={"rowBorderColor"}
      >
        <HStack gap={2} color={"gray.500"} minW={0}>
          <IconHome size={15} />
          <Text fontSize={"sm"} noOfLines={1}>
            {searchQuery.trim()
              ? `Suche: „${searchQuery.trim()}“`
              : prettyCategory(selectedModel)}
          </Text>
          <Badge borderRadius={"full"} px={2} flexShrink={0}>
            {resultCount}
          </Badge>
        </HStack>

        <HStack gap={1} flexShrink={0}>
          <Menu closeOnSelect={true}>
            <Tooltip label={"Sortierung"}>
              <MenuButton
                as={Button}
                size={"xs"}
                variant={"ghost"}
                rightIcon={<IconChevronDown size={14} />}
              >
                {sortShort}
              </MenuButton>
            </Tooltip>
            <MenuList minW={"180px"}>
              <MenuOptionGroup
                type={"radio"}
                value={sortBy}
                onChange={(v) => setSortBy(v as string)}
              >
                {SORT_OPTIONS.map((o) => (
                  <MenuItemOption key={o.value} value={o.value}>
                    {o.label}
                  </MenuItemOption>
                ))}
              </MenuOptionGroup>
            </MenuList>
          </Menu>

          <Tooltip label={"Modell-Liste neu einlesen"}>
            <Button
              size={"xs"}
              variant={"ghost"}
              leftIcon={<IconRefresh size={15} />}
              onClick={onRefresh}
            >
              Aktualisieren
            </Button>
          </Tooltip>

          <Tooltip
            label={
              favoritesOnly ? "Alle Modelle zeigen" : "Nur Favoriten zeigen"
            }
          >
            <Button
              size={"xs"}
              variant={favoritesOnly ? "outline" : "ghost"}
              // Tinted gold when active - quieter than a solid yellow fill.
              borderColor={favoritesOnly ? "yellow.500" : undefined}
              color={favoritesOnly ? "yellow.200" : undefined}
              bg={favoritesOnly ? "rgba(236, 201, 75, 0.16)" : undefined}
              _hover={
                favoritesOnly ? { bg: "rgba(236, 201, 75, 0.26)" } : undefined
              }
              leftIcon={
                favoritesOnly ? (
                  <IconStarFilled size={14} />
                ) : (
                  <IconStar size={14} />
                )
              }
              onClick={() => setFavoritesOnly(!favoritesOnly)}
            >
              Favoriten
            </Button>
          </Tooltip>
        </HStack>
      </Flex>
    </Box>
  );
}
