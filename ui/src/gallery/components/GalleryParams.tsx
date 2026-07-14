import { ReactNode, useMemo, useState } from "react";
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
  Flex,
  HStack,
  IconButton,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import { PromptNodeInputItem } from "./MetaBox/utils.ts";
import { useT } from "../../i18n/LanguageContext";

const fmt = (v: any): string =>
  Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v);

// First scalar input matching a node-type pattern and one of the given names.
function pick(
  list: PromptNodeInputItem[],
  ctRe: RegExp,
  names: string[],
): any {
  return list.find((i) => ctRe.test(i.classType) && names.includes(i.inputName))
    ?.inputValue;
}

function CopyButton({ value }: { value: string }) {
  const { t } = useT();
  const [done, setDone] = useState(false);
  if (!value) return null;
  return (
    <Tooltip label={done ? t("gallery.copied") : t("gallery.copy")}>
      <IconButton
        aria-label={"Kopieren"}
        size={"xs"}
        variant={"ghost"}
        icon={done ? <IconCheck size={13} /> : <IconCopy size={13} />}
        onClick={() => {
          navigator.clipboard?.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        }}
      />
    </Tooltip>
  );
}

// Read-only key/value row. Hidden when the value is empty.
function KV({
  label,
  value,
  copy,
}: {
  label: string;
  value: string;
  copy?: boolean;
}) {
  if (value === "") return null;
  return (
    <Flex justify={"space-between"} align={"center"} gap={3} py={0.5}>
      <Text fontSize={"xs"} color={"gray.500"} flexShrink={0}>
        {label}
      </Text>
      <HStack gap={1} minW={0}>
        <Text
          fontSize={"xs"}
          fontFamily={"mono"}
          textAlign={"right"}
          wordBreak={"break-word"}
        >
          {value}
        </Text>
        {copy && <CopyButton value={value} />}
      </HStack>
    </Flex>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box
      bg={"galleryPanelBg"}
      border={"1px solid"}
      borderColor={"rowBorderColor"}
      borderRadius={"lg"}
      p={3}
    >
      <Text
        fontSize={"xs"}
        textTransform={"uppercase"}
        letterSpacing={"wider"}
        color={"gray.500"}
        mb={2}
      >
        {title}
      </Text>
      {children}
    </Box>
  );
}

function PromptBlock({ label, text }: { label: string; text: string }) {
  return (
    <Box>
      <HStack justify={"space-between"} mb={1}>
        <Text fontSize={"xs"} color={"gray.500"}>
          {label}
        </Text>
        <CopyButton value={text} />
      </HStack>
      <Box
        bg={"rowHoverBg"}
        borderRadius={"md"}
        px={2}
        py={1.5}
        fontSize={"xs"}
        maxH={"160px"}
        overflowY={"auto"}
        whiteSpace={"pre-wrap"}
        wordBreak={"break-word"}
      >
        {text || (
          <Text as={"span"} color={"gray.600"}>
            —
          </Text>
        )}
      </Box>
    </Box>
  );
}

