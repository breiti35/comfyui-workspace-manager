import { Box, Heading, Stack, StackDivider } from "@chakra-ui/react";
import { ReactNode } from "react";

export default function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Box>
      <Heading
        size="xs"
        textTransform="uppercase"
        letterSpacing="wide"
        color="gray.500"
        mb={3}
      >
        {title}
      </Heading>
      <Stack spacing={4} divider={<StackDivider borderColor="gray.600" />}>
        {children}
      </Stack>
    </Box>
  );
}
