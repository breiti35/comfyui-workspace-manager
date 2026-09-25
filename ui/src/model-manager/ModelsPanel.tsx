import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalCloseButton,
  ModalBody,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
} from "@chakra-ui/react";
import { useCallback, useRef, useState } from "react";
import ModelsListPanelContent, {
  type ModelsListPanelHandle,
} from "./models-list-drawer/ModelsListPanelContent";
import InstallModelsPanelContent, {
  type InstallModelsPanelHandle,
} from "./install-models/InstallModelsPanelContent";
import { useModalSubLevelDismiss } from "../customHooks/useModalSubLevelDismiss";
import { folderToModelType, type MODEL_TYPE } from "./install-models/util/modelTypes";
import { useT } from "../i18n/LanguageContext";

// "My Models" and "Install Models" used to be two separate <Modal>s reached
// via two different routes. They're now one modal with two tabs so search,
// filters, sort, paging, detail view and scroll survive switching tabs -
// that used to mean unmounting one panel and mounting the other from
// scratch. See ModelsListPanelContent / InstallModelsPanelContent for the
// (otherwise unchanged) tab bodies.

// Previously hardcoded in the caller (ModelManagerTopbar) - kept as the
// fallback for the Install tab's initial category when there's no Models-tab
// folder selection to derive it from yet (see handleTabChange below).
const DEFAULT_INSTALL_MODEL_TYPE: MODEL_TYPE = "Checkpoint";

interface Props {
  // Only the *initial* active tab - after mount, tab switching is purely
  // panel-local state and never touches the route (see handleTabChange).
  initialRoute: "modelList" | "installModels";
  onClose: () => void;
}

export default function ModelsPanel({ initialRoute, onClose }: Props) {
  const { t } = useT();
  // Inline useT() call here is safe even though this JSX ends up inside the
  // Modal's own Portal: React context resolves by this component's position
  // in the *component* tree, not by where Chakra's Portal places the DOM -
  // exactly like ModelsPanelToolbar (nested even deeper) already does today.
  // The rule from DownloadIndicator.tsx ("pass t as a prop") applies to
  // components extracted *inside* portal-rendered content that call useT()
  // themselves - not to this outer component, which owns the Portal.
  const [tabIndex, setTabIndex] = useState(
    initialRoute === "installModels" ? 1 : 0,
  );

  const myModelsRef = useRef<ModelsListPanelHandle>(null);
  const installRef = useRef<InstallModelsPanelHandle>(null);

  // Reactive per-tab "is a detail view open" flags, pushed up by each tab via
  // onDetailOpenChange. Plain booleans (not read off the refs) so that the
  // active one below is fresh at *ModelsPanel's* render time - needed
  // because useModalSubLevelDismiss captures its `hasSubLevel` argument by
  // value, and this component doesn't otherwise re-render when a child's
  // internal detailItem state changes.
  const [myModelsDetailOpen, setMyModelsDetailOpen] = useState(false);
  const [installDetailOpen, setInstallDetailOpen] = useState(false);
  const hasSubLevel = tabIndex === 0 ? myModelsDetailOpen : installDetailOpen;

  // The Install tab's initial Civitai type is derived once, from whichever
  // folder is selected in the Models tab at the moment Install is first
  // activated - afterwards the two tabs are independent (folder changes in
  // Models no longer touch Install). Starts "already activated" when the
  // panel opens directly on the Install tab (installModels route): there is
  // no Models-tab selection yet to derive from this session, so it just
  // keeps the old hardcoded default below.
  const installActivatedRef = useRef(initialRoute === "installModels");
  const installInitialModelTypeRef = useRef<MODEL_TYPE>(
    DEFAULT_INSTALL_MODEL_TYPE,
  );

  const handleTabChange = useCallback((index: number) => {
    if (index === 1 && !installActivatedRef.current) {
      installActivatedRef.current = true;
      // myModelsRef is only non-null once the Models tab has actually
      // mounted (isLazy) - if it never has, there's nothing to derive from.
      const folder = myModelsRef.current?.selectedFolder;
      const derived = folder ? folderToModelType(folder) : undefined;
      if (derived) installInitialModelTypeRef.current = derived;
    }
    setTabIndex(index);
  }, []);

  // Esc/overlay click backs out of the *active* tab's detail view first,
  // never an inactive one - closeActiveDetail resolves which ref to use from
  // the current tabIndex at call time (refs are always current), while
  // hasSubLevel (above) is real React state so it's correctly re-evaluated
  // on every render. The X button is untouched: ModalCloseButton keeps
  // calling the real onClose via modal context regardless.
  const closeActiveDetail = useCallback(() => {
    const panel = tabIndex === 0 ? myModelsRef.current : installRef.current;
    panel?.closeDetail();
  }, [tabIndex]);

  const modalDismissProps = useModalSubLevelDismiss(
    hasSubLevel,
    closeActiveDetail,
    onClose,
  );

  return (
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
          {/* isLazy + keepMounted: a tab only mounts (and only fires its
              first Civitai/model-list request) once actually activated, but
              stays mounted afterwards instead of unmounting on tab-out - so
              its state survives switching tabs, same as the DOM `hidden`
              attribute leaves it in the tree, just not painted. Verified
              against ui/node_modules/@chakra-ui/tabs (v3.0.0): lazyDisclosure
              renders children when `isSelected || (mode === "keepMounted" &&
              wasSelected)`, and the panel itself is hidden via the `hidden`
              attribute, not by unmounting. */}
          <Tabs
            index={tabIndex}
            onChange={handleTabChange}
            isLazy
            lazyBehavior="keepMounted"
            display={"flex"}
            flexDirection={"column"}
            flex={1}
            minHeight={0}
          >
            <TabList flexShrink={0} px={4}>
              <Tab>{t("models.panel.tabMyModels")}</Tab>
              <Tab>{t("models.panel.tabAdd")}</Tab>
            </TabList>
            <TabPanels display={"flex"} flex={1} minHeight={0}>
              <TabPanel
                p={0}
                display={"flex"}
                flexDirection={"column"}
                flex={1}
                minHeight={0}
                width={"100%"}
              >
                <ModelsListPanelContent
                  ref={myModelsRef}
                  onDetailOpenChange={setMyModelsDetailOpen}
                />
              </TabPanel>
              <TabPanel
                p={0}
                display={"flex"}
                flexDirection={"column"}
                flex={1}
                minHeight={0}
                width={"100%"}
              >
                <InstallModelsPanelContent
                  ref={installRef}
                  modelType={installInitialModelTypeRef.current}
                  onDetailOpenChange={setInstallDetailOpen}
                />
              </TabPanel>
            </TabPanels>
          </Tabs>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
