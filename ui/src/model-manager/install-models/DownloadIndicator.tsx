import {
  Badge,
  Box,
  Button,
  CircularProgress,
  Flex,
  HStack,
  IconButton,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverContent,
  PopoverHeader,
  PopoverTrigger,
  Portal,
  Progress,
  Spinner,
  Text,
  Tooltip,
  VStack,
} from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { IconX } from "@tabler/icons-react";
import { requestCancel, type DownloadEntry } from "./downloadStore";
import { useDownloads } from "./useDownloads";
import { formatEta, formatSpeed } from "../utils";
import { useT } from "../../i18n/LanguageContext";
import type { TransKey } from "../../i18n/translations";
import { TOPBAR_BUTTON_HEIGHT } from "../../const";

/**
 * Chakra's Portal renders the popover outside this component's React tree, and
 * LanguageContext falls back to a silent English default when its provider is
 * out of reach - which is why the rows have to be handed `t` explicitly
 * instead of calling useT() themselves.
 */
type Translate = (key: TransKey) => string;

/**
 * Always-mounted download indicator for the topbar. Downloads keep running in
 * the backend regardless of which panel (if any) is open, and closing the
 * install panel used to mean losing all visibility - and the only cancel
 * button (InstallProgress.tsx) is never actually rendered anywhere. This
 * reads the app-level store (see downloadStore.ts) so it stays accurate and
 * reachable no matter what the user is looking at.
 */
export default function DownloadIndicator() {
  const { t } = useT();
  const { active, pending, isDownloading, overallProgress } = useDownloads();

  // Cancel is fire-and-forget on the backend; the entry only disappears once
  // the next download_progress queue update arrives. Track in-flight cancels
  // locally so the button can go "quiet" immediately instead of looking like
  // the click did nothing.
  const [cancelling, setCancelling] = useState<Set<string>>(new Set());

  useEffect(() => {
    setCancelling((prev) => {
      if (prev.size === 0) return prev;
      const activePaths = new Set(active.map((a) => a.savePath));
      const next = new Set([...prev].filter((p) => activePaths.has(p)));
      return next.size === prev.size ? prev : next;
    });
  }, [active]);

  if (!isDownloading) return null;

  const count = active.length + pending.length;
  const hasProgress = active.length > 0;

  const handleCancel = (savePath: string) => {
    setCancelling((prev) => new Set(prev).add(savePath));
    requestCancel(savePath);
  };

  const triggerLabel = t("install.downloads.triggerTooltip");

  return (
    <Popover placement={"bottom-start"} isLazy>
      <PopoverTrigger>
        <Button
          size={"sm"}
          variant={"ghost"}
          color={"white"}
          colorScheme="blue"
          aria-label={triggerLabel}
          px={2}
          height={TOPBAR_BUTTON_HEIGHT + "px"}
        >
          <HStack spacing={1.5}>
            <CircularProgress
              value={overallProgress}
              isIndeterminate={!hasProgress}
              size={"16px"}
              thickness={"14px"}
              color={"blue.300"}
              trackColor={"whiteAlpha.300"}
              capIsRound
            />
            {hasProgress && (
              <Text fontSize={"xs"}>{Math.round(overallProgress)}%</Text>
            )}
            {count > 1 && (
              <Badge
                borderRadius={"full"}
                fontSize={"9px"}
                colorScheme={"blue"}
                px={1.5}
              >
                {count}
              </Badge>
            )}
          </HStack>
        </Button>
      </PopoverTrigger>
      <Portal>
        {/* Portal escapes the topbar's transformed (draggable) container -
            without it, Popper's fixed-position math would be relative to
            that container instead of the viewport. */}
        <PopoverContent
          bg={"galleryPanelBg"}
          borderColor={"rowBorderColor"}
          w={"300px"}
        >
          <PopoverArrow bg={"galleryPanelBg"} />
          <PopoverHeader
            borderColor={"rowBorderColor"}
            fontSize={"sm"}
            fontWeight={600}
            py={2}
          >
            {t("install.downloads.popoverTitle")}
          </PopoverHeader>
          <PopoverBody p={1} maxH={"320px"} overflowY={"auto"}>
            <VStack
              align={"stretch"}
              spacing={0}
              divider={<Box borderBottomWidth={"1px"} borderColor={"rowBorderColor"} />}
            >
              {active.map((entry) => (
                <ActiveRow
                  key={entry.savePath}
                  entry={entry}
                  cancelling={cancelling.has(entry.savePath)}
                  onCancel={() => handleCancel(entry.savePath)}
                  t={t}
                />
              ))}
              {pending.map((fileName) => (
                <PendingRow key={fileName} fileName={fileName} t={t} />
              ))}
            </VStack>
          </PopoverBody>
        </PopoverContent>
      </Portal>
    </Popover>
  );
}

