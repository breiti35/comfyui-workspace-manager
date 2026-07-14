import {
  Box,
  HStack,
  IconButton,
  Text,
  Wrap,
  WrapItem,
} from "@chakra-ui/react";
import { IconCopy } from "@tabler/icons-react";
import type { ReactNode } from "react";
import type { CivitImageWithMeta } from "../api/civitDetailApi";
import { useT } from "../../i18n/LanguageContext";

export const NSFW_BLUR_FILTER = "blur(20px)";

// Civitai's numeric browsing level: 1=PG, 2=PG13, 4=R, 8=X, 16=XXX.
export const NSFW_STRING_TO_LEVEL: Record<string, number> = {
  None: 1,
  Soft: 2,
  Mature: 4,
  X: 8,
};

export function nsfwLevelNum(lvl?: number | string): number {
  if (typeof lvl === "number") return lvl;
  if (typeof lvl === "string") return NSFW_STRING_TO_LEVEL[lvl] ?? 1;
  return 1;
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Text
      fontSize={"xs"}
      textTransform={"uppercase"}
      letterSpacing={"wider"}
      color={"gray.500"}
      mb={2}
    >
      {children}
    </Text>
  );
}

export function ImageMeta({
  meta,
  onCopy,
}: {
  meta?: CivitImageWithMeta["meta"];
  onCopy: (text: string, label: string) => void;
}) {
  const { t } = useT();
  if (!meta || (!meta.prompt && !meta.sampler && meta.seed == null)) {
    return (
      <Text fontSize={"xs"} color={"gray.500"} mt={1}>
        {t("models.civitDetail.noPromptData")}
      </Text>
    );
  }
  return (
    <Box
      mt={1}
      p={2}
      borderRadius={"md"}
      border={"1px solid"}
      borderColor={"rowBorderColor"}
      fontSize={"xs"}
    >
      {meta.prompt && (
        <Box mb={2}>
          <HStack justify={"space-between"} mb={1}>
            <Text color={"gray.500"}>Prompt</Text>
            <IconButton
              size={"xs"}
              variant={"ghost"}
              aria-label={t("models.civitDetail.copyPromptAria")}
              icon={<IconCopy size={13} />}
              onClick={() => onCopy(meta.prompt ?? "", "Prompt")}
            />
          </HStack>
          <Text noOfLines={4}>{meta.prompt}</Text>
        </Box>
      )}
      <Wrap spacing={2} color={"gray.500"}>
        {meta.sampler && <WrapItem>Sampler: {meta.sampler}</WrapItem>}
        {meta.steps != null && <WrapItem>Steps: {meta.steps}</WrapItem>}
        {meta.cfgScale != null && <WrapItem>CFG: {meta.cfgScale}</WrapItem>}
        {meta.seed != null && <WrapItem>Seed: {meta.seed}</WrapItem>}
      </Wrap>
    </Box>
  );
}
