import {
  Box,
  Flex,
  Heading,
  Spinner,
  Input,
  Select,
  HStack,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
} from "@chakra-ui/react";
import Fuse from "fuse.js/min-basic";
import { useEffect, useState } from "react";
import { ModelsList } from "./ModelsList";
import InstallModelsButton from "../install-models/InstallModelsButton";
import { type ModelsListRespItem } from "../types";
import { useUpdateModels } from "../hooks/useUpdateModels";
import ShowNsfwModelThumbnailSettings from "../../settings/ShowNsfwModelThumbnailSettings";
import { indexdb } from "../../db-tables/indexdb";
import { type Model } from "../../types/dbTypes";
import ModelDropEventListener from "../topbar/ModelDropEventListener";

interface Props {
  onClose: () => void;
}

export default function ModelsListDrawer({ onClose }: Props) {
  const [selectedModel, setSelectedModel] = useState("checkpoints");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const { loading, modelTypeList, modelsList } = useUpdateModels();
  const [modelsListWithDBData, setModelsListWithDBData] = useState<
    Array<{ db?: Model } & ModelsListRespItem>
  >([]);

  // current render models
  const [curModelList, setCurModelList] = useState<ModelsListRespItem[]>([]);
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

  // filter by model type
  useEffect(() => {
    let res: ModelsListRespItem[] = [];
    if (!searchQuery.length) {
      res = modelsList
        .filter((item) => item.model_type === selectedModel)
        .sort((a, b) => {
          if (sortBy === "name") {
            return a.model_name.localeCompare(b.model_name);
          } else {
            return b.date.getTime() - a.date.getTime();
          }
        });
    } else {
      const fuse = new Fuse(modelsListWithDBData, {
        // getDbModels() will get the models from the indexdb
        keys: ["model_name", "db.modelName"],
      });
      const results = fuse.search(searchQuery);
      res = results.map((result) => result.item);
    }
    setCurModelList(res);
  }, [selectedModel, modelsList, searchQuery, sortBy, modelsListWithDBData]);

  const tabIndex = Math.max(0, modelTypeList.indexOf(selectedModel));

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
          <ModalHeader>
            <Flex justifyContent={"space-between"} alignContent={"center"}>
              <Heading size={"md"} mr={2}>
                Models
              </Heading>
              <InstallModelsButton />
            </Flex>
            <HStack gap={4} mt={3} wrap={"wrap"}>
              <Input
                size={"sm"}
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                maxWidth={"300px"}
              />
              {!searchQuery.length && (
                <HStack>
                  <span>Sort By</span>
                  <Select
                    value={sortBy}
                    size={"sm"}
                    width={"120px"}
                    onChange={(e) => setSortBy(e.target.value)}
                  >
                    <option value="name">Name</option>
                    <option value="date">Date</option>
                  </Select>
                </HStack>
              )}
              <ShowNsfwModelThumbnailSettings />
            </HStack>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody
            overflowY={"hidden"}
            display={"flex"}
            flexDirection={"column"}
            flex={1}
            minHeight={0}
          >
            {loading && (
              <Flex justifyContent={"center"} alignItems={"center"} py={8}>
                <Spinner />
              </Flex>
            )}
            {!searchQuery.length ? (
              <Tabs
                index={tabIndex}
                onChange={(index) => setSelectedModel(modelTypeList[index])}
                display={"flex"}
                flexDirection={"column"}
                flex={1}
                minHeight={0}
                isLazy
              >
                <TabList overflowX={"auto"} flexShrink={0}>
                  {modelTypeList.map((v) => (
                    <Tab key={v} whiteSpace={"nowrap"}>
                      {v}
                    </Tab>
                  ))}
                </TabList>
                <TabPanels flex={1} minHeight={0} overflowY={"auto"}>
                  {modelTypeList.map((v) => (
                    <TabPanel key={v} px={0}>
                      <ModelsList list={curModelList} />
                    </TabPanel>
                  ))}
                </TabPanels>
              </Tabs>
            ) : (
              <Box flex={1} minHeight={0} overflowY={"auto"}>
                <ModelsList list={curModelList} />
              </Box>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
      <ModelDropEventListener />
    </>
  );
}
