import { IconDotsVertical } from "@tabler/icons-react";
import { Menu, MenuButton, MenuList, Box } from "@chakra-ui/react";
import { LibraryToolbar } from "../../library/primitives";
import NsfwToggleButton from "../models-list-drawer/NsfwToggleButton";
import {
  LibSearch,
  ViewToggle,
  type ModelsView,
} from "../components/LibToolbarParts";
import AddApiKeyPopover from "./AddApiKeyPopover";
import BaseModelPicker from "./BaseModelPicker";
import { ALL_MODEL_TYPES, type MODEL_TYPE } from "./util/modelTypes";
import { useT } from "../../i18n/LanguageContext";
import type { TransKey } from "../../i18n/translations";

export const SORT_OPTIONS: { key: string; labelKey: TransKey }[] = [
  { key: "Most Downloaded", labelKey: "install.sort.mostDownloaded" },
  { key: "Highest Rated", labelKey: "install.sort.highestRated" },
  { key: "Newest", labelKey: "install.sort.newest" },
];

// Civitai `limit` accepts up to 100; we offer a small, sensible set. Standard 25.
export const PAGE_SIZE_OPTIONS = [10, 15, 25, 50];

interface InstallToolbarProps {
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  onSearch: () => void;
  modelType?: MODEL_TYPE;
  onSelectModelType: (t?: MODEL_TYPE) => void;
  sortBy: string;
  setSortBy: (v: string) => void;
  baseModel: string;
  setBaseModel: (v: string) => void;
  pageSize: number;
  setPageSize: (v: number) => void;
  view: ModelsView;
  setView: (v: ModelsView) => void;
}

/** Werkzeugzeile: Suche, Typ-Chips, Basismodell, Sortierung, Ansicht. */
export default function InstallToolbar({
  searchQuery,
  setSearchQuery,
  onSearch,
  modelType,
  onSelectModelType,
  sortBy,
  setSortBy,
  baseModel,
  setBaseModel,
  pageSize,
  setPageSize,
  view,
  setView,
}: InstallToolbarProps) {
  const { t } = useT();

  return (
    <LibraryToolbar>
      <LibSearch
        value={searchQuery}
        onChange={setSearchQuery}
        onEnter={onSearch}
        placeholder={t("install.search.placeholder")}
      />
      <div className="lib-chips">
        {[
          { key: "", label: t("install.categoryAll") },
          ...ALL_MODEL_TYPES.map((mt) => ({ key: mt as string, label: mt })),
        ].map((c) => {
          const on = (modelType ?? "") === c.key;
          return (
            <button
              type="button"
              key={c.key || "__all"}
              className={"lib-chip" + (on ? " on" : "")}
              aria-pressed={on}
              onClick={() =>
                onSelectModelType(
                  c.key === "" ? undefined : (c.key as MODEL_TYPE),
                )
              }
            >
              {c.label}
            </button>
          );
        })}
      </div>
      <span className="grow" />
      <BaseModelPicker value={baseModel} onChange={setBaseModel} />
      <select
        className="lib-input"
        aria-label={t("models.lib.sort")}
        value={sortBy}
        onChange={(e) => setSortBy(e.target.value)}
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.key} value={o.key}>
            {t("install.sort.label")} {t(o.labelKey)}
          </option>
        ))}
      </select>
      <select
        className="lib-input"
        aria-label={t("install.pageSize.label")}
        value={pageSize}
        onChange={(e) => setPageSize(Number(e.target.value))}
      >
        {PAGE_SIZE_OPTIONS.map((n) => (
          <option key={n} value={n}>
            {t("install.pageSize.label")} {n}
          </option>
        ))}
      </select>
      <NsfwToggleButton />
      {/* Mehr: vorerst nur der API-Key - der zieht später in die (dann
          umgestalteten) Einstellungen um. */}
      <Menu>
        <MenuButton
          as="button"
          className="lib-btn icon"
          style={{ width: 30, height: 28 }}
          aria-label={"more install options"}
        >
          <IconDotsVertical size={16} />
        </MenuButton>
        <MenuList>
          <Box px={3} py={1}>
            <AddApiKeyPopover />
          </Box>
        </MenuList>
      </Menu>
      <ViewToggle value={view} onChange={setView} />
    </LibraryToolbar>
  );
}
