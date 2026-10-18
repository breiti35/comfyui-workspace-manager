import {
  Badge,
  Box,
  Button,
  Flex,
  Grid,
  HStack,
  IconButton,
  Image,
  Input,
  InputGroup,
  InputLeftElement,
  Text,
  Tooltip,
  useToast,
} from "@chakra-ui/react";
import {
  IconCopy,
  IconPencil,
  IconPlus,
  IconSearch,
} from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { hideScrollbarSx } from "../model-manager/utils";
import { useT } from "../i18n/LanguageContext";
import { LibraryHeader } from "../library/primitives";
import { useLibrarySubLevel } from "../library/libraryContext";
import PromptEditor from "./PromptEditor";
import {
  addPrompt,
  collectTags,
  deletePrompt,
  listPrompts,
  PROMPTS_CHANGED_EVENT,
  updatePrompt,
  type PromptRecipe,
} from "./promptsStore";

interface Props {
  onClose: () => void;
}

function PromptCard({
  item,
  onEdit,
  onCopy,
}: {
  item: PromptRecipe;
  onEdit: () => void;
  onCopy: () => void;
}) {
  const { t } = useT();
  return (
    <Box
      role={"group"}
      position={"relative"}
      borderRadius={"lg"}
      overflow={"hidden"}
      border={"1px solid"}
      borderColor={"rowBorderColor"}
      bg={"galleryPanelBg"}
      cursor={"pointer"}
      onClick={onEdit}
      _hover={{ borderColor: "blue.400" }}
      transition={"border-color 0.12s ease"}
      display={"flex"}
      flexDirection={"column"}
    >
      {item.thumbnail && (
        <Image
          src={`/workspace/view_media?filename=${item.thumbnail}`}
          loading={"lazy"}
          w={"100%"}
          h={"120px"}
          objectFit={"cover"}
          alt={item.name}
        />
      )}
      <Box p={3} flex={1} minH={0}>
        <Flex justify={"space-between"} align={"flex-start"} gap={2}>
          <Text fontWeight={600} fontSize={"sm"} noOfLines={2}>
            {item.name}
          </Text>
          <HStack
            gap={1}
            opacity={0}
            _groupHover={{ opacity: 1 }}
            transition={"opacity 0.12s"}
            flexShrink={0}
          >
            <Tooltip label={t("prompts.copyPositive")}>
              <IconButton
                size={"xs"}
                variant={"ghost"}
                aria-label={t("prompts.copyPositive")}
                icon={<IconCopy size={14} />}
                onClick={(e) => {
                  e.stopPropagation();
                  onCopy();
                }}
              />
            </Tooltip>
            <Tooltip label={t("prompts.edit")}>
              <IconButton
                size={"xs"}
                variant={"ghost"}
                aria-label={t("prompts.edit")}
                icon={<IconPencil size={14} />}
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
              />
            </Tooltip>
          </HStack>
        </Flex>

        <Text fontSize={"xs"} color={"gray.500"} noOfLines={3} mt={1}>
          {item.positive || "—"}
        </Text>

        <HStack gap={1} mt={2} flexWrap={"wrap"}>
          {item.model && (
            <Badge
              colorScheme={"blue"}
              variant={"subtle"}
              fontSize={"9px"}
              textTransform={"none"}
            >
              {item.model}
            </Badge>
          )}
          {!!item.loras?.length && (
            <Badge
              variant={"subtle"}
              fontSize={"9px"}
              textTransform={"none"}
            >
              {item.loras.length} LoRA
            </Badge>
          )}
          {item.tags?.map((tag) => (
            <Badge
              key={tag}
              variant={"outline"}
              fontSize={"9px"}
              textTransform={"none"}
            >
              {tag}
            </Badge>
          ))}
        </HStack>
      </Box>
    </Box>
  );
}