function ActiveRow({
  entry,
  cancelling,
  onCancel,
  t,
}: {
  entry: DownloadEntry;
  cancelling: boolean;
  onCancel: () => void;
  t: Translate;
}) {
  // While cancelling, replace speed/eta with a plain status word - an
  // unobtrusive but visible confirmation that the click registered, not just
  // a tooltip the user has to go looking for.
  const meta = cancelling
    ? t("install.downloads.cancelling")
    : [formatSpeed(entry.speed), formatEta(entry.eta)].filter(Boolean).join(" · ");

  return (
    <Flex align={"center"} gap={2} px={2} py={2} _hover={{ bg: "rowHoverBg" }}>
      <Box flex={1} minW={0}>
        <Tooltip label={entry.fileName}>
          <Text fontSize={"xs"} fontWeight={500} noOfLines={1}>
            {entry.fileName}
          </Text>
        </Tooltip>
        <Progress
          value={entry.progress}
          size={"xs"}
          borderRadius={"full"}
          colorScheme={"blue"}
          bg={"whiteAlpha.200"}
          mt={1.5}
        />
        <Flex justify={"space-between"} mt={1}>
          <Text fontSize={"10px"} color={"gray.400"} noOfLines={1}>
            {meta || " "}
          </Text>
          <Text fontSize={"10px"} color={"gray.400"} flexShrink={0} ml={2}>
            {Math.round(entry.progress)}%
          </Text>
        </Flex>
      </Box>
      <Tooltip
        label={
          cancelling ? t("install.downloads.cancelling") : t("install.downloads.cancelAria")
        }
      >
        <IconButton
          aria-label={
            cancelling
              ? t("install.downloads.cancelling")
              : t("install.downloads.cancelAria")
          }
          // Muted red, in line with the "tinted, not solid" semantic color
          // convention used across the panel (e.g. the NSFW reveal button).
          icon={cancelling ? <Spinner size={"xs"} /> : <IconX size={13} />}
          size={"xs"}
          isDisabled={cancelling}
          bg={"rgba(229,62,62,0.14)"}
          color={"red.300"}
          _hover={{ bg: "rgba(229,62,62,0.24)" }}
          _disabled={{ bg: "rgba(229,62,62,0.08)", cursor: "default" }}
          onClick={onCancel}
        />
      </Tooltip>
    </Flex>
  );
}

function PendingRow({ fileName, t }: { fileName: string; t: Translate }) {
  return (
    <Box px={2} py={2} _hover={{ bg: "rowHoverBg" }}>
      <Tooltip label={fileName}>
        <Text fontSize={"xs"} fontWeight={500} noOfLines={1}>
          {fileName}
        </Text>
      </Tooltip>
      <Progress
        isIndeterminate
        size={"xs"}
        borderRadius={"full"}
        colorScheme={"blue"}
        bg={"whiteAlpha.200"}
        mt={1.5}
      />
      <Text fontSize={"10px"} color={"gray.500"} mt={1}>
        {t("install.downloads.preparing")}
      </Text>
    </Box>
  );
}
