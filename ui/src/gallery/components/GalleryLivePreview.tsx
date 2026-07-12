import {
  Badge,
  Box,
  Flex,
  Image,
  SimpleGrid,
  Text,
  keyframes,
} from "@chakra-ui/react";
import { IconLivePhoto } from "@tabler/icons-react";
import type { LivePreviewFrame } from "../GalleryContext.ts";

const glow = keyframes`
  0% { box-shadow: 0 0 0 0 rgba(66, 153, 225, 0.5); }
  70% { box-shadow: 0 0 0 6px rgba(66, 153, 225, 0); }
  100% { box-shadow: 0 0 0 0 rgba(66, 153, 225, 0); }
`;

interface Props {
  frames: LivePreviewFrame[];
  isGenerating: boolean;
}

export function GalleryLivePreview({ frames, isGenerating }: Props) {
  if (frames.length === 0) {
    return (
      <Flex
        direction={"column"}
        align={"center"}
        justify={"center"}
        h={"100%"}
        gap={3}
        color={"gray.500"}
        textAlign={"center"}
        px={6}
      >
        <IconLivePhoto size={48} stroke={1.2} />
        <Text fontSize={"md"} fontWeight={500}>
          {isGenerating
            ? "Warte auf erstes Vorschaubild …"
            : "Keine laufende Generierung"}
        </Text>
        <Text fontSize={"sm"} maxW={"420px"}>
          Zwischenbilder erscheinen hier live, während ComfyUI generiert. Sie
          sind flüchtig und werden nicht gespeichert – sobald ein Bild fertig
          ist, taucht es unter „Dieser Workflow" auf.
        </Text>
      </Flex>
    );
  }

  return (
    <SimpleGrid minChildWidth={"240px"} spacing={4}>
      {frames.map((frame) => (
        <Box
          key={frame.id}
          position={"relative"}
          borderRadius={"lg"}
          overflow={"hidden"}
          border={"1px solid"}
          borderColor={"blue.400"}
          animation={`${glow} 1.8s ease-in-out infinite`}
        >
          <Image
            src={frame.url}
            w={"100%"}
            objectFit={"contain"}
            alt={"live preview frame"}
          />
          <Badge
            position={"absolute"}
            top={2}
            left={2}
            colorScheme={"blue"}
            borderRadius={"full"}
            px={2}
            display={"flex"}
            alignItems={"center"}
            gap={1}
          >
            <Box
              as={"span"}
              w={"6px"}
              h={"6px"}
              borderRadius={"full"}
              bg={"green.300"}
            />
            läuft
          </Badge>
        </Box>
      ))}
    </SimpleGrid>
  );
}
