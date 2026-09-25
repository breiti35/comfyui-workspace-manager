import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  Text,
  VStack,
  Box,
  Tag,
  IconButton,
  Button,
  Flex,
  Input,
  Stack,
  useToast,
  SimpleGrid,
  Tooltip,
} from "@chakra-ui/react";
import { IconEdit } from "@tabler/icons-react";
import { useRef, useState, useEffect } from "react";
import {
  copyFlowsToNewDirectory,
  fetchMyWorkflowsDir,
  getSystemDir,
} from "../Api";
import { userSettingsTable } from "../db-tables/WorkspaceDB";
import { useDialog } from "../components/AlertDialogProvider";
import { useT } from "../i18n/LanguageContext";

export default function SelectMyWorkflowsDir() {
  const { t } = useT();
  const [isManualEntry, setIsManualEntry] = useState(false);
  const [isEditDirectory, setIsEditDirectory] = useState(false);
  const [subdirectoryList, setSubdirectoryList] = useState<string[]>([]);
  const [currentDirectory, setCurrentDirectory] = useState("");
  const [dirPathList, setDirPathList] = useState<string[]>([]);
  const [twoWaySync, setTwoWaySync] = useState(false);
  const [noPermission, setNoPermission] = useState(false);
  const [isWindows, setIsWindows] = useState(false);
  const manualEntryRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const { showDialog } = useDialog();
  const slash = isWindows ? "\\" : "/";

  useEffect(() => {
    fetchMyWorkflowsDir().then((res) => {
      setCurrentDirectory(res.path ?? "");
      setIsWindows(res.os === "win32");
    });
    userSettingsTable?.getSetting("twoWaySync").then((res) => {
      setTwoWaySync(res ?? false);
    });
  }, []);

  const getDir = async (root?: string) => {
    const {
      dir_path = "",
      dir_contents = [],
      error = "",
    } = await getSystemDir(root ?? "");
    if (error.includes("Operation not permitted")) {
      setNoPermission(true);
      onCloseEditDirectory();
      return {
        isError: true,
      };
    } else {
      return {
        dirList: dir_contents,
        dirPath: dir_path,
      };
    }
  };

  const onOpenEditDirectory = async () => {
    const { isError = false, dirList = [] } = await getDir(currentDirectory);
    if (!isError) {
      setSubdirectoryList(dirList);
      setIsEditDirectory(true);
      setDirPathList(
        (currentDirectory &&
          currentDirectory.split(slash).filter((p) => !!p)) ||
          [],
      );
    }
  };

  const onCloseEditDirectory = () => {
    setIsEditDirectory(false);
    setIsManualEntry(false);
    setDirPathList([]);
  };

  const saveDirectory = async (
    newPath: string,
    needCopy: boolean = false,
    isManualEntry: boolean = false,
  ) => {
    if (needCopy) {
      const { path } = await fetchMyWorkflowsDir();
      path && (await copyFlowsToNewDirectory(path, newPath));
    }
    await userSettingsTable?.upsert({
      myWorkflowsDir: newPath,
    });
    const getNewPath =
      (await userSettingsTable?.getSetting("myWorkflowsDir")) ?? "";
    setCurrentDirectory(getNewPath);
    isManualEntry && setNoPermission(false);
    onCloseEditDirectory();
    toast({
      title: t("workflowsDir.toast.saved"),
      status: "success",
      duration: 4000,
      position: "top",
      isClosable: true,
    });
  };

  const onSubmit = async (manualEntry?: string) => {
    if (manualEntry) {
      const { error = "" } = await getSystemDir(manualEntry);
      if (error.includes("Not a directory")) {
        toast({
          title: t("workflowsDir.toast.invalidPath"),
          status: "warning",
          duration: 5000,
          position: "top",
          isClosable: true,
        });
        return;
      }
    }
    const newPath =
      manualEntry ?? `${isWindows ? "" : slash}${dirPathList.join(slash)}`;

    saveDirectory(newPath, false, !!manualEntry);
  };

  const onReset = async () => {
    const { dirPath, dirList } = await getDir("");
    setDirPathList(dirPath.split(slash).filter((p: string) => !!p));
    setSubdirectoryList(dirList);
  };

  const onDirJump = async (index: number, nextDir?: string) => {
    let nextDirPath = "";
    if (index === -1 && nextDir) {
      nextDirPath = `${isWindows ? "" : slash}${dirPathList.concat([nextDir]).join(slash)}`;
    } else {
      nextDirPath = `${isWindows ? "" : slash}${dirPathList.slice(0, index + 1).join(slash)}`;
    }
    const { isError = false, dirList = [] } = await getDir(nextDirPath);

    if (!isError) {
      setSubdirectoryList(dirList);
      setDirPathList(
        isWindows
          ? nextDirPath.split(slash)
          : nextDirPath.slice(1)?.split(slash),
      );
    }
  };
  const enterFolderAddressComp = (
    <Box textAlign="end" mb={4}>
      <Input
        placeholder={t("workflowsDir.manualPathPlaceholder")}
        ref={manualEntryRef}
        mt={2}
        mb={2}
      />
      <Button
        colorScheme="blue"
        mr={3}
        size="sm"
        onClick={() => {
          manualEntryRef?.current?.value &&
            onSubmit(manualEntryRef?.current?.value);
        }}
      >
        {t("workflowsDir.save")}
      </Button>
    </Box>
  );

  const onOpenEnter = () => {
    setIsEditDirectory(true);
    setIsManualEntry(true);
  };
  return (
    <>
      <Box mb={4}>
        <Text mb={2} fontWeight={500}>
          {t("workflowsDir.label")}
        </Text>
        {!isEditDirectory ? (
          <Flex>
            <Tag overflowWrap="anywhere">{currentDirectory}</Tag>
            <Tooltip
              label={
                twoWaySync ? t("workflowsDir.choose") : t("workflowsDir.needSync")
              }
            >
              <IconButton
                aria-label={t("workflowsDir.selectFolderAria")}
                size={"sm"}
                ml={2}
                isDisabled={!twoWaySync}
                icon={
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="#EFC54D"
                    style={{ width: "1.4rem", height: "1.4srem" }}
                  >
                    <path d="M19.5 21a3 3 0 0 0 3-3v-4.5a3 3 0 0 0-3-3h-15a3 3 0 0 0-3 3V18a3 3 0 0 0 3 3h15ZM1.5 10.146V6a3 3 0 0 1 3-3h5.379a2.25 2.25 0 0 1 1.59.659l2.122 2.121c.14.141.331.22.53.22H19.5a3 3 0 0 1 3 3v1.146A4.483 4.483 0 0 0 19.5 9h-15a4.483 4.483 0 0 0-3 1.146Z" />
                  </svg>
                }
                onClick={onOpenEditDirectory}
              />
            </Tooltip>
            <Tooltip
              label={
                twoWaySync
                  ? t("workflowsDir.enterPath")
                  : t("workflowsDir.needSync")
              }
            >
              <IconButton
                isDisabled={!twoWaySync}
                aria-label={t("workflowsDir.enterPathAria")}
                size={"sm"}
                ml={2}
                icon={<IconEdit size={19} />}
                onClick={onOpenEnter}
                variant={"ghost"}
              />
            </Tooltip>
          </Flex>
        ) : isManualEntry ? (
          enterFolderAddressComp
        ) : (
          <VStack spacing={2} alignItems="start">
            <Stack spacing="2px" direction="row" wrap="wrap">
              {dirPathList.map((dir, index) => (
                <span key={dir}>
                  {index > 0 && slash}
                  <Button
                    colorScheme="blue"
                    variant="link"
                    minW={1}
                    key={`${dir}-${index}`}
                    onClick={() => {
                      onDirJump(index);
                    }}
                  >
                    {dir}
                  </Button>
                </span>
              ))}
            </Stack>
            <SimpleGrid
              columns={2}
              spacing={3}
              maxHeight={500}
              width="100%"
              overflowY="auto"
            >
              {subdirectoryList.map((sub, index) => (
                <Button
                  key={`${sub}-${index}`}
                  size="sm"
                  leftIcon={
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="#EFC54D"
                      style={{ width: "1.2rem", height: "1.2rem" }}
                    >
                      <path d="M19.5 21a3 3 0 0 0 3-3v-4.5a3 3 0 0 0-3-3h-15a3 3 0 0 0-3 3V18a3 3 0 0 0 3 3h15ZM1.5 10.146V6a3 3 0 0 1 3-3h5.379a2.25 2.25 0 0 1 1.59.659l2.122 2.121c.14.141.331.22.53.22H19.5a3 3 0 0 1 3 3v1.146A4.483 4.483 0 0 0 19.5 9h-15a4.483 4.483 0 0 0-3 1.146Z" />
                    </svg>
                  }
                  justifyContent="start"
                  onClick={() => {
                    onDirJump(-1, sub);
                  }}
                >
                  {sub}
                </Button>
              ))}
            </SimpleGrid>
            <Box w="100%" textAlign="end">
              <Button
                colorScheme="blue"
                size="sm"
                onClick={() => {
                  onSubmit();
                }}
              >
                {t("workflowsDir.save")}
              </Button>
              <Button size="sm" onClick={onReset} mr={2} ml={2}>
                {t("workflowsDir.reset")}
              </Button>
              <Button size="sm" onClick={onCloseEditDirectory}>
                {t("workflowsDir.cancel")}
              </Button>
            </Box>
          </VStack>
        )}
      </Box>
      <Modal
        isOpen={noPermission}
        onClose={() => setNoPermission(false)}
        size={"xl"}
      >
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{t("workflowsDir.noPermission.title")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Box>
              {navigator.userAgent.indexOf("Mac OS X") !== -1 ? (
                <Text fontWeight={500}>
                  {t("workflowsDir.noPermission.macIntro")}
                  <Button
                    colorScheme="blue"
                    variant="link"
                    as="a"
                    ml={2}
                    target="_block"
                    href="https://stackoverflow.com/questions/58479686/permissionerror-errno-1-operation-not-permitted-after-macos
                -catalina-update"
                  >
                    {t("workflowsDir.noPermission.documentLink")}
                  </Button>
                  {t("workflowsDir.noPermission.macOutro")}
                </Text>
              ) : (
                <Text fontWeight={500}>
                  {t("workflowsDir.noPermission.otherText")}
                </Text>
              )}
              {enterFolderAddressComp}
            </Box>
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
}
