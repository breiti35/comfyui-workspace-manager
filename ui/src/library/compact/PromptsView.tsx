import { useContext, useEffect, useMemo, useState } from "react";
import { useT } from "../../i18n/LanguageContext";
import {
  PROMPTS_CHANGED_EVENT,
  listPrompts,
  type PromptRecipe,
} from "../../prompt-library/promptsStore";
import { CompactFrame, CopyButton, OpenButton, useCopied } from "./CompactParts";
import { useCompactSearch } from "./compactState";
import { OpenInLibraryContext } from "./openInLibraryContext";

/** Compact "Prompts": saved recipes, positive prompt copied in one click. */
export default function PromptsView() {
  const { t } = useT();
  const openInLibrary = useContext(OpenInLibraryContext);
  const query = useCompactSearch("prompts");
  const [items, setItems] = useState<PromptRecipe[] | null>(null);
  const [failed, setFailed] = useState(false);
  const { copied, copy } = useCopied();

  useEffect(() => {
    const load = () =>
      listPrompts(true)
        .then((l) => {
          setItems(l);
          setFailed(false);
        })
        .catch(() => setFailed(true));
    load();
    window.addEventListener(PROMPTS_CHANGED_EVENT, load);
    return () => window.removeEventListener(PROMPTS_CHANGED_EVENT, load);
  }, []);

  const q = query.trim().toLowerCase();
  const shown = useMemo(() => {
    const stamp = (p: PromptRecipe) => p.updateTime ?? p.createTime;
    return (items ?? [])
      .filter(
        (p) =>
          !q ||
          [p.name, p.positive, p.negative, p.model, ...(p.loras ?? []), ...p.tags]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q)),
      )
      .sort((a, b) => stamp(b) - stamp(a));
  }, [items, q]);

  return (
    <CompactFrame
      section="prompts"
      title={t("library.nav.prompts")}
      count={items ? String(shown.length) : undefined}
      searchPlaceholder={t("compact.search.prompts")}
      restoreWhen={items != null}
    >
      {failed && (
        <div role="alert" className="lib-cmp-empty">
          {t("prompts.loadError")}
        </div>
      )}
      {!failed && items && items.length === 0 && (
        <div className="lib-cmp-empty">{t("prompts.emptyLibrary")}</div>
      )}
      {!failed && items && items.length > 0 && shown.length === 0 && (
        <div className="lib-cmp-empty">{t("compact.empty.search")}</div>
      )}
      {shown.map((p) => (
        <div key={p.id} className="lib-cmp-row">
          <div className="lib-cmp-body">
            <div className="lib-cmp-name" title={p.name}>
              {p.name}
            </div>
            <div className="lib-cmp-text" title={p.positive}>
              {p.positive}
            </div>
            {(p.model || p.tags.length > 0) && (
              <div className="lib-cmp-sig">
                {[p.model, ...p.tags.slice(0, 3)].filter(Boolean).join(" · ")}
              </div>
            )}
          </div>
          <div className="lib-cmp-acts">
            <CopyButton
              label={`${t("compact.copy")}: ${t("prompts.positiveShort")}`}
              done={copied === p.id}
              onClick={() => copy(p.positive, p.id)}
            />
            {p.negative && (
              <CopyButton
                label={t("prompts.copyNegative")}
                done={copied === p.id + "#n"}
                onClick={() => copy(p.negative, p.id + "#n")}
              />
            )}
            <OpenButton onClick={() => openInLibrary("promptLibrary", p.id)} />
          </div>
        </div>
      ))}
    </CompactFrame>
  );
}
