import { IconButton, Tooltip } from "@chakra-ui/react";
import {
  IconDotsVertical,
  IconFolder,
  IconFolderPlus,
  IconListCheck,
  IconLock,
  IconPlus,
  IconSearch,
} from "@tabler/icons-react";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import {
  foldersTable,
  tagsTable,
  userSettingsTable,
  workflowsTable,
} from "../db-tables/WorkspaceDB";
import { RecentFilesContext, WorkspaceContext } from "../WorkspaceContext";
import { useT } from "../i18n/LanguageContext";
import { Folder, Tag, Workflow } from "../types/dbTypes";
import { formatTimestamp, insertWorkflowToCanvas, sortFileItem } from "../utils";
import { app } from "../utils/comfyapp";
import { openWorkflowsFolder } from "../Api";
import MediaPreview from "../components/MediaPreview";
import { LibSearch, ViewToggle, type ModelsView } from "../model-manager/components/LibToolbarParts";
import RecentFilesDrawerMenu from "../RecentFilesDrawer/RecentFilesDrawerMenu";
import ImportFlowsFileInput from "../RecentFilesDrawer/ImportFlowsFileInput";
import MultipleSelectionOperation from "../RecentFilesDrawer/MultipleSelectionOperation";
import WorkflowListItemActionButtons from "../RecentFilesDrawer/WorkflowListItemActionButtons";
import FilesListFolderItemRightClickMenu from "../RecentFilesDrawer/FilesListFolderItemRightClickMenu";
import { ESortTypes, sortTypeLocalStorageKey } from "../RecentFilesDrawer/types";
import {
  LibraryFooter,
  LibraryHeader,
  LibrarySelectionBar,
  LibraryToolbar,
} from "./primitives";

const VIEW_KEY = "CWM_WORKFLOWS_VIEW";
const RECENT_DAYS = 7;
const ROOT = "__root";
const SORTS = [
  ESortTypes.RECENTLY_MODIFIED,
  ESortTypes.OLDEST_MODIFIED,
  ESortTypes.AZ,
  ESortTypes.ZA,
];

function readLS(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function WorkflowCard({
  flow,
  folderLabel,
  list,
  hideCover,
  active,
  multi,
  checked,
  onToggle,
}: {
  flow: Workflow;
  folderLabel: string;
  list: boolean;
  hideCover: boolean;
  active: boolean;
  multi: boolean;
  checked: boolean;
  onToggle: () => void;
}) {
  const { t } = useT();
  const { loadWorkflowID } = useContext(WorkspaceContext);
  const { setDraggingFile } = useContext(RecentFilesContext);
  const cover = flow.coverMediaPath || flow.latestImage || "";
  const tags = flow.tags ?? [];
  const open = () => (multi ? onToggle() : loadWorkflowID(flow.id));
  const name = flow.name || t("drawer.untitledWorkflow");
  const thumb = !hideCover && cover && (
    <MediaPreview
      mediaLocalPath={cover}
      size={list ? 36 : 160}
      fill={!list}
      hideBrokenImage
    />
  );
  const actions = !multi && (
    <div className="lib-wf-acts" onClick={(e) => e.stopPropagation()}>
      <WorkflowListItemActionButtons workflow={flow} />
    </div>
  );
  const check = multi && (
    <input
      type="checkbox"
      className="lib-wf-check"
      checked={checked}
      aria-label={name}
      onChange={onToggle}
      onClick={(e) => e.stopPropagation()}
    />
  );
  const common = {
    role: "button",
    tabIndex: 0,
    draggable: !multi,
    onDragStart: () => setDraggingFile?.(flow),
    onClick: open,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        open();
      }
    },
  };
  const date = formatTimestamp(flow.updateTime, true, false, "/");

  if (list) {
    return (
      <div
        className={"lib-wf-row" + (active ? " act" : "") + (checked ? " sel" : "")}
        {...common}
      >
        {check}
        <div className="lib-wf-rthumb">{thumb}</div>
        <div className="lib-wf-rname" title={name}>
          {name}
          {flow.saveLock && <IconLock size={13} style={{ marginLeft: 4 }} />}
        </div>
        <div className="lib-wf-rfolder">{folderLabel}</div>
        <div className="lib-wf-rtags">{tags.join(" · ")}</div>
        <div className="lib-wf-rdate">{date}</div>
        {actions}
      </div>
    );
  }
  return (
    <div
      className={"lib-card lib-wf-card" + (active ? " act" : "") + (checked ? " sel" : "")}
      {...common}
    >
      <div className="lib-sig" title={folderLabel}>
        {folderLabel || "—"}
      </div>
      <div className="lib-wf-thumb">
        {thumb}
        {check}
        {actions}
      </div>
      <div className="lib-name" title={name}>
        {name}
        {flow.saveLock && <IconLock size={12} style={{ marginLeft: 4 }} />}
      </div>
      <div className="lib-wf-tags" title={tags.join(" · ")}>
        {tags.length ? tags.join(" · ") : " "}
      </div>
      <div className="lib-meta">{date}</div>
    </div>
  );
}

