import {
  Tooltip,
  Button,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  FormControl,
  FormLabel,
  FormErrorMessage,
  Input,
} from "@chakra-ui/react";
import { IconDeviceFloppy } from "@tabler/icons-react";
import { useContext, useState } from "react";
import { WorkspaceContext } from "../WorkspaceContext";
import { COMFYSPACE_TRACKING_FIELD_NAME } from "../const";
import { app } from "../utils/comfyapp";
import { workflowsTable } from "../db-tables/WorkspaceDB";
import { nanoid } from "nanoid";
import { useT } from "../i18n/LanguageContext";

export default function TopbarNewWorkflowButton() {
  const { t } = useT();
  const { setCurFlowIDAndName, curFlowID } = useContext(WorkspaceContext);
  const [isOpen, setIsOpen] = useState(false);
  const [workflowName, setWorkflowName] = useState(
    t("topbar.newWorkflow.defaultName"),
  );
  const [submitError, setSubmitError] = useState("");

  const onClose = () => {
    setIsOpen(false);
    setSubmitError("");
  };

  const saveNewWorkflow = async () => {
    if (!workflowName.trim()) {
      setSubmitError(t("topbar.newWorkflow.nameRequired"));
      return;
    }
    const id = nanoid();
    const graph = app.graph.serialize();
    if (!graph.extra) {
      graph.extra = {};
    }
    if (!graph.extra[COMFYSPACE_TRACKING_FIELD_NAME]) {
      graph.extra[COMFYSPACE_TRACKING_FIELD_NAME] = {};
    }
    graph.extra[COMFYSPACE_TRACKING_FIELD_NAME].id = id;
    const flow = await workflowsTable?.createFlow({
      id,
      json: JSON.stringify(graph),
      name: workflowName,
    });
    flow && setCurFlowIDAndName(flow);
    onClose();
  };
  if (curFlowID) {
    return null;
  }
  return (
    <>
      <Tooltip label={t("topbar.newWorkflow.saveAsLabel")}>
        <Button
          size={"sm"}
          variant={"ghost"}
          aria-label={t("topbar.newWorkflow.aria")}
          // same look as the other bar buttons (see BAR_BTN in Topbar.tsx)
          height={"32px"}
          minWidth={"32px"}
          borderRadius={"6px"}
          color={"var(--fg-color, #fff)"}
          _hover={{ bg: "rgba(128,128,128,0.22)" }}
          onClick={() => {
            setWorkflowName(t("topbar.newWorkflow.defaultName"));
            setIsOpen(true);
          }}
          px={1}
        >
          <IconDeviceFloppy size={18} />
        </Button>
      </Tooltip>
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{t("topbar.newWorkflow.saveAsLabel")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <FormControl isInvalid={!!submitError}>
              <FormLabel>{t("topbar.newWorkflow.nameLabel")}</FormLabel>
              <Input
                value={workflowName}
                onChange={(e) => {
                  setWorkflowName(e.target.value);
                  submitError && setSubmitError("");
                }}
                autoFocus
                onKeyUp={(e) => {
                  e.code === "Enter" && saveNewWorkflow();
                }}
              />
              {submitError && (
                <FormErrorMessage>{submitError}</FormErrorMessage>
              )}
            </FormControl>
          </ModalBody>
          <ModalFooter>
            <Button
              colorScheme="blue"
              mr={3}
              onClick={saveNewWorkflow}
              isDisabled={!workflowName.trim()}
            >
              {t("topbar.newWorkflow.save")}
            </Button>
            <Button onClick={onClose}>{t("topbar.newWorkflow.cancel")}</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
