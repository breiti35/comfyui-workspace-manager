import {
  Button,
  HStack,
  IconButton,
  Menu,
  MenuButton,
  MenuList,
  MenuItemOption,
  MenuOptionGroup,
  Box,
  Flex,
  Tooltip,
} from "@chakra-ui/react";
import { useEffect, useState, useRef, useCallback, useContext } from "react";
import {
  workflowsTable,
  isFolder,
  foldersTable,
} from "../db-tables/WorkspaceDB";
import {
  IconChevronDown,
  IconFolderPlus,
  IconPlus,
  IconFolder,
} from "@tabler/icons-react";
import { RecentFilesContext, WorkspaceContext } from "../WorkspaceContext";
import RecentFilesDrawerMenu from "./RecentFilesDrawerMenu";
import { insertWorkflowToCanvas, sortFileItem } from "../utils";
import MultipleSelectionOperation from "./MultipleSelectionOperation";
import { ESortTypes, sortTypeLocalStorageKey } from "./types";
import { useDebounce } from "../customHooks/useDebounce";
import SearchInput from "../components/SearchInput";
import { openWorkflowsFolder } from "../Api";
import { Folder, Workflow } from "../types/dbTypes";
import MyTagsRow from "./MyTagsRow";
import ImportFlowsFileInput from "./ImportFlowsFileInput";
import ItemsList from "./ItemsList";
import { LibraryHeader } from "../library/primitives";
import { app } from "../utils/comfyapp";
import { useT } from "../i18n/LanguageContext";

type Props = {
  onClose?: () => void;
  onClickNewFlow: () => void;
};

