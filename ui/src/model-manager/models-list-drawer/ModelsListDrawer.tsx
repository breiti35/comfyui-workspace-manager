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
  const { setRoute } = useContext(WorkspaceContext);
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
      <Modal isOpen={true} onClose={onClose} blockScrollOnMount={true}>
        <ModalOverlay />
        <ModalContent
          width={"90%"}
          maxWidth={"90vw"}
          height={"90vh"}
          display={"flex"}
          flexDirection={"column"}
        >
          <ModalCloseButton zIndex={3} />
          <ModalBody
            p={0}
            overflow={"hidden"}
            display={"flex"}
            flexDirection={"column"}
            flex={1}
            minHeight={0}
          >
            {detailItem ? (
              <Box
                p={4}
                flex={1}
                minHeight={0}
                display={"flex"}
                flexDirection={"column"}
              >
                <ModelDetailView
                  data={detailItem}
                  onBack={() => setDetailItem(null)}
                />
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
                  onInstall={() => setRoute("installModels")}
                  resultCount={curModelList.length}
                />
                <Box flex={1} minHeight={0} overflowY={"auto"} px={4} pb={4}>
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