export default function WorkflowsSection({
  onClickNewFlow,
}: {
  onClickNewFlow: () => void;
}) {
  const { t } = useT();
  const { loadWorkflowID, curFlowID, openRoute } = useContext(WorkspaceContext);
  const [flows, setFlows] = useState<Workflow[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [folderSel, setFolderSel] = useState("");
  const [recentOnly, setRecentOnly] = useState(false);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [sort, setSort] = useState<ESortTypes>(
    (readLS(sortTypeLocalStorageKey) as ESortTypes) ??
      ESortTypes.RECENTLY_MODIFIED,
  );
  const [view, setView] = useState<ModelsView>(
    readLS(VIEW_KEY) === "compact" ? "compact" : "grid",
  );
  const [multi, setMulti] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [refreshStamp, setRefreshStamp] = useState(0);
  const [draggingFile, setDraggingFile] = useState<Workflow | Folder | null>(
    null,
  );
  const draggingId = useRef<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [shortcut, setShortcut] = useState("Ctrl+P");

  const refresh = useCallback(async () => {
    const [f, fo, tg] = await Promise.all([
      workflowsTable?.listAll() ?? [],
      foldersTable?.listAll() ?? [],
      tagsTable?.listAll() ?? [],
    ]);
    setFlows(f);
    setFolders(fo);
    setTags(tg);
    setLoaded(true);
    setRefreshStamp(Date.now());
  }, []);

  useEffect(() => {
    refresh();
    userSettingsTable?.getSetting("shortcuts").then((res) => {
      const key =
        res?.openSpotlightSearch ||
        userSettingsTable?.defaultSettings.shortcuts.openSpotlightSearch;
      if (key) setShortcut(key);
    });
  }, [refresh]);

  // Drag a workflow card onto the canvas -> insert it (same as the old list).
  useEffect(() => {
    const onDrop = async (e: { canvasX: number; canvasY: number }) => {
      if (!draggingId.current) return;
      const flow = await workflowsTable?.get(draggingId.current);
      flow?.json && insertWorkflowToCanvas(flow.json, [e.canvasX, e.canvasY]);
    };
    app.canvasEl.addEventListener("drop", onDrop);
    return () => app.canvasEl.removeEventListener("drop", onDrop);
  }, []);

  // Drag ends anywhere (also outside the drop strip) -> hide the strip.
  useEffect(() => {
    const end = () => {
      setDraggingFile(null);
      setDropTarget(null);
    };
    window.addEventListener("dragend", end);
    window.addEventListener("drop", end);
    return () => {
      window.removeEventListener("dragend", end);
      window.removeEventListener("drop", end);
    };
  }, []);

  const moveDragged = async (folderId: string | undefined) => {
    const dragged = draggingFile;
    setDropTarget(null);
    if (!dragged || "type" in dragged) return;
    await workflowsTable?.updateFolder(dragged.id, { parentFolderID: folderId });
    await refresh();
  };

  const folderById = useMemo(
    () => new Map(folders.map((f) => [f.id, f])),
    [folders],
  );
  const folderPath = useCallback(
    (id?: string | null): string => {
      const parts: string[] = [];
      let cur = id ? folderById.get(id) : undefined;
      let guard = 0;
      while (cur && guard++ < 20) {
        parts.unshift(cur.name);
        cur = cur.parentFolderID ? folderById.get(cur.parentFolderID) : undefined;
      }
      return parts.join(" / ");
    },
    [folderById],
  );
  const folderOptions = useMemo(
    () =>
      folders
        .map((f) => ({ id: f.id, label: folderPath(f.id) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [folders, folderPath],
  );

  // Reset a filter that points to a folder which no longer exists.
  useEffect(() => {
    if (folderSel && folderSel !== ROOT && loaded && !folderById.has(folderSel))
      setFolderSel("");
  }, [folderSel, folderById, loaded]);

  const inFolder = useCallback(
    (flow: Workflow, id: string) => {
      let cur = flow.parentFolderID;
      let guard = 0;
      while (cur && guard++ < 20) {
        if (cur === id) return true;
        cur = folderById.get(cur)?.parentFolderID;
      }
      return false;
    },
    [folderById],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const since = Date.now() - RECENT_DAYS * 86400000;
    const list = flows.filter((f) => {
      if (folderSel === ROOT && f.parentFolderID) return false;
      if (folderSel && folderSel !== ROOT && !inFolder(f, folderSel)) return false;
      if (recentOnly && Math.max(f.updateTime, f.lastOpenedTime ?? 0) < since)
        return false;
      if (activeTag && !f.tags?.includes(activeTag)) return false;
      if (!q) return true;
      return (
        f.name.toLowerCase().includes(q) ||
        (f.tags ?? []).some((tg) => tg.toLowerCase().includes(q)) ||
        folderPath(f.parentFolderID).toLowerCase().includes(q)
      );
    });
    return sortFileItem(list, recentOnly ? ESortTypes.RECENTLY_OPENED : sort);
  }, [flows, query, folderSel, recentOnly, activeTag, sort, inFolder, folderPath]);

  const onSort = (s: ESortTypes) => {
    setSort(s);
    try {
      window.localStorage.setItem(sortTypeLocalStorageKey, s);
    } catch {
      /* ignore */
    }
  };
  const onView = (v: ModelsView) => {
    setView(v);
    try {
      window.localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };
  const sortLabel = (s: ESortTypes) =>
    ({
      [ESortTypes.RECENTLY_MODIFIED]: t("drawer.sort.newest"),
      [ESortTypes.OLDEST_MODIFIED]: t("drawer.sort.oldest"),
      [ESortTypes.AZ]: t("drawer.sort.az"),
      [ESortTypes.ZA]: t("drawer.sort.za"),
      [ESortTypes.RECENTLY_OPENED]: t("drawer.sort.newest"),
    })[s];

  const onDelete = useCallback(
    async (id: string) => {
      await workflowsTable?.deleteFlow(id);
      if (workflowsTable?.curWorkflow?.id === id) await loadWorkflowID?.(null);
      await refresh();
    },
    [loadWorkflowID, refresh],
  );

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const batchOperation = (type: string, value?: unknown) => {
    if (type === "batchDelete") {
      curFlowID &&
        workflowsTable?.get(curFlowID).then((res) => {
          if (!res) loadWorkflowID?.(null);
        });
      refresh();
      setMulti(false);
      setSelected([]);
    } else if (type === "selectAll") {
      setSelected(value ? shown.map((f) => f.id) : []);
    }
  };

  const selectedFolder = folderSel && folderSel !== ROOT ? folderById.get(folderSel) : undefined;
  const openFolderMenu = (e: MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setMenu({ x: r.left, y: r.bottom });
  };
  const gridClass = "lib-grid lib-wf-grid" + (view === "compact" ? " list" : "");

  return (
    <RecentFilesContext.Provider
      value={{
        onRefreshFilesList: refresh,
        draggingFile: draggingFile ?? undefined,
        setDraggingFile: (file) => {
          setDraggingFile(file);
          draggingId.current = "type" in file && file.type === "folder" ? null : file.id;
        },
        isMultiSelecting: multi,
        onMultiSelectFlow: (id) => toggle(id),
        multiSelectedFlowsID: selected,
        onDeleteFlow: onDelete,
        refreshFolderStamp: refreshStamp,
        setRefreshFolderStamp: setRefreshStamp,
      }}
    >
      <div
        className="lib-section"
        style={{
          ["--chakra-colors-rowBorderColor" as string]: "var(--lib-line-soft)",
        }}
      >
        <LibraryHeader
          title={t("drawer.title")}
          subtitle={String(flows.length)}
          actions={
            <>
              <ImportFlowsFileInput />
              <Tooltip label={t("drawer.openSaveDir")}>
                <IconButton
                  aria-label={t("drawer.openSaveDir")}
                  size="sm"
                  icon={<IconFolder size={18} />}
                  variant="ghost"
                  onClick={() => openWorkflowsFolder()}
                />
              </Tooltip>
              <RecentFilesDrawerMenu />
              <button type="button" className="lib-btn primary" onClick={onClickNewFlow}>
                <IconPlus size={16} />
                {t("drawer.newWorkflow")}
              </button>
            </>
          }
        />
        <LibraryToolbar>
          <LibSearch
            value={query}
            onChange={setQuery}
            placeholder={t("drawer.searchPlaceholder")}
          />
          <button
            type="button"
            className="lib-btn"
            title={t("drawer.quickSearchHint")}
            onClick={() => openRoute("spotlightSearch")}
          >
            <IconSearch size={14} />
            {t("drawer.quickSearch")}
            <kbd className="lib-kbd">{shortcut}</kbd>
          </button>
          <select
            className="lib-input"
            value={folderSel}
            aria-label={t("drawer.folderFilter")}
            onChange={(e) => setFolderSel(e.target.value)}
          >
            <option value="">{t("drawer.folderAll")}</option>
            <option value={ROOT}>{t("drawer.folderRoot")}</option>
            {folderOptions.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          {selectedFolder && (
            <button
              type="button"
              className="lib-btn icon-sm"
              aria-label={t("drawer.folderMenu")}
              title={t("drawer.folderMenu")}
              onClick={openFolderMenu}
            >
              <IconDotsVertical size={14} />
            </button>
          )}
          <button
            type="button"
            className="lib-btn icon-sm"
            aria-label={t("drawer.newFolder")}
            title={t("drawer.newFolder")}
            onClick={async () => {
              await foldersTable?.create({
                name: t("drawer.newFolderName"),
                parentFolderID: selectedFolder?.id,
              });
              refresh();
            }}
          >
            <IconFolderPlus size={14} />
          </button>
          <div className="lib-chips" role="group">
            <button
              type="button"
              className={"lib-chip" + (recentOnly ? " on" : "")}
              aria-pressed={recentOnly}
              title={t("drawer.recentHint")}
              onClick={() => setRecentOnly(!recentOnly)}
            >
              {t("drawer.recent")}
            </button>
          </div>
          {tags.length > 0 && (
            <div className="lib-chips" role="group">
              {tags.map((tg) => (
                <button
                  type="button"
                  key={tg.name}
                  className={"lib-chip" + (activeTag === tg.name ? " on" : "")}
                  aria-pressed={activeTag === tg.name}
                  onClick={() => setActiveTag(activeTag === tg.name ? null : tg.name)}
                >
                  {tg.name}
                </button>
              ))}
            </div>
          )}
          <span className="grow" />
          {!multi && (
            <button
              type="button"
              className="lib-btn"
              aria-label={t("drawer.startMultiSelectAria")}
              title={t("drawer.selectMultiple")}
              onClick={() => setMulti(true)}
            >
              <IconListCheck size={14} />
              {t("drawer.selectMultiple")}
            </button>
          )}
          <select
            className="lib-input"
            value={sort}
            aria-label={t("prompts.sort")}
            disabled={recentOnly}
            onChange={(e) => onSort(e.target.value as ESortTypes)}
          >
            {SORTS.map((s) => (
              <option key={s} value={s}>
                {sortLabel(s)}
              </option>
            ))}
          </select>
          <ViewToggle value={view} onChange={onView} />
        </LibraryToolbar>
        {draggingFile && !("type" in draggingFile) && (
          <div className="lib-wf-dropstrip" role="group" aria-label={t("drawer.dropToFolder")}>
            <span className="lib-wf-drophint">{t("drawer.dropToFolder")}</span>
            {[{ id: ROOT, label: t("drawer.folderRoot") }, ...folderOptions].map((f) => (
              <div
                key={f.id}
                className={"lib-wf-drop" + (dropTarget === f.id ? " on" : "")}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDropTarget(f.id);
                }}
                onDragLeave={() => setDropTarget((c) => (c === f.id ? null : c))}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  moveDragged(f.id === ROOT ? undefined : f.id);
                }}
              >
                <IconFolder size={14} />
                {f.label}
              </div>
            ))}
          </div>
        )}
        <LibrarySelectionBar>
          {multi && (
            <div className="lib-wf-selbar">
              <MultipleSelectionOperation
                multipleState={multi}
                changeMultipleState={(s) => {
                  setMulti(s);
                  !s && setSelected([]);
                }}
                selectedKeys={selected}
                isSelectedAll={shown.length > 0 && selected.length === shown.length}
                batchOperationCallback={batchOperation}
              />
            </div>
          )}
        </LibrarySelectionBar>
        <div className="lib-scroll">
          {!loaded ? null : shown.length === 0 ? (
            <div className="lib-state">
              <span>{flows.length === 0 ? t("drawer.emptyLibrary") : t("drawer.noMatches")}</span>
            </div>
          ) : (
            <div className={gridClass}>
              {shown.map((f) => (
                <WorkflowCard
                  key={f.id}
                  flow={f}
                  folderLabel={folderPath(f.parentFolderID)}
                  list={view === "compact"}
                  hideCover={!!userSettingsTable?.settings?.hideCoverImage}
                  active={curFlowID === f.id && !multi}
                  multi={multi}
                  checked={selected.includes(f.id)}
                  onToggle={() => toggle(f.id)}
                />
              ))}
            </div>
          )}
        </div>
        <LibraryFooter left={`${shown.length} / ${flows.length}`} />
        {selectedFolder && menu && (
          <FilesListFolderItemRightClickMenu
            isopen={true}
            menuPosition={menu}
            onClose={() => setMenu(null)}
            folder={selectedFolder}
          />
        )}
      </div>
    </RecentFilesContext.Provider>
  );
}
