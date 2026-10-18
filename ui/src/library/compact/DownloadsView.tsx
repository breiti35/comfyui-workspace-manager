import { useContext, useEffect, useState } from "react";
import { IconExternalLink, IconX } from "@tabler/icons-react";
import { useT } from "../../i18n/LanguageContext";
import { useDownloads } from "../../model-manager/install-models/useDownloads";
import { requestCancel } from "../../model-manager/install-models/downloadStore";
import { formatEta, formatSpeed } from "../../model-manager/utils";
import { CompactFrame } from "./CompactParts";
import { OpenInLibraryContext } from "./openInLibraryContext";

/** Compact "Downloads": same data and cancel as the library's Downloads. */
export default function DownloadsView() {
  const { t } = useT();
  const openInLibrary = useContext(OpenInLibraryContext);
  const { active, pending, lastError } = useDownloads();
  // Cancel is fire-and-forget; show a status word until the entry vanishes.
  const [cancelling, setCancelling] = useState<Set<string>>(new Set());

  useEffect(() => {
    setCancelling((prev) => {
      if (prev.size === 0) return prev;
      const paths = new Set(active.map((a) => a.savePath));
      const next = new Set([...prev].filter((p) => paths.has(p)));
      return next.size === prev.size ? prev : next;
    });
  }, [active]);

  const count = active.length + pending.length;

  return (
    <CompactFrame
      section="downloads"
      title={t("library.nav.downloads")}
      count={count > 0 ? String(count) : undefined}
    >
      {lastError && (
        <div role="alert" className="lib-cmp-alert">
          {lastError.message}
        </div>
      )}
      {count === 0 && (
        <div className="lib-cmp-empty">{t("lib.downloads.empty")}</div>
      )}
      {active.map((entry) => {
        const isCancelling = cancelling.has(entry.savePath);
        const meta = isCancelling
          ? t("install.downloads.cancelling")
          : [formatSpeed(entry.speed), formatEta(entry.eta)]
              .filter(Boolean)
              .join(" · ");
        const pct = Math.max(0, Math.min(100, entry.progress));
        return (
          <div key={entry.savePath} className="lib-cmp-row">
            <div className="lib-cmp-body">
              <div className="lib-cmp-name" title={entry.fileName}>
                {entry.fileName}
              </div>
              <div
                className="lib-cmp-track"
                role="progressbar"
                aria-label={entry.fileName}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(pct)}
              >
                <div style={{ width: `${pct}%` }} />
              </div>
              <div className="lib-cmp-dlmeta">
                <span>{meta || " "}</span>
                <span>{Math.round(pct)}%</span>
              </div>
            </div>
            <div className="lib-cmp-acts">
              <button
                type="button"
                className="lib-btn icon-sm"
                disabled={isCancelling}
                title={t("install.downloads.cancelAria")}
                aria-label={t("install.downloads.cancelAria")}
                onClick={() => {
                  setCancelling((prev) => new Set(prev).add(entry.savePath));
                  requestCancel(entry.savePath);
                }}
              >
                <IconX size={15} />
              </button>
            </div>
          </div>
        );
      })}
      {pending.map((fileName) => (
        <div key={fileName} className="lib-cmp-row">
          <div className="lib-cmp-body">
            <div className="lib-cmp-name" title={fileName}>
              {fileName}
            </div>
            <div className="lib-cmp-dlmeta">
              <span>{t("install.downloads.preparing")}</span>
            </div>
          </div>
        </div>
      ))}
      <div className="lib-cmp-more">
        <button
          type="button"
          className="lib-btn lib-cmp-wide"
          onClick={() => openInLibrary("downloads")}
        >
          <IconExternalLink size={15} />
          {t("compact.openInLibrary")}
        </button>
      </div>
    </CompactFrame>
  );
}
