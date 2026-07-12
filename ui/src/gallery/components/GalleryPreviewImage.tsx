import { Badge, Box, Flex, Image, Spinner, Text, Wrap } from "@chakra-ui/react";
import { IconPhoto } from "@tabler/icons-react";
import type { PreviewImageFrame } from "../GalleryContext.ts";
import MetadataForm from "./MetaBox/MetadataForm.tsx";

interface Props {
  frames: PreviewImageFrame[];
  isGenerating: boolean;
}

export function GalleryPreviewImage({ frames, isGenerating }: Props) {
  const hasFrames = frames.length > 0;

  return (
    <Flex gap={4} h={"100%"} align={"stretch"}>
      {/* Left: the finished preview image(s) from the Preview Image node, or a
          status hint. Nothing here is saved to disk or the db. */}
      <Flex
        flex={1}
        minW={0}
        direction={"column"}
        align={"center"}
        justify={"center"}
        gap={3}
      >
        {hasFrames ? (
          <Wrap spacing={4} justify={"center"} align={"center"}>
            {frames.map((frame) => (
              <Box
                key={frame.id}
                position={"relative"}
                borderRadius={"lg"}
                overflow={"hidden"}
                border={"1px solid"}
                borderColor={"rowBorderColor"}
                maxW={"520px"}
                maxH={"60vh"}
              >
                <Image
                  src={frame.url}
                  maxW={"520px"}
                  maxH={"60vh"}
                  w={"auto"}
                  objectFit={"contain"}
                  alt={"preview image"}
                />
                <Badge
                  position={"absolute"}
                  top={2}
                  left={2}
                  colorScheme={isGenerating ? "blue" : "gray"}
                  borderRadius={"full"}
                  px={2}
                >
                  {isGenerating ? "läuft …" : "Preview"}
                </Badge>
              </Box>
            ))}
          </Wrap>
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
              Generiere … warte auf Vorschaubild
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
            <IconPhoto size={48} stroke={1.2} />
            <Text fontSize={"md"} fontWeight={500}>
              Noch kein Vorschaubild
            </Text>
            <Text fontSize={"sm"} maxW={"440px"}>
              Sobald ein „Preview Image"-Node ausgeführt wird, erscheint hier
              das fertige Vorschaubild – so wie im ComfyUI-Node. Es wird nicht
              gespeichert und legt keinen Galerie-Eintrag an.
            </Text>
          </Flex>
        )}
      </Flex>

      {/* Right: the parameters of the current graph (sampler, steps, cfg,
          prompt, ...) so you can see - and re-tune - what produced the preview.
          MetadataForm with media=null reads the live graph via graphToPrompt. */}
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
          Erstellungsdaten
        </Text>
        <MetadataForm key={isGenerating ? "running" : "idle"} media={null} />
      </Box>
    </Flex>
  );
}
