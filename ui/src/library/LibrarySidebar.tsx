import { useContext, useRef, type KeyboardEvent, type ReactNode } from "react";
import {
  IconBook2,
  IconCompass,
  IconDownload,
  IconFolder,
  IconPackage,
  IconPhoto,
  IconSettings,
} from "@tabler/icons-react";
import { WorkspaceContext } from "../WorkspaceContext";
import { useT } from "../i18n/LanguageContext";
import type { TransKey } from "../i18n/translations";
import type { LibrarySection } from "./libraryContext";

interface Entry {
  section: LibrarySection;
  label: TransKey;
  icon: ReactNode;
}
const GROUPS: { label: TransKey; entries: Entry[] }[] = [
  {
    label: "library.group.work",
    entries: [
      { section: "recentFlows", label: "library.nav.workflows", icon: <IconFolder size={18} /> },
      { section: "gallery", label: "library.nav.gallery", icon: <IconPhoto size={18} /> },
      { section: "promptLibrary", label: "library.nav.prompts", icon: <IconBook2 size={18} /> },
    ],
  },
  {
    label: "library.group.models",
    entries: [
      { section: "modelList", label: "library.nav.installed", icon: <IconPackage size={18} /> },
      { section: "installModels", label: "library.nav.discover", icon: <IconCompass size={18} /> },
    ],
  },
  {
    label: "library.group.system",
    entries: [
      { section: "downloads", label: "library.nav.downloads", icon: <IconDownload size={18} /> },
      { section: "settings", label: "library.nav.settings", icon: <IconSettings size={18} /> },
    ],
  },
];

export default function LibrarySidebar({
  active,
  narrow,
  counts,
}: {
  active: LibrarySection;
  narrow: boolean;
  counts: Partial<Record<LibrarySection, number>>;
}) {
  const { t } = useT();
  const { openRoute } = useContext(WorkspaceContext);
  const ref = useRef<HTMLElement>(null);

  // Arrow keys move between the rows (roving focus, no tab stop per row).
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const rows = Array.from(
      ref.current?.querySelectorAll<HTMLButtonElement>(".lib-row") ?? [],
    );
    const i = rows.indexOf(document.activeElement as HTMLButtonElement);
    if (i === -1) return;
    e.preventDefault();
    const next = rows[(i + (e.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length];
    next?.focus();
  };

  return (
    <nav
      ref={ref}
      className={"lib-cabinet" + (narrow ? " narrow" : "")}
      aria-label={t("library.title")}
      onKeyDown={onKeyDown}
    >
      {GROUPS.map((g) => (
        <div key={g.label}>
          <div className="lib-grp">{narrow ? null : t(g.label)}</div>
          {g.entries.map((e) => {
            const isActive = e.section === active;
            const n = counts[e.section];
            return (
              <button
                key={e.section}
                type="button"
                className={"lib-row" + (isActive ? " act" : "")}
                aria-current={isActive ? "page" : undefined}
                title={narrow ? t(e.label) : undefined}
                aria-label={narrow ? t(e.label) : undefined}
                onClick={() => openRoute(e.section)}
              >
                <span className="tab" />
                {narrow && <span className="ico">{e.icon}</span>}
                <span className="lbl">{t(e.label)}</span>
                {n != null && <span className="num">{n}</span>}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
