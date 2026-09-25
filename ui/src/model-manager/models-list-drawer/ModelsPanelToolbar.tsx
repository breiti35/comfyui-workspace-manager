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
  IconHome,
  IconRefresh,
  IconStar,
  IconStarFilled,
  IconStack2,
} from "@tabler/icons-react";
import CategoryTabs from "../components/CategoryTabs";
import SearchInput from "../../components/SearchInput";
import NsfwToggleButton from "./NsfwToggleButton";
import { useT } from "../../i18n/LanguageContext";
import type { TransKey } from "../../i18n/translations";

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
  resultCount: number;
}

function getSortOptions(
  t: (key: TransKey) => string,
): { value: string; label: string; short: string }[] {
  return [
    { value: "az", label: t("models.toolbar.sortAZ"), short: "A–Z" },
    { value: "za", label: t("models.toolbar.sortZA"), short: "Z–A" },
    {
      value: "newest",
      label: t("models.toolbar.sortNewest"),
      short: t("models.toolbar.sortShortNewest"),
    },
    {
      value: "oldest",
      label: t("models.toolbar.sortOldest"),
      short: t("models.toolbar.sortShortOldest"),
    },
  ];
}

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
  resultCount,
}: Props) {
  const { t } = useT();
  const SORT_OPTIONS = getSortOptions(t);
  const sortShort =
    SORT_OPTIONS.find((o) => o.value === sortBy)?.short ?? "A–Z";

  return (
    <Box flexShrink={0}>
      {/* Row 1 - the "address bar": title, search, NSFW toggle. */}
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
          <Heading size={"sm"}>{t("models.toolbar.title")}</Heading>
        </HStack>
        <Box flex={1} />
        <HStack gap={2} flexShrink={0} pr={12}>
          <SearchInput
            searchValue={searchQuery}
            onUpdateSearchValue={setSearchQuery}
            placeholder={t("models.toolbar.searchPlaceholder")}
            style={{ width: "300px" }}
            variant={"filled"}
            borderRadius={"full"}
            mb={0}
          />
          <NsfwToggleButton />
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
              ? `${t("models.toolbar.searchPrefix")} „${searchQuery.trim()}“`
              : prettyCategory(selectedModel)}
          </Text>
          <Badge borderRadius={"full"} px={2} flexShrink={0}>
            {resultCount}
          </Badge>
        </HStack>

        <HStack gap={1} flexShrink={0}>
          <Menu closeOnSelect={true}>
            <Tooltip label={t("models.toolbar.sortTooltip")}>
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

          <Tooltip label={t("models.toolbar.refreshTooltip")}>
            <Button
              size={"xs"}
              variant={"ghost"}
              leftIcon={<IconRefresh size={15} />}
              onClick={onRefresh}
            >
              {t("models.toolbar.refreshButton")}
            </Button>
          </Tooltip>

          <Tooltip
            label={
              favoritesOnly
                ? t("models.toolbar.showAllTooltip")
                : t("models.toolbar.showFavoritesOnlyTooltip")
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
              {t("models.toolbar.favoritesButton")}
            </Button>
          </Tooltip>
        </HStack>
      </Flex>
    </Box>
  );
}
