import { Box, Stack, Text } from "@chakra-ui/react";
import { ReactNode } from "react";

// House-style settings card: charcoal panel, hairline border, uppercase label.
export default function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Box
      bg={"galleryPanelBg"}
      border={"1px solid"}
      borderColor={"rowBorderColor"}
      borderRadius={"lg"}
      p={4}
    >
      <Text
        fontSize={"xs"}
        textTransform={"uppercase"}
        letterSpacing={"wider"}
        color={"gray.500"}
        mb={3}
      >
        {title}
      </Text>
      <Stack spacing={4}>{children}</Stack>
    </Box>
  );
}
