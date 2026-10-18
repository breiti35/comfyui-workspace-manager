import { Spinner } from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";
import { IconDownload } from "@tabler/icons-react";
import type { CivitiModel } from "../types";
import { findImageFromModel } from "../../utils/findSfwImage";
import { civitThumbUrl } from "../api/civitDetailApi";
import { userSettingsTable } from "../../db-tables/WorkspaceDB";
import { useInView } from "../../customHooks/useInView";
import { formatCount, formatSpeed, formatEta } from "../utils";
import { NSFW_BLUR_FILTER } from "../components/CivitDetailShared";
import type { DownloadEntry } from "./downloadStore";
import { useT } from "../../i18n/LanguageContext";

interface InstallModelCardProps {
  model: CivitiModel;
  installed: boolean;
  stat?: DownloadEntry;
  installing: boolean;
  onQuickInstall: (model: CivitiModel) => void;
  onOpenDetail: (model: CivitiModel) => void;
  /** Where a quick install lands (resolved path, or the folder key). */
  targetFolder?: string;
}

export default function InstallModelCard({
  model,
  installed,
  stat,
  installing,
  onQuickInstall,
  onOpenDetail,
  targetFolder,
}: InstallModelCardProps) {
  const { t } = useT();
  const { ref, inView } = useInView<HTMLDivElement>("400px");
  const [showNsfw, setShowNsfw] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const picked = useMemo(() => findImageFromModel(model, 450), [model]);
  const baseModel = model.modelVersions?.[0]?.baseModel;
  const blurred = picked.isNsfw && !showNsfw && !revealed;
  const progress = stat?.progress;
  const downloading = stat != null || installing;

  useEffect(() => {
    const update = () => {
      userSettingsTable
        ?.getSetting("showNsfwModelThumbnail")
        .then((r) => setShowNsfw(r ?? false));
    };
    update();
    window.addEventListener("showNsfwModelThumbnail", update);
    return () => window.removeEventListener("showNsfwModelThumbnail", update);
  }, []);

  const signature = [model.type, baseModel].filter(Boolean).join(" · ");
  const rateLine =
    progress != null
      ? [
          `${progress.toFixed(0)} %`,
          formatSpeed(stat?.speed),
          formatEta(stat?.eta),
        ]
          .filter(Boolean)
          .join(" · ")
      : t("install.loading");
  const statsLine = `↓ ${formatCount(model.stats?.downloadCount)} · ♥ ${formatCount(
    model.stats?.thumbsUpCount ?? model.stats?.favoriteCount,
  )}`;

  return (
    <div
      ref={ref}
      className="lib-card"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onOpenDetail(model);
        }
      }}
      style={{ cursor: "pointer" }}
      onClick={() => onOpenDetail(model)}
    >
      <div className="lib-sig" title={signature}>
        {signature}
      </div>
      <div className="lib-name" title={model.name}>
        {model.name}
      </div>
      <div className="lib-pv">
        {inView && picked.url && (
          <img
            src={civitThumbUrl(picked.url, 450)}
            loading="lazy"
            alt={model.name ?? "model"}
            style={{ filter: blurred ? NSFW_BLUR_FILTER : undefined }}
          />
        )}

        {/* NSFW-Reveal */}
        {blurred && (
          <div className="ov">
            <button
              type="button"
              className="lib-btn"
              onClick={(e) => {
                e.stopPropagation();
                setRevealed(true);
              }}
            >
              {t("install.reveal.button")}
            </button>
          </div>
        )}

        {!installed && !downloading && (
          <div className="dl">
            <button
              type="button"
              className="lib-btn"
              title={
                targetFolder
                  ? `${t("install.targetFolder")}: ${targetFolder}`
                  : undefined
              }
              onClick={(e) => {
                e.stopPropagation();
                onQuickInstall(model);
              }}
            >
              <IconDownload size={14} />
              {t("install.installButton")}
            </button>
          </div>
        )}
        {downloading && progress == null && (
          <div className="ph">
            <Spinner size="sm" />
          </div>
        )}
      </div>
      <div className={"lib-meta" + (downloading || installed ? " hot" : "")}>
        {downloading
          ? rateLine
          : installed
            ? `✓ ${t("install.installedBadge")}`
            : statsLine}
      </div>
      {/* Download-Fortschritt auf der Karte */}
      {downloading && progress != null && (
        <div
          className="lib-bar"
          style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
        />
      )}
    </div>
  );
}
