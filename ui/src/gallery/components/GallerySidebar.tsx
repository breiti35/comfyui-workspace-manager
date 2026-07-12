import { Badge, Box, Flex, Text, VStack, keyframes } from "@chakra-ui/react";
import { IconPhotoScan, IconLayoutGrid, IconPhoto } from "@tabler/icons-react";
import type { GallerySection } from "../GalleryContext.ts";

const pulse = keyframes`
  0% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.6); opacity: 0.4; }
  100% { transform: scale(1); opacity: 1; }
`;

interface Props {
  section: GallerySection;
  onSelect: (section: GallerySection) => void;
  workflowCount: number;
  allCount: number;
  previewCount: number;
  isGenerating: boolean;
}

const ITEMS: {
  key: GallerySection;
  label: string;
  icon: typeof IconPhoto;
}[] = [
  { key: "workflow", label: "Dieser Workflow", icon: IconPhoto },
  { key: "all", label: "Alle Bilder", icon: IconLayoutGrid },
  { key: "preview", label: "Preview Image", icon: IconPhotoScan },
];

export function GallerySidebar({
  section,
  onSelect,
  workflowCount,
  allCount,
  previewCount,
  isGenerating,
}: Props) {
  return (
    <VStack
      align={"stretch"}
      spacing={1}
      p={2}
      w={"210px"}
      flexShrink={0}
      bg={"galleryPanelBg"}
      borderRight={"1px solid"}
      borderColor={"rowBorderColor"}
      h={"100%"}
      overflowY={"auto"}
    >
      <Text
        px={3}
        pt={2}
        pb={1}
        fontSize={"xs"}
        textTransform={"uppercase"}
        letterSpacing={"wider"}
        color={"gray.500"}
      >
        Galerie
      </Text>
      {ITEMS.map((item) => {
        const Icon = item.icon;
        const active = section === item.key;
        const count =
          item.key === "workflow"
            ? workflowCount
            : item.key === "all"
              ? allCount
              : previewCount;
        return (
          <Flex
            as={"button"}
            key={item.key}
            onClick={() => onSelect(item.key)}
            align={"center"}
            gap={3}
            px={3}
            py={2}
            borderRadius={"md"}
            borderLeft={"3px solid"}
            borderColor={active ? "blue.400" : "transparent"}
            bg={active ? "galleryActiveBg" : "transparent"}
            _hover={{ bg: active ? "galleryActiveBg" : "rowHoverBg" }}
            textAlign={"left"}
            transition={"background 0.12s ease"}
          >
            <Icon size={18} />
            <Text flex={1} fontSize={"sm"} fontWeight={active ? 600 : 400}>
              {item.label}
            </Text>
            {item.key === "preview" && isGenerating ? (
              <Box
                w={"8px"}
                h={"8px"}
                borderRadius={"full"}
                bg={"green.400"}
                animation={`${pulse} 1.3s ease-in-out infinite`}
              />
            ) : count > 0 ? (
              <Badge
                colorScheme={active ? "blue" : "gray"}
                borderRadius={"full"}
                px={2}
              >
                {count}
              </Badge>
            ) : null}
          </Flex>
        );
      })}
    </VStack>
  );
}
