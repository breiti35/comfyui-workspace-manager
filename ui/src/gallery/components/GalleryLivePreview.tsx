import {
  Badge,
  Box,
  Flex,
  Image,
  Spinner,
  Text,
  keyframes,
} from "@chakra-ui/react";
import { IconLivePhoto } from "@tabler/icons-react";
import type { LivePreviewFrame } from "../GalleryContext.ts";
import MetadataForm from "./MetaBox/MetadataForm.tsx";

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
  const frame = frames[0];

  return (
    <Flex gap={4} h={"100%"} align={"stretch"}>
      {/* Left: the transient live frame (size-constrained) or a status hint. */}
      <Flex
        flex={1}
        minW={0}
        direction={"column"}
        align={"center"}
        justify={"center"}
        gap={3}
      >
        {frame ? (
          <Box
            position={"relative"}
            borderRadius={"lg"}
            overflow={"hidden"}
            border={"1px solid"}
            borderColor={"blue.400"}
            animation={`${glow} 1.8s ease-in-out infinite`}
            maxW={"520px"}
            maxH={"60vh"}
          >
            <Image
              src={frame.url}
              maxW={"520px"}
              maxH={"60vh"}
              w={"auto"}
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
        ) : isGenerating ? (
          <Flex
            direction={"column"}
            align={"center"}
            gap={3}
            color={"gray.500"}
            textAlign={"center"}
          >
            <Spinner />
            <Text fontSize={"md"} fontWeight={500}>
              Warte auf erstes Vorschaubild …
            </Text>
          </Flex>
        ) : (
          <Flex
            direction={"column"}
            align={"center"}
            gap={3}
            color={"gray.500"}
            textAlign={"center"}
            px={6}
          >
            <IconLivePhoto size={48} stroke={1.2} />
            <Text fontSize={"md"} fontWeight={500}>
              Keine laufende Generierung
            </Text>
            <Text fontSize={"sm"} maxW={"420px"}>
              Zwischenbilder erscheinen hier live, während ComfyUI generiert.
              Sie sind flüchtig und werden nicht gespeichert – sobald ein Bild
              fertig ist, taucht es unter „Dieser Workflow" auf.
            </Text>
          </Flex>
        )}
      </Flex>

      {/* Right: parameters of the current graph (sampler, steps, cfg, prompt,
          ...) so you can see - and re-tune - what is being generated.
          MetadataForm with media=null reads the live graph via graphToPrompt.
          Remounted per run (key) so a fresh run re-reads the current graph. */}
      <Box
        w={"380px"}
        flexShrink={0}
        overflowY={"auto"}
        borderLeft={"1px solid"}
        borderColor={"rowBorderColor"}
        pl={4}
      >
        <Text
          fontSize={"xs"}
          textTransform={"uppercase"}
          letterSpacing={"wider"}
          color={"gray.500"}
          mb={3}
        >
          Aktuelle Parameter
        </Text>
        <MetadataForm key={isGenerating ? "running" : "idle"} media={null} />
      </Box>
    </Flex>
  );
}
