import { useEffect, useState } from "react";
import { IconX } from "@tabler/icons-react";
import { LibraryHeader } from "../primitives";
import { useT } from "../../i18n/LanguageContext";
import { useDownloads } from "../../model-manager/install-models/useDownloads";
import { requestCancel } from "../../model-manager/install-models/downloadStore";
import { formatEta, formatSpeed } from "../../model-manager/utils";

const rowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "10px 24px",
  borderBottom: "1px solid var(--lib-line-soft)",
} as const;

const trackStyle = {
  position: "relative",
  height: 5,
  marginTop: 6,
  background: "var(--lib-input)",
  border: "1px solid var(--lib-line-soft)",
  borderRadius: 2,
  overflow: "hidden",
} as const;

const metaStyle = {
  display: "flex",
  justifyContent: "space-between",
  marginTop: 4,
  fontSize: 12,
  color: "var(--lib-text-2)",
  fontFamily: "var(--lib-mono)",
} as const;

/** Library section "Downloads": same data and cancel as the topbar popover. */
export default function DownloadsSection(_props: { onClose?: () => void }) {
  const { t } = useT();
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
  const handleCancel = (savePath: string) => {
    setCancelling((prev) => new Set(prev).add(savePath));
    requestCancel(savePath);
  };

  return (
    <div className="lib-section">
      <LibraryHeader
        title={t("install.downloads.popoverTitle")}
        subtitle={count > 0 ? String(count) : undefined}
      />
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {lastError && (
          <div
            role="alert"
            style={{
              ...rowStyle,
              color: "var(--lib-amber-text)",
              background: "var(--lib-card)",
              fontSize: 13,
            }}
          >
            {lastError.message}
          </div>
        )}
        {count === 0 && (
          <div
            style={{
              padding: "40px 24px",
              color: "var(--lib-text-2)",
              maxWidth: 520,
            }}
          >
            {t("lib.downloads.empty")}
          </div>
        )}
        {active.map((entry) => {
          const isCancelling = cancelling.has(entry.savePath);
          const meta = isCancelling
            ? t("install.downloads.cancelling")
            : [formatSpeed(entry.speed), formatEta(entry.eta)]
                .filter(Boolean)
                .join(" · ");
          return (
            <div key={entry.savePath} style={rowStyle}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  title={entry.fileName}
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {entry.fileName}
                </div>
                <div style={trackStyle}>
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.max(0, Math.min(100, entry.progress))}%`,
                      background: "var(--lib-amber)",
                    }}
                  />
                </div>
                <div style={metaStyle}>
                  <span>{meta || " "}</span>
                  <span>{Math.round(entry.progress)}%</span>
                </div>
              </div>
              <button
                type="button"
                className="lib-btn icon"
                disabled={isCancelling}
                title={t("install.downloads.cancelAria")}
                aria-label={t("install.downloads.cancelAria")}
                onClick={() => handleCancel(entry.savePath)}
              >
                <IconX size={16} />
              </button>
            </div>
          );
        })}
        {pending.map((fileName) => (
          <div key={fileName} style={rowStyle}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                title={fileName}
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {fileName}
              </div>
              <div style={metaStyle}>
                <span>{t("install.downloads.preparing")}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
