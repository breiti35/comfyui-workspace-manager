import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Portal, useToast } from "@chakra-ui/react";
import {
  loadDBs,
  workflowsTable,
  userSettingsTable,
  changelogsTable,
  mediaTable,
  workflowVersionsTable,
} from "./db-tables/WorkspaceDB";
import { defaultGraph } from "./defaultGraph";
import { WorkspaceContext } from "./WorkspaceContext";
import {
  getFileUrl,
  getWorkflowIdInUrlHash,
  generateUrlHashWithFlowId,
  openWorkflowInNewTab,
} from "./utils";
import { Topbar } from "./topbar/Topbar";
import { Workflow, WorkflowVersion } from "./types/dbTypes";
import { useDialog } from "./components/AlertDialogProvider";
import LibraryHost from "./library/LibraryHost";
import { IconExternalLink } from "@tabler/icons-react";
import { DRAWER_Z_INDEX, UPGRADE_TO_2WAY_SYNC_KEY } from "./const";
import { WorkspaceRoute } from "./types/types";
import {
  currentRoute,
  initialRouteStack,
  pushRoute,
  popRoute,
  resetRouteStack,
} from "./routeStack";
import { useStateRef } from "./customHooks/useStateRef";
import { indexdb } from "./db-tables/indexdb";
import EnableTwowaySyncConfirm from "./settings/EnableTwowaySyncConfirm";
import { api, app } from "./utils/comfyapp";
import { loadCivitApiKey } from "./utils/civitUtils";
import { fetchApi } from "./Api";
import { serverInfo } from "./utils/OsPathUtils";
import {
  notifyMediaSaved,
  startPreviewImageCapture,
} from "./gallery/previewImageStore";
import { startDownloadTracking } from "./model-manager/install-models/downloadStore";
import { useT } from "./i18n/LanguageContext";

