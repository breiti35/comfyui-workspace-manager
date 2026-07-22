import {
  Box,
  Button,
  Flex,
  Grid,
  HStack,
  IconButton,
  Input,
  Textarea,
  Tooltip,
  Text,
} from "@chakra-ui/react";
import { IconArrowLeft, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { hideScrollbarSx } from "../model-manager/utils";
import { useT } from "../i18n/LanguageContext";
import type { PromptRecipe } from "./promptsStore";

interface Props {
  /** null = create a new entry */
  value: PromptRecipe | null;
  onSave: (data: Omit<PromptRecipe, "id" | "createTime">) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

const splitList = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

export default function PromptEditor({
  value,
  onSave,
  onCancel,
  onDelete,
}: Props) {
  const { t } = useT();
  const [name, setName] = useState(value?.name ?? "");
  const [tags, setTags] = useState((value?.tags ?? []).join(", "));
  const [positive, setPositive] = useState(value?.positive ?? "");
  const [negative, setNegative] = useState(value?.negative ?? "");
  const [model, setModel] = useState(value?.model ?? "");
  const [loras, setLoras] = useState((value?.loras ?? []).join(", "));
  const [sampler, setSampler] = useState(value?.sampler ?? "");
  const [scheduler, setScheduler] = useState(value?.scheduler ?? "");
  const [steps, setSteps] = useState(value?.steps ?? "");
  const [cfg, setCfg] = useState(value?.cfg ?? "");
  const [seed, setSeed] = useState(value?.seed ?? "");
  const [size, setSize] = useState(value?.size ?? "");

  const submit = () => {
    onSave({
      name: name.trim() || t("prompts.untitled"),
      positive,
      negative,
      model: model.trim() || undefined,
      loras: splitList(loras),
      sampler: sampler.trim() || undefined,
      scheduler: scheduler.trim() || undefined,
      steps: String(steps).trim() || undefined,
      cfg: String(cfg).trim() || undefined,
      seed: String(seed).trim() || undefined,
      size: size.trim() || undefined,
      tags: splitList(tags),
      thumbnail: value?.thumbnail,
      updateTime: Date.now(),
    });
  };

  const field = (
    label: string,
    v: string,
    set: (s: string) => void,
    placeholder?: string,
  ) => (
    <Box>
      <Text fontSize={"xs"} color={"gray.500"} mb={1}>
        {label}
      </Text>
      <Input
        size={"sm"}
        value={v}
        placeholder={placeholder}
        onChange={(e) => set(e.target.value)}
      />
    </Box>
  );

  return (
    <Flex direction={"column"} h={"100%"} minH={0}>
      <Flex
        align={"center"}
        gap={2}
        px={4}
        py={2}
        pr={12}
        flexShrink={0}
        bg={"galleryPanelBg"}
        borderBottom={"1px solid"}
        borderColor={"rowBorderColor"}
      >
        <Tooltip label={t("prompts.back")}>
          <IconButton
            size={"sm"}
            variant={"ghost"}
            icon={<IconArrowLeft size={19} />}
            aria-label={t("prompts.back")}
            onClick={onCancel}
          />
        </Tooltip>
        <Text fontWeight={600} fontSize={"sm"} noOfLines={1}>
          {value ? t("prompts.editTitle") : t("prompts.newTitle")}
        </Text>
        <Box flex={1} />
        {onDelete && (
          <Tooltip label={t("prompts.delete")}>
            <IconButton
              size={"sm"}
              variant={"outline"}
              colorScheme={"red"}
              icon={<IconTrash size={16} />}
              aria-label={t("prompts.delete")}
              onClick={onDelete}
            />
          </Tooltip>
        )}
        <Button size={"sm"} colorScheme={"blue"} onClick={submit}>
          {t("prompts.save")}
        </Button>
      </Flex>

      <Box flex={1} minH={0} overflowY={"auto"} p={4} sx={hideScrollbarSx}>
        <Flex direction={"column"} gap={4} maxW={"900px"}>
          <Grid templateColumns={"repeat(auto-fit, minmax(240px, 1fr))"} gap={3}>
            {field(t("prompts.field.name"), name, setName)}
            {field(
              t("prompts.field.tags"),
              tags,
              setTags,
              t("prompts.field.tagsPlaceholder"),
            )}
          </Grid>

          <Box>
            <Text fontSize={"xs"} color={"gray.500"} mb={1}>
              {t("prompts.field.positive")}
            </Text>
            <Textarea
              size={"sm"}
              rows={5}
              value={positive}
              onChange={(e) => setPositive(e.target.value)}
            />
          </Box>
          <Box>
            <Text fontSize={"xs"} color={"gray.500"} mb={1}>
              {t("prompts.field.negative")}
            </Text>
            <Textarea
              size={"sm"}
              rows={3}
              value={negative}
              onChange={(e) => setNegative(e.target.value)}
            />
          </Box>

          <Text
            fontSize={"xs"}
            textTransform={"uppercase"}
            letterSpacing={"wider"}
            color={"gray.500"}
          >
            {t("prompts.section.recipe")}
          </Text>
          <Grid templateColumns={"repeat(auto-fit, minmax(200px, 1fr))"} gap={3}>
            {field(t("prompts.field.model"), model, setModel)}
            {field(
              t("prompts.field.loras"),
              loras,
              setLoras,
              t("prompts.field.tagsPlaceholder"),
            )}
            {field(t("prompts.field.sampler"), sampler, setSampler)}
            {field(t("prompts.field.scheduler"), scheduler, setScheduler)}
            {field(t("prompts.field.steps"), String(steps), setSteps)}
            {field(t("prompts.field.cfg"), String(cfg), setCfg)}
            {field(t("prompts.field.seed"), String(seed), setSeed)}
            {field(t("prompts.field.size"), size, setSize)}
          </Grid>

          <HStack justify={"flex-end"} pt={2}>
            <Button size={"sm"} variant={"ghost"} onClick={onCancel}>
              {t("prompts.cancel")}
            </Button>
            <Button size={"sm"} colorScheme={"blue"} onClick={submit}>
              {t("prompts.save")}
            </Button>
          </HStack>
        </Flex>
      </Box>
    </Flex>
  );
}
