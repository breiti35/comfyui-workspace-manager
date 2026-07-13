import { Box, Button, Text, VStack } from "@chakra-ui/react";
import { Component, ErrorInfo, ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  label?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message?: string;
}

// Contains render-time crashes so a single failing subtree (e.g. a malformed
// Civitai response while a modal renders) can't unmount the whole plugin UI and
// force a page reload. Shows a recoverable fallback instead of a blank screen.
export default class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error?.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("🦄Workspace Manager - render error caught", error, info);
  }

  reset = () => this.setState({ hasError: false, message: undefined });

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <Box
        m={4}
        p={6}
        borderRadius={"lg"}
        border={"1px solid"}
        borderColor={"rowBorderColor"}
        bg={"galleryPanelBg"}
      >
        <VStack align={"flex-start"} spacing={3}>
          <Text fontWeight={600}>
            {this.props.label ?? "Etwas ist schiefgelaufen."}
          </Text>
          {this.state.message && (
            <Text fontSize={"sm"} color={"gray.500"}>
              {this.state.message}
            </Text>
          )}
          <Button size={"sm"} colorScheme={"blue"} onClick={this.reset}>
            Erneut versuchen
          </Button>
        </VStack>
      </Box>
    );
  }
}
