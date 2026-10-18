import { useToast } from "@chakra-ui/react";
import { IconCopy, IconPlus } from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useT } from "../i18n/LanguageContext";
import {
  LibraryFooter,
  LibraryHeader,
  LibrarySelectionBar,
  LibraryToolbar,
} from "../library/primitives";
import { useLibrarySubLevel } from "../library/libraryContext";
import {
  LibSearch,
  ViewToggle,
  type ModelsView,
} from "../model-manager/components/LibToolbarParts";
import PromptEditor from "./PromptEditor";
import {
  addPrompt,
  collectTags,
  deletePrompt,
  listPrompts,
  PROMPTS_CHANGED_EVENT,
  updatePrompt,
  type PromptRecipe,
} from "./promptsStore";
import "./prompts.css";

interface Props {
  onClose: () => void;
}

type Sort = "newest" | "oldest" | "name";

function PromptCard({
  item,
  onEdit,
  onCopy,
}: {
  item: PromptRecipe;
  onEdit: () => void;
  onCopy: (text: string) => void;
}) {
  const { t } = useT();
  const extras = [
    item.loras?.length ? `${item.loras.length} LoRA` : "",
    ...(item.tags ?? []),
  ].filter(Boolean);
  const copy = (text: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    onCopy(text);
  };
  return (
    <div
      className="lib-card lib-prompt-card"
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={(e) => {
        if (
          e.target === e.currentTarget &&
          (e.key === "Enter" || e.key === " ")
        ) {
          e.preventDefault();
          onEdit();
        }
      }}
    >
      <div className="lib-sig">{item.model || "—"}</div>
      <div className="lib-name" title={item.name}>
        {item.name}
      </div>
      <div className="lib-prompt-body">{item.positive || "—"}</div>
      <div className="lib-prompt-acts">
        <button
          type="button"
          className="lib-btn"
          title={t("prompts.copyPositive")}
          onClick={copy(item.positive)}
        >
          <IconCopy size={13} />
          {t("prompts.positiveShort")}
        </button>
        {item.negative && (
          <button
            type="button"
            className="lib-btn"
            title={t("prompts.copyNegative")}
            onClick={copy(item.negative)}
          >
            <IconCopy size={13} />
            {t("prompts.negativeShort")}
          </button>
        )}
      </div>
      <div className="lib-meta" title={extras.join(" · ")}>
        {extras.join(" · ") || " "}
      </div>
    </div>
  );
}

export default function PromptLibraryModal(_props: Partial<Props>) {
  const { t } = useT();
  const toast = useToast();
  const [items, setItems] = useState<PromptRecipe[]>([]);
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("newest");
  const [view, setView] = useState<ModelsView>("grid");
  // undefined = grid, null = creating a new entry, object = editing
  const [editing, setEditing] = useState<PromptRecipe | null | undefined>(
    undefined,
  );
  const closeEditing = useCallback(() => setEditing(undefined), []);
  // Esc backs out of the editor first, then closes the library.
  useLibrarySubLevel("promptLibrary", editing !== undefined, closeEditing);

  // true when the library couldn't be read. Shown instead of the "empty
  // library" hint, and the "New" button is disabled - the store refuses
  // writes until a load succeeded anyway.
  const [loadError, setLoadError] = useState(false);

  const refresh = useCallback(() => {
    listPrompts(true)
      .then((list) => {
        setItems(list);
        setLoadError(false);
      })
      .catch((e) => {
        console.error("Error loading prompt library:", e);
        setLoadError(true);
      });
  }, []);

  // Save/delete failures keep the editor open so nothing typed is lost.
  const runMutation = async (action: () => Promise<unknown>) => {
    try {
      await action();
      setEditing(undefined);
    } catch (e) {
      toast({
        title: t("prompts.saveError"),
        description: e instanceof Error ? e.message : String(e),
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    }
  };

  useEffect(() => {
    refresh();
    window.addEventListener(PROMPTS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(PROMPTS_CHANGED_EVENT, refresh);
  }, [refresh]);

  const tags = useMemo(() => collectTags(items), [items]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = items.filter((p) => {
      if (activeTag && !p.tags?.includes(activeTag)) return false;
      if (!q) return true;
      return [p.name, p.positive, p.negative, p.model, ...(p.loras ?? [])]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
    const stamp = (p: PromptRecipe) => p.updateTime ?? p.createTime;
    if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "oldest") list.sort((a, b) => stamp(a) - stamp(b));
    else list.sort((a, b) => stamp(b) - stamp(a));
    return list;
  }, [items, query, activeTag, sort]);

  const copyText = (text: string) => {
    navigator.clipboard?.writeText(text);
    toast({ title: t("prompts.copied"), status: "success", duration: 1400 });
  };

  if (editing !== undefined) {
    return (
      <div className="lib-section">
        <PromptEditor
          value={editing}
          onCancel={() => setEditing(undefined)}
          onDelete={
            editing
              ? () => runMutation(() => deletePrompt(editing.id))
              : undefined
          }
          onSave={(data) =>
            runMutation(() =>
              editing ? updatePrompt(editing.id, data) : addPrompt(data),
            )
          }
        />
      </div>
    );
  }

  return (
    <div className="lib-section">
      <LibraryHeader
        title={t("prompts.title")}
        subtitle={String(items.length)}
        actions={
          <button
            type="button"
            className="lib-btn primary"
            disabled={loadError}
            onClick={() => setEditing(null)}
          >
            <IconPlus size={16} />
            {t("prompts.new")}
          </button>
        }
      />
      <LibraryToolbar>
        <LibSearch
          value={query}
          onChange={setQuery}
          placeholder={t("prompts.searchPlaceholder")}
        />
        {tags.length > 0 && (
          <div className="lib-chips" role="group">
            <button
              type="button"
              className={"lib-chip" + (activeTag == null ? " on" : "")}
              aria-pressed={activeTag == null}
              onClick={() => setActiveTag(null)}
            >
              {t("prompts.allTags")}
            </button>
            {tags.map((tag) => (
              <button
                type="button"
                key={tag}
                className={"lib-chip" + (activeTag === tag ? " on" : "")}
                aria-pressed={activeTag === tag}
                onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
        <span className="grow" />
        <select
          className="lib-input"
          value={sort}
          aria-label={t("prompts.sort")}
          onChange={(e) => setSort(e.target.value as Sort)}
        >
          <option value="newest">{t("prompts.sort.newest")}</option>
          <option value="oldest">{t("prompts.sort.oldest")}</option>
          <option value="name">{t("prompts.sort.name")}</option>
        </select>
        <ViewToggle value={view} onChange={setView} />
      </LibraryToolbar>
      <LibrarySelectionBar />
      <div className="lib-scroll">
        {loadError ? (
          <div className="lib-state">
            <span>{t("prompts.loadError")}</span>
            <button type="button" className="lib-btn" onClick={refresh}>
              {t("prompts.retry")}
            </button>
          </div>
        ) : shown.length === 0 ? (
          <div className="lib-state">
            <span>
              {items.length === 0
                ? t("prompts.emptyLibrary")
                : t("prompts.noMatches")}
            </span>
            {items.length === 0 && <small>{t("prompts.emptyHint")}</small>}
          </div>
        ) : (
          <div className={"lib-grid" + (view === "compact" ? " compact" : "")}>
            {shown.map((p) => (
              <PromptCard
                key={p.id}
                item={p}
                onEdit={() => setEditing(p)}
                onCopy={copyText}
              />
            ))}
          </div>
        )}
      </div>
      <LibraryFooter left={`${shown.length} / ${items.length}`} />
    </div>
  );
}