export default function App() {
  const [curFlowName, setCurFlowName] = useState<string | null>(null);
  const [routeStack, setRouteStack] = useState<WorkspaceRoute[]>(
    initialRouteStack,
  );
  const route = currentRoute(routeStack);
  const openRoute = useCallback((r: WorkspaceRoute) => {
    setRouteStack((s) => pushRoute(s, r));
  }, []);
  const closeRoute = useCallback(() => {
    setRouteStack((s) => popRoute(s));
  }, []);
  const resetRoutes = useCallback(() => {
    setRouteStack((s) => resetRouteStack(s));
  }, []);
  // Deprecated: narrow compatibility shim for call sites that were missed
  // during the routeStack migration, or added later without noticing it.
  // Prefer openRoute/closeRoute/resetRoutes directly.
  const setRoute = useCallback(
    (r: WorkspaceRoute) => (r === "root" ? closeRoute() : openRoute(r)),
    [closeRoute, openRoute],
  );
  const [loadingDB, setLoadingDB] = useState(true);
  const [flowID, setFlowID] = useState<string | null>(null);
  const curFlowID = useRef<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const workspaceContainerRef = useRef(null);
  const { showDialog } = useDialog();
  const [loadChild, setLoadChild] = useState(false);
  const developmentEnvLoadFirst = useRef(false);
  const toast = useToast();
  const { t } = useT();
  const [curVersion, setCurVersion] = useStateRef<WorkflowVersion | null>(null);
  const saveCurWorkflow = useCallback(async (force = false) => {
    const curWorkflow = workflowsTable?.curWorkflow;
    if (curWorkflow) {
      if (!force && workflowsTable?.curWorkflow?.saveLock) {
        toast({
          title: "The workflow is locked and cannot be saved",
          status: "warning",
          duration: 3000,
        });
        return;
      }
      const graphJson = JSON.stringify(app.graph.serialize());
      await Promise.all([
        workflowsTable?.updateFlow(curWorkflow.id, {
          json: graphJson,
        }),
        changelogsTable?.create({
          workflowID: curWorkflow.id,
          json: graphJson,
          isAutoSave: false,
        }),
      ]);
      setIsDirty(false);
    }
  }, []);

  const discardUnsavedChanges = async () => {
    showDialog(t("app.discardConfirm.text"), [
      {
        label: t("app.discardConfirm.confirm"),
        colorScheme: "red",
        onClick: async () => {
          const curID = workflowsTable?.curWorkflow?.id;
          if (curID == null) return;
          const lastSavedJson = (await workflowsTable?.get(curID))?.json;
          if (lastSavedJson) {
            workflowsTable?.updateCurWorkflow({
              ...workflowsTable.curWorkflow!,
              json: lastSavedJson,
            });
            await app.loadGraphData(JSON.parse(lastSavedJson));
            setIsDirty(false);
          } else {
            toast({
              title: t("app.discardConfirm.noSavedVersion"),
              status: "error",
              duration: 3000,
            });
          }
        },
      },
    ]);
  };

  const setCurFlowIDAndName = (workflow: Workflow | null) => {
    // curID null is when you deleted current workflow
    const id = workflow?.id ?? null;
    workflowsTable?.updateCurWorkflow(workflow);
    curFlowID.current = id;
    setFlowID(id);
    setCurFlowName(workflow?.name ?? "");
    if (id == null) {
      document.title = "ComfyUI";
      window.location.hash = "";
      localStorage.removeItem("curFlowID");
      return;
    }
    if (getWorkflowIdInUrlHash()) {
      const newUrlHash = generateUrlHashWithFlowId(id);
      window.location.hash = newUrlHash;
      document.title = workflow!.name + " - ComfyUI";
    } else {
      localStorage.setItem("curFlowID", id);
      document.title = "ComfyUI - " + workflow!.name;
    }
    if (workflow) {
      workflowsTable?.updateLastOpenedTime(workflow.id);
    }
  };

  const graphAppSetup = async () => {
    localStorage.removeItem("workspace");
    localStorage.removeItem("comfyspace");
    try {
      await loadDBs();
      // Hydrate the Civitai API key from server-side settings (and migrate any
      // legacy localStorage key) now that userSettings is loaded.
      await loadCivitApiKey();
    } catch (error) {
      console.error("🦄Workspace Manager - Error loading db", error);
    }
    setLoadingDB(false);

    const urlWorkflowID = getWorkflowIdInUrlHash();
    if (urlWorkflowID != null) {
      loadWorkflowIDImpl(urlWorkflowID);
    }
    fetchApi("/workspace/deduplicate_workflow_ids");
    fetchApi("/workspace/get_os")
      .then((resp) => resp.json())
      .then((data) => {
        if (data.os) {
          serverInfo.os = data.os;
        }
      });
    const twoway = await userSettingsTable?.getSetting("twoWaySync");

    if (!twoway) {
      const workflowsCount = await indexdb.workflows.count();
      if (workflowsCount == 0) {
        // empty workflows, enable 2way sync
        await userSettingsTable?.upsert({ twoWaySync: true });
        await indexdb.cache.put({
          id: UPGRADE_TO_2WAY_SYNC_KEY,
          value: "true",
        });
        return;
      }
      const myWorkflowsDir =
        await userSettingsTable?.getSetting("myWorkflowsDir");
      showDialog(
        <EnableTwowaySyncConfirm
          myWorkflowsDir={myWorkflowsDir ?? "undefined"}
        />,
        [
          {
            label: "I have downloaded all my workflows and ready to enable",
            onClick: async () => {
              await userSettingsTable?.upsert({ twoWaySync: true });
              if (await userSettingsTable?.getSetting("twoWaySync")) {
                indexdb.cache.put({
                  id: UPGRADE_TO_2WAY_SYNC_KEY,
                  value: "true",
                });
                location.reload();
              }
            },
            colorScheme: "red",
          },
        ],
        {
          closeOnOverlayClick: false,
        },
      );
    }
  };

  const loadWorkflowIDImpl = async (id: string, versionID?: string | null) => {
    if (app.graph == null) {
      return;
    }
    const flow = await workflowsTable?.get(id);
    // If the currently loaded flow does not exist, you need to clear the URL hash and localStorage to avoid popping up another prompt that the flow does not exist when refreshing the page.
    if (flow == null) {
      alert("Error: Workflow not found! id: " + id);
      setCurFlowIDAndName(null);
      return;
    }
    const version = versionID
      ? await workflowVersionsTable?.get(versionID)
      : null;

    app.ui.dialog.close();
    if (version) {
      setCurVersion(version);
      setCurFlowIDAndName({
        ...flow,
        json: version.json,
      });
      app.loadGraphData(JSON.parse(version.json));
    } else {
      setCurFlowIDAndName(flow);
      setCurVersion(null);
      app.loadGraphData(JSON.parse(flow.json));
    }
    // A workflow just landed on the canvas - the surface should be free,
    // not one level back into whatever was open before.
    resetRoutes();
    isDirty && setIsDirty(false);
  };

  const loadWorkflowID = async (
    id: string | null,
    versionID?: string | null,
    forceLoad: boolean = false,
  ) => {
    // No current workflow, id is null when you deleted current workflow
    if (id === null) {
      setCurFlowIDAndName(null);
      app.graph.clear();
      return;
    }
    if (
      !isDirty ||
      forceLoad ||
      workflowsTable?.curWorkflow == null ||
      userSettingsTable?.settings?.disableUnsavedWarning
    ) {
      loadWorkflowIDImpl(id, versionID);
      return;
    }
    // prompt when auto save disabled and dirty
    showSaveOrDiscardCurWorkflowDialog(id);
  };
  const showSaveOrDiscardCurWorkflowDialog = async (newIDToLoad?: string) => {
    const buttons = [
      newIDToLoad
        ? {
            label: "Open in new tab",
            icon: <IconExternalLink />,
            onClick: () => {
              openWorkflowInNewTab(newIDToLoad);
            },
          }
        : null,
      {
        label: "Save",
        colorScheme: "blue",
        onClick: async () => {
          await saveCurWorkflow();
          newIDToLoad && loadWorkflowIDImpl(newIDToLoad);
        },
      },
    ];
    buttons.push({
      label: "Discard",
      colorScheme: "red",
      onClick: async () => {
        newIDToLoad && loadWorkflowIDImpl(newIDToLoad);
      },
    });
    showDialog(
      `Please save or discard your changes to "${workflowsTable?.curWorkflow?.name}" before leaving, or your changes will be lost.`,
      buttons,
    );
  };

  const loadNewWorkflow = async (input?: { json?: string; name?: string }) => {
    const jsonStr = input?.json ?? JSON.stringify(defaultGraph);
    const flow = await workflowsTable?.createFlow({
      json: jsonStr,
      name: input?.name,
    });
    flow && (await loadWorkflowID(flow.id));
    resetRoutes();
  };

  const loadFilePath = async (
    relativePath: string,
    overwriteCurrent: boolean = false,
  ) => {
    const fileName = relativePath.split("/").pop() ?? relativePath;
    if (!overwriteCurrent) {
      loadNewWorkflow({ name: fileName });
    } else {
      saveCurWorkflow();
    }
    const res = await fetch(getFileUrl(relativePath));
    const blob = await res.blob();
    const fileObj = new File([blob], fileName, {
      type: res.headers.get("Content-Type") || "",
    });
    await app.handleFile(fileObj);
    resetRoutes();
  };

  const onDuplicateWorkflow = async (
    workflowID: string,
    newFlowName?: string,
  ) => {
    const workflow = await workflowsTable?.get(workflowID);
    if (workflow == null) {
      return;
    }
    const flow = await workflowsTable?.createFlow({
      json: workflow.json,
      name: newFlowName || workflow.name,
      parentFolderID: workflow.parentFolderID,
    });
    flow && (await loadWorkflowID(flow.id));
  };

  const onExecutedCreateMedia = useCallback((image: any) => {
    if (curFlowID.current == null) return;
    let path = image.filename;
    if (image.subfolder != null && image.subfolder !== "") {
      path = image.subfolder + "/" + path;
    }
    mediaTable
      ?.create({
        workflowID: curFlowID.current,
        localPath: path,
      })
      .then((media) => {
        // Only now is the record in indexdb - tell the gallery to refresh.
        if (media) notifyMediaSaved();
      })
      .catch((e) => console.error("Error creating media record:", e));
  }, []);

  useEffect(() => {
    /**
     * because we have turned on strict mode, useEffect will be executed twice in strict mode in the development environment.
     * and graphAppSetup contains DB related operations, repeated execution will bring some bad results.
     * so in development environment mode, the first execution is skipped.
     */
    if (
      // @ts-ignore
      process.env.NODE_ENV === "development" &&
      !developmentEnvLoadFirst.current
    ) {
      developmentEnvLoadFirst.current = true;
      return;
    }
    graphAppSetup();
    setLoadChild(true);

    // Capture "Preview Image" node outputs at app level so they're kept even
    // while the gallery modal is closed (the gallery only reads the store).
    startPreviewImageCapture();

    // Same reasoning for model downloads: tracking has to outlive the install
    // panel, otherwise closing it loses the progress (and the cancel button)
    // while the backend keeps downloading.
    startDownloadTracking();

    const handleExecuted = (e: any) => {
      e.detail?.output?.images?.forEach(
        (im: { filename: string; subfolder: string; type: string }) => {
          if (im.type === "output") {
            onExecutedCreateMedia(im);
          }
        },
      );
      e.detail?.output?.gifs?.forEach(
        (im: { filename: string; subfolder: string; type: string }) => {
          if (im.type === "output") {
            onExecutedCreateMedia(im);
          }
        },
      );
    };
    api.addEventListener("executed", handleExecuted);

    return () => {
      // Registered on ComfyUI's api (not window), so it must be removed there.
      api.removeEventListener("executed", handleExecuted);
    };
  }, []);

  if (loadingDB) {
    return null;
  }

  return (
    <WorkspaceContext.Provider
      value={{
        curFlowID: flowID,
        onDuplicateWorkflow: onDuplicateWorkflow,
        loadWorkflowID: loadWorkflowID,
        discardUnsavedChanges: discardUnsavedChanges,
        saveCurWorkflow: saveCurWorkflow,
        isDirty: isDirty,
        setIsDirty: setIsDirty,
        loadNewWorkflow: loadNewWorkflow,
        loadFilePath: loadFilePath,
        setRoute: setRoute,
        route: route,
        routeStack: routeStack,
        openRoute: openRoute,
        closeRoute: closeRoute,
        resetRoutes: resetRoutes,
        curVersion: curVersion,
        setCurVersion: setCurVersion,
        setCurFlowIDAndName: setCurFlowIDAndName,
      }}
    >
      <div ref={workspaceContainerRef} className="workspace_manager">
        <Portal containerRef={workspaceContainerRef}>
          <Box
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              left: 0,
            }}
            zIndex={DRAWER_Z_INDEX}
            draggable={false}
          >
            {/* before the Topbar in DOM order, so the bar paints above the library */}
            <LibraryHost
              ready={loadChild}
              onClickNewFlow={() => {
                loadNewWorkflow();
                closeRoute();
              }}
            />            <Topbar curFlowName={curFlowName} setCurFlowName={setCurFlowName} />

          </Box>
        </Portal>
      </div>
    </WorkspaceContext.Provider>
  );
}
