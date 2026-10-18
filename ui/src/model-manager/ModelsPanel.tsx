import { useCallback, useEffect, useRef, useState } from "react";
import ModelsListPanelContent, {
  type ModelsListPanelHandle,
} from "./models-list-drawer/ModelsListPanelContent";
import InstallModelsPanelContent, {
  type InstallModelsPanelHandle,
} from "./install-models/InstallModelsPanelContent";
import {
  folderToModelType,
  type MODEL_TYPE,
} from "./install-models/util/modelTypes";
import { useLibrarySubLevel } from "../library/libraryContext";
import "./models.css";

// "Installiert" (modelList) and "Entdecken" (installModels) are two sections
// of the library window. Each mounts lazily on its first visit and then stays
// mounted (hidden via display:none), so search, filters, paging, detail view
// and scroll survive switching sections.

// Fallback for the Install section's initial category when there is no
// Installed-section folder selection to derive it from.
const DEFAULT_INSTALL_MODEL_TYPE: MODEL_TYPE = "Checkpoint";

type ModelsRoute = "modelList" | "installModels";

interface Props {
  route: ModelsRoute;
}

export default function ModelsPanel({ route }: Props) {
  const myModelsRef = useRef<ModelsListPanelHandle>(null);
  const installRef = useRef<InstallModelsPanelHandle>(null);

  // Sections visited so far (lazy mount, then keep mounted).
  const [visited, setVisited] = useState<Record<ModelsRoute, boolean>>({
    modelList: route === "modelList",
    installModels: route === "installModels",
  });
  useEffect(() => {
    setVisited((v) => (v[route] ? v : { ...v, [route]: true }));
  }, [route]);
  const showList = visited.modelList || route === "modelList";
  const showInstall = visited.installModels || route === "installModels";

  // Detail-open flags pushed up by each section (Esc backs out one level).
  const [listDetailOpen, setListDetailOpen] = useState(false);
  const [installDetailOpen, setInstallDetailOpen] = useState(false);
  const closeListDetail = useCallback(
    () => myModelsRef.current?.closeDetail(),
    [],
  );
  const closeInstallDetail = useCallback(
    () => installRef.current?.closeDetail(),
    [],
  );
  useLibrarySubLevel("modelList", listDetailOpen, closeListDetail);
  useLibrarySubLevel("installModels", installDetailOpen, closeInstallDetail);

  // The Install section's initial Civitai type is derived once, from the
  // folder selected in the Installed section at the moment Install is first
  // activated; afterwards both sections are independent. Opening directly on
  // Install keeps the default.
  const installActivatedRef = useRef(false);
  const installInitialModelTypeRef = useRef<MODEL_TYPE>(
    DEFAULT_INSTALL_MODEL_TYPE,
  );
  if (showInstall && !installActivatedRef.current) {
    installActivatedRef.current = true;
    const folder = myModelsRef.current?.selectedFolder;
    const derived = folder ? folderToModelType(folder) : undefined;
    if (derived) installInitialModelTypeRef.current = derived;
  }

  return (
    <div className="lib-section lib-models">
      {showList && (
        <div
          className="lib-section"
          style={route === "modelList" ? undefined : { display: "none" }}
        >
          <ModelsListPanelContent
            ref={myModelsRef}
            onDetailOpenChange={setListDetailOpen}
          />
        </div>
      )}
      {showInstall && (
        <div
          className="lib-section"
          style={route === "installModels" ? undefined : { display: "none" }}
        >
          <InstallModelsPanelContent
            ref={installRef}
            modelType={installInitialModelTypeRef.current}
            onDetailOpenChange={setInstallDetailOpen}
          />
        </div>
      )}
    </div>
  );
}
