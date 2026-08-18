import {
  Box,
  Flex,
  Spinner,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalCloseButton,
  ModalBody,
} from "@chakra-ui/react";
import Fuse from "fuse.js/min-basic";
import { useContext, useEffect, useState } from "react";
import { ModelsList } from "./ModelsList";
import { type ModelsListRespItem } from "../types";
import { useUpdateModels } from "../hooks/useUpdateModels";
import ModelDetailView from "./ModelDetailView";
import ModelsPanelToolbar from "./ModelsPanelToolbar";
import { isModelFavorite } from "./modelFavorites";
import { indexdb } from "../../db-tables/indexdb";
import { type Model } from "../../types/dbTypes";
import ModelDropEventListener from "../topbar/ModelDropEventListener";
import { WorkspaceContext } from "../../WorkspaceContext";
import { hideScrollbarSx } from "../utils";
import { useModalSubLevelDismiss } from "../../customHooks/useModalSubLevelDismiss";

interface Props {
  onClose: () => void;
}

const SORT_CMP: Record<
  string,
  (a: ModelsListRespItem, b: ModelsListRespItem) => number
> = {
  az: (a, b) => a.model_name.localeCompare(b.model_name),
  za: (a, b) => b.model_name.localeCompare(a.model_name),
  newest: (a, b) => b.date.getTime() - a.date.getTime(),
  oldest: (a, b) => a.date.getTime() - b.date.getTime(),
};

export default function ModelsListDrawer({ onClose }: Props) {
  const { openRoute } = useContext(WorkspaceContext);
  const [selectedModel, setSelectedModel] = useState("checkpoints");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("az");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const { loading, modelTypeList, modelsList, refresh } = useUpdateModels();
  const [modelsListWithDBData, setModelsListWithDBData] = useState<
    Array<{ db?: Model } & ModelsListRespItem>
  >([]);

  // current render models
  const [curModelList, setCurModelList] = useState<ModelsListRespItem[]>([]);
  // when set, the detail view replaces the grid (gallery-style back nav).
  const [detailItem, setDetailItem] = useState<ModelsListRespItem | null>(null);
  const closeDetail = () => setDetailItem(null);
  // Esc/overlay click should only back out of the detail view when it's open,
  // not blow away the grid's search/filter/scroll state underneath it.
  const modalDismissProps = useModalSubLevelDismiss(
    detailItem !== null,
    closeDetail,
    onClose,
  );

  useEffect(() => {
    getDbModels();
    async function getDbModels() {
      const models = await indexdb.models.toArray();
      setModelsListWithDBData(
        modelsList.map((item) => ({
          ...item,
          db: models.find(
            (model) => model.id === item.model_name + "@" + item.model_type,
          ),
        })),
      );
    }
  }, [modelsList]);

  // filter by model type / search, sort, then optionally keep only favorites
  useEffect(() => {
    let res: ModelsListRespItem[] = [];
    if (!searchQuery.length) {
      res = modelsList
        .filter((item) => item.model_type === selectedModel)
        .slice()
        .sort(SORT_CMP[sortBy] ?? SORT_CMP.az);
    } else {
      const fuse = new Fuse(modelsListWithDBData, {
        keys: ["model_name", "db.modelName"],
      });
      res = fuse.search(searchQuery).map((result) => result.item);
    }
    if (favoritesOnly) {
      res = res.filter((item) =>
        isModelFavorite(item.model_name + "@" + item.model_type),
      );
    }
    setCurModelList(res);
  }, [
    selectedModel,
    modelsList,
    searchQuery,
    sortBy,
    favoritesOnly,
    modelsListWithDBData,
  ]);

  return (
    <>
      <Modal
        isOpen={true}
        onClose={onClose}
        blockScrollOnMount={true}
        {...modalDismissProps}
      >
        <ModalOverlay />
        <ModalContent
          width={"90%"}
          maxWidth={"90vw"}
          height={"90vh"}
          display={"flex"}
          flexDirection={"column"}
        >
          <ModalCloseButton
            zIndex={3}
            top={2}
            right={4}
            size={"md"}
            borderRadius={"md"}
            border={"1px solid"}
            borderColor={"red.400"}
            color={"red.300"}
            bg={"rgba(245, 101, 101, 0.14)"}
            _hover={{ bg: "rgba(245, 101, 101, 0.3)", color: "white" }}
            _active={{ bg: "rgba(245, 101, 101, 0.42)" }}
          />
          <ModalBody
            p={0}
            overflow={"hidden"}
            display={"flex"}
            flexDirection={"column"}
            flex={1}
            minHeight={0}
          >
            {detailItem ? (
              <Box flex={1} minHeight={0}>
                <ModelDetailView data={detailItem} onBack={closeDetail} />
              </Box>
            ) : (
              <>
                <ModelsPanelToolbar
                  categories={modelTypeList}
                  selectedModel={selectedModel}
                  onSelectModel={setSelectedModel}
                  searchQuery={searchQuery}
                  setSearchQuery={setSearchQuery}
                  sortBy={sortBy}
                  setSortBy={setSortBy}
                  favoritesOnly={favoritesOnly}
                  setFavoritesOnly={setFavoritesOnly}
                  onRefresh={refresh}
                  onInstall={() => openRoute("installModels")}
                  resultCount={curModelList.length}
                />
                <Box
                  flex={1}
                  minHeight={0}
                  overflowY={"auto"}
                  px={4}
                  pb={4}
                  sx={hideScrollbarSx}
                >
                  {loading && (
                    <Flex justifyContent={"center"} alignItems={"center"} py={8}>
                      <Spinner />
                    </Flex>
                  )}
                  <ModelsList
                    list={curModelList}
                    onOpenDetail={setDetailItem}
                  />
                </Box>
              </>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
      <ModelDropEventListener />
    </>
  );
}
