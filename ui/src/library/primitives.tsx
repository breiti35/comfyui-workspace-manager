import { useContext, type ReactNode } from "react";
import { IconX } from "@tabler/icons-react";
import { LibraryContext } from "./libraryContext";
import { useT } from "../i18n/LanguageContext";

/** Findbuch header: title, count line, main action on the right, close. */
export function LibraryHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** detail view: back control / breadcrumb shown above the title */
  back?: ReactNode;
}) {
  const { t } = useT();
  const { closeAll } = useContext(LibraryContext);
  return (
    <div className="lib-head">
      <div style={{ minWidth: 0 }}>
        {back}
        <h1
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </h1>
        {subtitle && <small>{subtitle}</small>}
      </div>
      <div className="lib-actions">
        {actions}
        <button
          type="button"
          className="lib-btn icon"
          aria-label={t("library.close")}
          title={t("library.close")}
          onClick={closeAll}
        >
          <IconX size={18} />
        </button>
      </div>
    </div>
  );
}

/** Tool row: search, filter, sort, view - in that order. */
export function LibraryToolbar({ children }: { children: ReactNode }) {
  return <div className="lib-tools">{children}</div>;
}

/** Reserved row for bulk actions on multi-select (empty = no space used). */
export function LibrarySelectionBar({ children }: { children?: ReactNode }) {
  return <div className="lib-selbar">{children}</div>;
}

export function LibraryFooter({
  left,
  right,
}: {
  left?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="lib-foot">
      <span>{left}</span>
      <span>{right}</span>
    </div>
  );
}

/** Index card: signature line / name / preview / meta. */
export function LibraryCard({
  signature,
  name,
  children,
  meta,
  hot,
  onClick,
}: {
  signature: ReactNode;
  name: ReactNode;
  children?: ReactNode;
  meta?: ReactNode;
  hot?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      className="lib-card"
      onClick={onClick}
      style={{ cursor: onClick ? "pointer" : undefined }}
    >
      <div className="lib-sig">{signature}</div>
      <div className="lib-name">{name}</div>
      {children}
      {meta && <div className={"lib-meta" + (hot ? " hot" : "")}>{meta}</div>}
    </div>
  );
}
