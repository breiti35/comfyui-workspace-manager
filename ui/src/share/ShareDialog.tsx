import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  Button,
  VStack,
  HStack,
  Text,
  useToast,
} from "@chakra-ui/react";
import { useState } from "react";
import { workflowsTable } from "../db-tables/WorkspaceDB";
import { EXPORT_TARGETS, ExportTarget } from "./exportTargets";

interface Props {
  onClose: () => void;
}

export default function ShareDialog({ onClose }: Props) {
  const [loadingTargetId, setLoadingTargetId] = useState<string | null>(null);
  const toast = useToast();
  const workflow = workflowsTable?.curWorkflow;

  const handleExport = async (target: ExportTarget) => {
    if (!workflow) return;
    setLoadingTargetId(target.id);
    const result = await target.exportWorkflow(workflow);
    setLoadingTargetId(null);
    if (result.success) {
      toast({
        title: result.message ?? `Exported via ${target.label}`,
        status: "success",
        duration: 3000,
      });
    } else {
      toast({
        title: `${target.label} failed`,
        description: result.error,
        status: "error",
        duration: null,
        isClosable: true,
      });
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} size={"lg"}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Export "{workflow?.name}"</ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={8}>
          <VStack align={"stretch"} spacing={3}>
            {EXPORT_TARGETS.map((target) => (
              <Button
                key={target.id}
                variant={"outline"}
                justifyContent={"flex-start"}
                height={"auto"}
                py={3}
                isDisabled={!workflow || loadingTargetId !== null}
                isLoading={loadingTargetId === target.id}
                onClick={() => handleExport(target)}
              >
                <HStack align={"start"} spacing={3} width={"100%"}>
                  <target.icon size={22} />
                  <VStack align={"start"} spacing={0}>
                    <Text fontWeight={600}>{target.label}</Text>
                    <Text
                      fontSize={"sm"}
                      color={"GrayText"}
                      whiteSpace={"normal"}
                      textAlign={"left"}
                    >
                      {target.description}
                    </Text>
                  </VStack>
                </HStack>
              </Button>
            ))}
          </VStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
