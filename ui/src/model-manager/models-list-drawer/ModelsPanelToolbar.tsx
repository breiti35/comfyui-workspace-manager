import { IconRefresh, IconStar, IconStarFilled } from "@tabler/icons-react";
import { LibraryToolbar } from "../../library/primitives";
import NsfwToggleButton from "./NsfwToggleButton";
import {
  LibSearch,
  ViewToggle,
  type ModelsView,
} from "../components/LibToolbarParts";
import { useT } from "../../i18n/LanguageContext";
import type { TransKey } from "../../i18n/translations";

interface Props {
  categories: string[];
  /** model count per category key */
  counts: Record<string, number>;
  total: number;
  /** "" = all categories */
  selectedModel: string;
  onSelectModel: (m: string) => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  baseModels: string[];
  baseFilter: string;
  setBaseFilter: (v: string) => void;
  sortBy: string;
  setSortBy: (v: string) => void;
  favoritesOnly: boolean;
  setFavoritesOnly: (b: boolean) => void;
  view: ModelsView;
  setView: (v: ModelsView) => void;
  onRefresh: () => void;
}

function getSortOptions(
  t: (key: TransKey) => string,
): { value: string; label: string }[] {
  return [
    { value: "az", label: t("models.toolbar.sortAZ") },
    { value: "za", label: t("models.toolbar.sortZA") },
    { value: "newest", label: t("models.toolbar.sortNewest") },
    { value: "oldest", label: t("models.toolbar.sortOldest") },
  ];
}

const CATEGORY_LABELS: Record<string, string> = {
  checkpoints: "Checkpoints",
  loras: "LoRAs",
  vae: "VAE",
  controlnet: "ControlNet",
  upscale_models: "Upscaler",
  embeddings: "Embeddings",
  hypernetworks: "Hypernetworks",
  clip: "CLIP",
  clip_vision: "CLIP Vision",
  unet: "UNet",
  diffusion_models: "Diffusion",
};

export function prettyCategory(key: string): string {
  return CATEGORY_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

/** Werkzeugzeile: Suche · Typ-Chips · Basismodell · Sortierung · Ansicht. */
export default function ModelsPanelToolbar({
  categories,
  counts,
  total,
  selectedModel,
  onSelectModel,
  searchQuery,
  setSearchQuery,
  baseModels,
  baseFilter,
  setBaseFilter,
  sortBy,
  setSortBy,
  favoritesOnly,
  setFavoritesOnly,
  view,
  setView,
  onRefresh,
}: Props) {
  const { t } = useT();
  const sortOptions = getSortOptions(t);

  return (
    <LibraryToolbar>
      <LibSearch
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder={t("models.toolbar.searchPlaceholder")}
      />
      <div className="lib-chips">
        <button
          type="button"
          className={"lib-chip" + (selectedModel === "" ? " on" : "")}
          aria-pressed={selectedModel === ""}
          onClick={() => onSelectModel("")}
        >
          {t("models.lib.all")} {total}
        </button>
        {categories.map((c) => (
          <button
            type="button"
            key={c}
            className={"lib-chip" + (selectedModel === c ? " on" : "")}
            aria-pressed={selectedModel === c}
            onClick={() => onSelectModel(c)}
          >
            {prettyCategory(c)} {counts[c] ?? 0}
          </button>
        ))}
      </div>
      <span className="grow" />
      <select
        className="lib-input"
        aria-label={t("models.lib.baseModel")}
        value={baseFilter}
        onChange={(e) => setBaseFilter(e.target.value)}
      >
        <option value="">{t("models.lib.allBase")}</option>
        {baseModels.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </select>
      <select
        className="lib-input"
        aria-label={t("models.toolbar.sortTooltip")}
        title={t("models.toolbar.sortTooltip")}
        value={sortBy}
        onChange={(e) => setSortBy(e.target.value)}
      >
        {sortOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="lib-btn"
        aria-pressed={favoritesOnly}
        title={
          favoritesOnly
            ? t("models.toolbar.showAllTooltip")
            : t("models.toolbar.showFavoritesOnlyTooltip")
        }
        onClick={() => setFavoritesOnly(!favoritesOnly)}
      >
        {favoritesOnly ? <IconStarFilled size={14} /> : <IconStar size={14} />}
        {t("models.toolbar.favoritesButton")}
      </button>
      <button
        type="button"
        className="lib-btn"
        title={t("models.toolbar.refreshTooltip")}
        onClick={onRefresh}
      >
        <IconRefresh size={14} />
        {t("models.toolbar.refreshButton")}
      </button>
      <NsfwToggleButton />
      <ViewToggle value={view} onChange={setView} />
    </LibraryToolbar>
  );
}
