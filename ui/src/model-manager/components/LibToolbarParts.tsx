import { IconLayoutGrid, IconLayoutGridAdd } from "@tabler/icons-react";
import { useT } from "../../i18n/LanguageContext";

export type ModelsView = "grid" | "compact";

/** Search field in the library look (replaces the rounded Chakra SearchInput). */
export function LibSearch({
  value,
  onChange,
  onEnter,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onEnter?: () => void;
  placeholder: string;
}) {
  return (
    <input
      type="search"
      className="lib-input search"
      value={value}
      placeholder={placeholder}
      aria-label={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onEnter?.();
      }}
    />
  );
}


/** Ansicht: Raster / kompakt. */
export function ViewToggle({
  value,
  onChange,
}: {
  value: ModelsView;
  onChange: (v: ModelsView) => void;
}) {
  const { t } = useT();
  return (
    <div className="lib-chips" role="group" aria-label={t("models.lib.view")}>
      <button
        type="button"
        className={"lib-chip" + (value === "grid" ? " on" : "")}
        aria-pressed={value === "grid"}
        title={t("models.lib.viewGrid")}
        aria-label={t("models.lib.viewGrid")}
        onClick={() => onChange("grid")}
      >
        <IconLayoutGrid size={14} />
      </button>
      <button
        type="button"
        className={"lib-chip" + (value === "compact" ? " on" : "")}
        aria-pressed={value === "compact"}
        title={t("models.lib.viewCompact")}
        aria-label={t("models.lib.viewCompact")}
        onClick={() => onChange("compact")}
      >
        <IconLayoutGridAdd size={14} />
      </button>
    </div>
  );
}