export default function RecentFilesDrawer({ onClickNewFlow }: Props) {
  const { t } = useT();
  const [currentRenderingData, setCurrentRenderingData] = useState<
    Array<Folder | Workflow>
  >([]);
  const allFlowsRef = useRef<Array<Workflow>>([]);
  const { loadWorkflowID, curFlowID } = useContext(WorkspaceContext);
  const [selectedTag, setSelectedTag] = useState<string>();
  const [multipleState, setMultipleState] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [refreshFolderStamp, setRefreshFolderStamp] = useState(0);
  const [searchValue, setSearchValue] = useState("");
  const debounceSearchValue = useDebounce(searchValue, 400);
  const draggingWorkflowID = useRef<string | null>(null);
  const [draggingFile, setDraggingFile] = useState<Workflow | Folder | null>(
    null,
  );
  const sortTypeRef = useRef<ESortTypes>(
    (window.localStorage.getItem(sortTypeLocalStorageKey) as ESortTypes) ??
      ESortTypes.RECENTLY_MODIFIED,
  );
  const isFilter = !!selectedTag || !!debounceSearchValue.length;

  const sortTypeLabel = (type: ESortTypes) => {
    switch (type) {
      case ESortTypes.RECENTLY_MODIFIED:
        return t("drawer.sort.newest");
      case ESortTypes.OLDEST_MODIFIED:
        return t("drawer.sort.oldest");
      case ESortTypes.AZ:
        return t("drawer.sort.az");
      case ESortTypes.ZA:
        return t("drawer.sort.za");
      default:
        return type;
    }
  };

  const loadLatestWorkflows = async () => {
    const curFolderContent = (await workflowsTable?.listFolderContent()) ?? [];
    setCurrentRenderingData(
      sortFileItem(curFolderContent, sortTypeRef.current),
    );
    setRefreshFolderStamp(Date.now());
    allFlowsRef.current = (await workflowsTable?.listAll()) ?? [];
  };

  const filterFlows = () => {
    const filterResult = allFlowsRef.current.filter((flow) => {
      let tagFlag = true;
      let keywordFlag = true;
      if (selectedTag) {
        tagFlag = !!flow.tags?.includes(selectedTag);
      }
      if (debounceSearchValue) {
        keywordFlag = !!flow.name
          .toLocaleLowerCase()
          .includes(debounceSearchValue.toLocaleLowerCase());
      }

      return tagFlag && keywordFlag;
    });
    setCurrentRenderingData(sortFileItem(filterResult, sortTypeRef.current));
  };

  const onSort = (type: ESortTypes) => {
    setCurrentRenderingData(sortFileItem(currentRenderingData, type));
    sortTypeRef.current = type;
    window.localStorage.setItem(sortTypeLocalStorageKey, type);
    !isFilter && setRefreshFolderStamp(Date.now());
  };

  useEffect(() => {
    if (isFilter) {
      filterFlows();
    } else {
      loadLatestWorkflows();
    }
  }, [debounceSearchValue, selectedTag]);

  const onDelete = useCallback(
    async (id: string) => {
      await workflowsTable?.deleteFlow(id);
      if (workflowsTable?.curWorkflow?.id === id) {
        await loadWorkflowID?.(null);
      }
      await loadLatestWorkflows();
    },
    [selectedTag, debounceSearchValue],
  );

  useEffect(() => {
    const handleDrop = async (e: { canvasX: number; canvasY: number }) => {
      if (draggingWorkflowID.current) {
        const flow = await workflowsTable?.get(draggingWorkflowID.current);
        flow &&
          flow.json &&
          insertWorkflowToCanvas(flow.json, [e.canvasX, e.canvasY]);
      }
    };

    app.canvasEl.addEventListener("drop", handleDrop);
    // Cleanup function to remove event listeners
    return () => {
      app.canvasEl.removeEventListener("drop", handleDrop);
      };
  }, []);

  const onSelect = useCallback((flowId: string, selected: boolean) => {
    setSelectedKeys((preState) => {
      const copyKeys = [...preState];
      if (selected) {
        copyKeys.push(flowId);
      } else {
        copyKeys.splice(copyKeys.indexOf(flowId), 1);
      }
      return copyKeys;
    });
  }, []);

  const batchOperationCallback = (type: string, value: unknown) => {
    switch (type) {
      case "batchDelete":
        curFlowID &&
          workflowsTable?.get(curFlowID).then((res) => {
            if (!res) {
              loadWorkflowID?.(null);
            }
          });
        loadLatestWorkflows();
        setMultipleState(false);
        setSelectedKeys([]);
        return;
      case "selectAll":
        setSelectedKeys(
          value ? allFlowsRef.current.map((flow) => flow.id) : [],
        );
        return;
    }
  };

  const onDraggingFile = (file: Workflow | Folder) => {
    setDraggingFile(file);
    if (!isFolder(file)) {
      draggingWorkflowID.current = file.id;
    }
  };

  const onUpdateSearchValue = (newValue: string) => {
    setSearchValue(newValue);
  };

  return (
    <RecentFilesContext.Provider
      value={{
        onRefreshFilesList: loadLatestWorkflows,
        draggingFile: draggingFile ?? undefined,
        setDraggingFile: onDraggingFile,
        isMultiSelecting: multipleState,
        onMultiSelectFlow: onSelect,
        multiSelectedFlowsID: selectedKeys,
        onDeleteFlow: onDelete,
        refreshFolderStamp: refreshFolderStamp,
        setRefreshFolderStamp: setRefreshFolderStamp,
      }}
    >
      <div className="lib-section">
        <Box
          display={"flex"}
          flexDirection={"column"}
          flex={1}
          minH={0}
          sx={{
            "--chakra-colors-rowBorderColor": "var(--lib-line-soft)",
            "--chakra-colors-galleryPanelBg": "var(--lib-card)",
          }}
        >
          <LibraryHeader
            title={t("drawer.title")}
            subtitle={String(currentRenderingData.length)}
            actions={
              <>
                <ImportFlowsFileInput />
                <Tooltip label={t("drawer.openSaveDir")}>
                  <IconButton
                    aria-label={t("drawer.openSaveDir")}
                    size={"sm"}
                    icon={<IconFolder size={18} />}
                    variant={"ghost"}
                    onClick={() => openWorkflowsFolder()}
                  />
                </Tooltip>
                <RecentFilesDrawerMenu />
                <button
                  type="button"
                  className="lib-btn primary"
                  onClick={onClickNewFlow}
                >
                  <IconPlus size={16} />
                  {t("drawer.newWorkflow")}
                </button>
              </>
            }
          />

          {/* Zone 2 - Toolbar: tag filter + list actions (select / new folder /
              sort), visually grouped and kept subtle. */}
          <Box px={6} pt={2}>
            <MyTagsRow
              selectedTag={selectedTag}
              setSelectedTag={setSelectedTag}
            />
            <HStack mt={2} justifyContent="space-between">
              <HStack gap={1}>
                <MultipleSelectionOperation
                  multipleState={multipleState}
                  changeMultipleState={(state) => {
                    setMultipleState(state);
                    !state && setSelectedKeys([]);
                  }}
                  selectedKeys={selectedKeys}
                  isSelectedAll={
                    selectedKeys.length === allFlowsRef.current.length
                  }
                  batchOperationCallback={batchOperationCallback}
                />
                {!multipleState && (
                  <Tooltip
                    hasArrow
                    label={t("drawer.newFolder")}
                    placement="bottom-start"
                  >
                    <IconButton
                      size={"sm"}
                      variant={"ghost"}
                      icon={<IconFolderPlus size={18} />}
                      onClick={async () => {
                        await foldersTable?.create({
                          name: t("drawer.newFolderName"),
                        });
                        loadLatestWorkflows();
                      }}
                      aria-label={t("drawer.newFolder")}
                    />
                  </Tooltip>
                )}
              </HStack>
              <Menu closeOnSelect={true}>
                <MenuButton
                  as={Button}
                  variant={"ghost"}
                  size="xs"
                  color={"GrayText"}
                  fontWeight={500}
                  rightIcon={<IconChevronDown size="14" />}
                >
                  {sortTypeLabel(sortTypeRef.current)}
                </MenuButton>
                <MenuList>
                  <MenuOptionGroup
                    value={sortTypeRef.current}
                    type="radio"
                    onChange={(type) => onSort(type as ESortTypes)}
                  >
                    {[
                      ESortTypes.RECENTLY_MODIFIED,
                      ESortTypes.OLDEST_MODIFIED,
                      ESortTypes.AZ,
                      ESortTypes.ZA,
                    ].map((sortType, index) => (
                      <MenuItemOption key={index} value={sortType}>
                        {sortTypeLabel(sortType)}
                      </MenuItemOption>
                    ))}
                  </MenuOptionGroup>
                </MenuList>
              </Menu>
            </HStack>
          </Box>

          {/* Zone 3 - Search. */}
          <Box px={6} pt={2}>
            <SearchInput
              searchValue={searchValue}
              onUpdateSearchValue={onUpdateSearchValue}
            />
          </Box>

          {/* Zone 4 - The workflow list (scrolls independently). */}
          <Flex
            flex={1}
            minH={0}
            px={5}
            pb={2}
            overflowY={"auto"}
            overflowX={"hidden"}
            direction="column"
            style={{
              scrollbarWidth: "none", // For Firefox
              msOverflowStyle: "none", // For Internet Explorer and Edge
            }}
          >
            <ItemsList items={currentRenderingData} />
          </Flex>
        </Box>
      </div>
    </RecentFilesContext.Provider>
  );
}
