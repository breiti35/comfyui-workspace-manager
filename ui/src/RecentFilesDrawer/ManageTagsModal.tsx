import {
  HStack,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  Tag as ChakraTag,
  IconButton,
} from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { tagsTable } from "../db-tables/WorkspaceDB";
import { IconTrash } from "@tabler/icons-react";
import { Tag } from "../types/dbTypes";
import { useT } from "../i18n/LanguageContext";

export default function ManageTagsModal({ onclose }: { onclose: () => void }) {
  const { t } = useT();
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const loadTags = async () => {
    const tags = await tagsTable?.listAll();
    setAllTags(tags ?? []);
  };
  useEffect(() => {
    loadTags();
  }, []);
  return (
    <Modal isOpen={true} onClose={onclose}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{t("drawer.tags.manage")}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          {allTags.map((tag) => (
            <HStack>
              <ChakraTag>{tag.name}</ChakraTag>
              <IconButton
                onClick={async () => {
                  await tagsTable?.delete(tag.name);
                  loadTags();
                }}
                aria-label={t("drawer.tags.deleteAria")}
                colorScheme="red"
                variant={"ghost"}
                icon={<IconTrash />}
              />
            </HStack>
          ))}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