// Read-only view of an image's generation parameters. Surfaces the essentials
// (model, prompts, sampling, size, LoRAs) up top and keeps the full node dump
// in a collapsed accordion - all display-only, no fake-editable controls.
export default function GalleryParams({
  inputList,
}: {
  inputList: PromptNodeInputItem[];
}) {
  const { t } = useT();
  const essentials = useMemo(() => {
    const model = pick(inputList, /checkpoint|unet|diffusionmodel/i, [
      "ckpt_name",
      "unet_name",
      "model_name",
    ]);

    const clipTexts = inputList.filter(
      (i) => /cliptextencode/i.test(i.classType) && i.inputName === "text",
    );
    const pos = clipTexts
      .filter((i) => i.children?.[0] === "positive")
      .map((i) => fmt(i.inputValue));
    const neg = clipTexts
      .filter((i) => i.children?.[0] === "negative")
      .map((i) => fmt(i.inputValue));
    // Fallback when the positive/negative wiring can't be detected: show every
    // CLIPTextEncode text as a generic prompt so nothing is hidden.
    const generic =
      pos.length === 0 && neg.length === 0
        ? clipTexts.map((i) => fmt(i.inputValue))
        : [];

    const samplerRe = /ksampler|sampler/i;
    const seed = pick(inputList, samplerRe, ["seed", "noise_seed"]);
    const steps = pick(inputList, samplerRe, ["steps"]);
    const cfg = pick(inputList, samplerRe, ["cfg"]);
    const sampler = pick(inputList, samplerRe, ["sampler_name"]);
    const scheduler = pick(inputList, samplerRe, ["scheduler"]);
    const denoise = pick(inputList, samplerRe, ["denoise"]);
    const width = pick(inputList, /latent|empty/i, ["width"]);
    const height = pick(inputList, /latent|empty/i, ["height"]);

    const loras = inputList
      .filter(
        (i) =>
          /lora/i.test(i.classType) &&
          /lora/i.test(i.inputName) &&
          fmt(i.inputValue) !== "" &&
          fmt(i.inputValue).toLowerCase() !== "none",
      )
      .map((i) => fmt(i.inputValue));

    const hasSampling = [
      seed,
      steps,
      cfg,
      sampler,
      scheduler,
      denoise,
      width,
    ].some((v) => v != null && v !== "");

    return {
      model,
      positive: pos.join("\n"),
      negative: neg.join("\n"),
      generic,
      seed,
      steps,
      cfg,
      sampler,
      scheduler,
      denoise,
      width,
      height,
      loras,
      hasSampling,
    };
  }, [inputList]);

  // Group consecutive inputs by their node for the "Alle Nodes" dump.
  const nodeGroups = useMemo(() => {
    const groups: PromptNodeInputItem[][] = [];
    inputList.forEach((inp) => {
      const last = groups[groups.length - 1];
      if (!last || last[0].nodeID !== inp.nodeID) groups.push([inp]);
      else last.push(inp);
    });
    return groups;
  }, [inputList]);

  if (inputList.length === 0) {
    return (
      <Text fontSize={"sm"} color={"gray.500"}>
        {t("gallery.noMetadata")}
      </Text>
    );
  }

  const hasPrompt =
    essentials.positive !== "" ||
    essentials.negative !== "" ||
    essentials.generic.length > 0;

  return (
    <Flex direction={"column"} gap={3}>
      {essentials.model && (
        <Section title={t("gallery.section.model")}>
          <Text fontSize={"sm"} fontFamily={"mono"} wordBreak={"break-word"}>
            {fmt(essentials.model)}
          </Text>
        </Section>
      )}

      {hasPrompt && (
        <Section title={t("gallery.section.prompt")}>
          <Flex direction={"column"} gap={3}>
            {essentials.generic.length > 0 ? (
              essentials.generic.map((text, i) => (
                <PromptBlock
                  key={i}
                  label={`${t("gallery.section.prompt")} ${i + 1}`}
                  text={text}
                />
              ))
            ) : (
              <>
                <PromptBlock
                  label={t("gallery.positive")}
                  text={essentials.positive}
                />
                {essentials.negative !== "" && (
                  <PromptBlock
                    label={t("gallery.negative")}
                    text={essentials.negative}
                  />
                )}
              </>
            )}
          </Flex>
        </Section>
      )}

      {essentials.hasSampling && (
        <Section title={t("gallery.section.sampling")}>
          <KV label={"Seed"} value={fmt(essentials.seed)} copy />
          <KV label={"Steps"} value={fmt(essentials.steps)} />
          <KV label={"CFG"} value={fmt(essentials.cfg)} />
          <KV label={"Sampler"} value={fmt(essentials.sampler)} />
          <KV label={"Scheduler"} value={fmt(essentials.scheduler)} />
          <KV label={"Denoise"} value={fmt(essentials.denoise)} />
          <KV
            label={t("gallery.size")}
            value={
              essentials.width && essentials.height
                ? `${fmt(essentials.width)} × ${fmt(essentials.height)}`
                : ""
            }
          />
        </Section>
      )}

      {essentials.loras.length > 0 && (
        <Section title={t("gallery.section.loras")}>
          <Flex direction={"column"} gap={1}>
            {essentials.loras.map((l, i) => (
              <Text key={i} fontSize={"xs"} fontFamily={"mono"}>
                {l}
              </Text>
            ))}
          </Flex>
        </Section>
      )}

      <Box>
        <Text
          fontSize={"xs"}
          textTransform={"uppercase"}
          letterSpacing={"wider"}
          color={"gray.500"}
          mb={2}
        >
          {t("gallery.section.allNodes")}
        </Text>
        <Accordion allowMultiple>
          {nodeGroups.map((g) => (
            <AccordionItem
              key={g[0].nodeID}
              border={"1px solid"}
              borderColor={"rowBorderColor"}
              borderRadius={"md"}
              mb={1}
            >
              <AccordionButton px={3} py={2}>
                <Box
                  flex={1}
                  textAlign={"left"}
                  fontSize={"sm"}
                  fontWeight={600}
                  noOfLines={1}
                >
                  {g[0].classType}
                  <Text as={"span"} color={"gray.500"} fontWeight={400}>
                    {" #"}
                    {g[0].nodeID}
                  </Text>
                </Box>
                <AccordionIcon />
              </AccordionButton>
              <AccordionPanel px={3} pb={3} pt={0}>
                {g.map((inp) => (
                  <KV
                    key={inp.inputName}
                    label={inp.inputName}
                    value={fmt(inp.inputValue)}
                  />
                ))}
              </AccordionPanel>
            </AccordionItem>
          ))}
        </Accordion>
      </Box>
    </Flex>
  );
}