export default function PromptLibraryModal(_props: Partial<Props>) {
  const { t } = useT();
  const toast = useToast();
  const [items, setItems] = useState<PromptRecipe[]>([]);
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  // undefined = grid, null = creating a new entry, object = editing
  const [editing, setEditing] = useState<PromptRecipe | null | undefined>(
    undefined,
  );
  const closeEditing = useCallback(() => setEditing(undefined), []);
  // Esc backs out of the editor first, then closes the library.
  useLibrarySubLevel("promptLibrary", editing !== undefined, closeEditing);

  // true when the library couldn't be read. Shown instead of the "empty
  // library" hint, and the "New" button is disabled - the store refuses
  // writes until a load succeeded anyway.
  const [loadError, setLoadError] = useState(false);

  const refresh = useCallback(() => {
    listPrompts(true)
      .then((list) => {
        setItems(list);
        setLoadError(false);
      })
      .catch((e) => {
        console.error("Error loading prompt library:", e);
        setLoadError(true);
      });
  }, []);

  // Save/delete failures keep the editor open so nothing typed is lost.
  const runMutation = async (action: () => Promise<unknown>) => {
    try {
      await action();
      setEditing(undefined);
    } catch (e) {
      toast({
        title: t("prompts.saveError"),
        description: e instanceof Error ? e.message : String(e),
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    }
  };

  useEffect(() => {
    refresh();
    window.addEventListener(PROMPTS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(PROMPTS_CHANGED_EVENT, refresh);
  }, [refresh]);

  const tags = useMemo(() => collectTags(items), [items]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((p) => {
      if (activeTag && !p.tags?.includes(activeTag)) return false;
      if (!q) return true;
      return [p.name, p.positive, p.negative, p.model, ...(p.loras ?? [])]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [items, query, activeTag]);

  const copyPositive = (p: PromptRecipe) => {
    navigator.clipboard?.writeText(p.positive);
    toast({
      title: t("prompts.copied"),
      status: "success",
      duration: 1400,
    });
  };

  return (
    <div className="lib-section">
      <LibraryHeader
        title={t("prompts.title")}
        subtitle={editing === undefined ? String(shown.length) : undefined}
        actions={
          editing === undefined ? (
            <button
              type="button"
              className="lib-btn primary"
              disabled={loadError}
              onClick={() => setEditing(null)}
            >
              <IconPlus size={16} />
              {t("prompts.new")}
            </button>
          ) : undefined
        }
      />
      <Flex
        direction={"column"}
        flex={1}
        minH={0}
        overflow={"hidden"}
        sx={{
          "--chakra-colors-galleryPanelBg": "var(--lib-card)",
          "--chakra-colors-rowBorderColor": "var(--lib-line)",
        }}
      >
          {editing !== undefined ? (
            <PromptEditor
              value={editing}
              onCancel={() => setEditing(undefined)}
              onDelete={
                editing
                  ? () => runMutation(() => deletePrompt(editing.id))
                  : undefined
              }
              onSave={(data) =>
                runMutation(() =>
                  editing ? updatePrompt(editing.id, data) : addPrompt(data),
                )
              }
            />
          ) : (
            <>
              <Flex
                align={"center"}
                gap={3}
                px={4}
                py={2}
                flexShrink={0}
                bg={"galleryPanelBg"}
                borderBottom={"1px solid"}
                borderColor={"rowBorderColor"}
                flexWrap={"wrap"}
              >
                <InputGroup size={"sm"} maxW={"280px"}>
                  <InputLeftElement pointerEvents={"none"}>
                    <IconSearch size={15} />
                  </InputLeftElement>
                  <Input
                    variant={"filled"}
                    borderRadius={"sm"}
                    placeholder={t("prompts.searchPlaceholder")}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </InputGroup>
              </Flex>

              {tags.length > 0 && (
                <HStack
                  gap={1}
                  px={4}
                  py={2}
                  flexShrink={0}
                  flexWrap={"wrap"}
                  borderBottom={"1px solid"}
                  borderColor={"rowBorderColor"}
                >
                  <Button
                    size={"xs"}
                    variant={activeTag == null ? "solid" : "ghost"}
                    colorScheme={activeTag == null ? "blue" : "gray"}
                    onClick={() => setActiveTag(null)}
                  >
                    {t("prompts.allTags")}
                  </Button>
                  {tags.map((tag) => (
                    <Button
                      key={tag}
                      size={"xs"}
                      variant={activeTag === tag ? "solid" : "ghost"}
                      colorScheme={activeTag === tag ? "blue" : "gray"}
                      onClick={() =>
                        setActiveTag(activeTag === tag ? null : tag)
                      }
                    >
                      {tag}
                    </Button>
                  ))}
                </HStack>
              )}

              <Box
                flex={1}
                minHeight={0}
                overflowY={"auto"}
                px={4}
                py={4}
                sx={hideScrollbarSx}
              >
                {loadError ? (
                  <Flex
                    direction={"column"}
                    align={"center"}
                    justify={"center"}
                    py={16}
                    gap={2}
                  >
                    <Text color={"red.300"} fontSize={"sm"}>
                      {t("prompts.loadError")}
                    </Text>
                    <Button size={"xs"} variant={"outline"} onClick={refresh}>
                      {t("prompts.retry")}
                    </Button>
                  </Flex>
                ) : shown.length === 0 ? (
                  <Flex
                    direction={"column"}
                    align={"center"}
                    justify={"center"}
                    py={16}
                    gap={2}
                  >
                    <Text color={"gray.500"} fontSize={"sm"}>
                      {items.length === 0
                        ? t("prompts.emptyLibrary")
                        : t("prompts.noMatches")}
                    </Text>
                    {items.length === 0 && (
                      <Text color={"gray.600"} fontSize={"xs"}>
                        {t("prompts.emptyHint")}
                      </Text>
                    )}
                  </Flex>
                ) : (
                  <Grid
                    templateColumns={"repeat(auto-fill, minmax(260px, 1fr))"}
                    gap={3}
                  >
                    {shown.map((p) => (
                      <PromptCard
                        key={p.id}
                        item={p}
                        onEdit={() => setEditing(p)}
                        onCopy={() => copyPositive(p)}
                      />
                    ))}
                  </Grid>
                )}
              </Box>
            </>
          )}
      </Flex>
    </div>
  );
}
