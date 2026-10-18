import { memo, useContext, useEffect, useMemo, useState } from "react";
import { Spinner } from "@chakra-ui/react";
import { IconCube } from "@tabler/icons-react";
import { useT } from "../../i18n/LanguageContext";
import { useUpdateModels } from "../../model-manager/hooks/useUpdateModels";
import type { ModelsListRespItem } from "../../model-manager/types";
import { indexdb } from "../../db-tables/indexdb";
import { userSettingsTable } from "../../db-tables/WorkspaceDB";
import type { Model } from "../../types/dbTypes";
import {
  MODELS_DB_SYNCED_EVENT,
  modelDbId,
} from "../../model-manager/syncModelsToDb";
import { isNsfwBlurEligibleCategory } from "../../utils/civitUtils";
import { NSFW_BLUR_FILTER } from "../../model-manager/components/CivitDetailShared";
import { useInView } from "../../customHooks/useInView";
import { CompactFrame, CopyButton, OpenButton, useCopied } from "./CompactParts";
import { useCompactSearch } from "./compactState";
import { OpenInLibraryContext } from "./openInLibraryContext";
import { TRIGGER_TYPES, fetchTriggerWords } from "./triggerWords";

const PAGE = 60;
const VISIBLE_WORDS = 8;
// Trigger-word carriers first: LoRAs, embeddings, checkpoints, then the rest.
const TYPE_ORDER: Record<string, number> = {
  loras: 0,
  lycoris: 0,
  embeddings: 1,
  checkpoints: 2,
};
const typeRank = (type: string) => TYPE_ORDER[type] ?? 3;

const TYPE_ABBR: Record<string, string> = {
  checkpoints: "CKPT",
  loras: "LORA",
  lycoris: "LYCO",
  vae: "VAE",
  controlnet: "CN",
  upscale_models: "UPSC",
  embeddings: "EMB",
  hypernetworks: "HYP",
  clip: "CLIP",
  clip_vision: "CLIPV",
  unet: "UNET",
  diffusion_models: "DIFF",
};

const keyOf = (m: ModelsListRespItem) => m.model_name + "@" + m.model_type;

interface RowProps {
  item: ModelsListRespItem;
  db?: Model;
  showNsfw: boolean;
  copied: string | null;
  copy: (text: string, id: string) => void;
}

const ModelRow = memo(function ModelRow({
  item,
  db,
  showNsfw,
  copied,
  copy,
}: RowProps) {
  const { t } = useT();
  const openInLibrary = useContext(OpenInLibraryContext);
  const { ref, inView } = useInView<HTMLDivElement>("200px");
  const [words, setWords] = useState<string[] | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const id = keyOf(item);
  const modelId = db?.civitModelID;
  const versionId = db?.civitModelVersionID;
  const wantsWords = TRIGGER_TYPES.has(item.model_type);

  useEffect(() => {
    if (!inView || !wantsWords || !modelId) return;
    let cancelled = false;
    fetchTriggerWords(modelId, versionId).then((w) => {
      if (!cancelled) setWords(w);
    });
    return () => {
      cancelled = true;
    };
  }, [inView, wantsWords, modelId, versionId]);

  const thumb = item.preview || db?.imageUrl || undefined;
  const blurred =
    !!thumb &&
    isNsfwBlurEligibleCategory(item.model_type) &&
    !!db?.imageIsNsfw &&
    !showNsfw &&
    !revealed;
  const name = db?.modelName || item.model_name;
  const sig = [
    TYPE_ABBR[item.model_type] ?? item.model_type.slice(0, 4).toUpperCase(),
    db?.baseModel,
    db?.versionName,
  ]
    .filter(Boolean)
    .join(" · ");
  const shown = words ? (expanded ? words : words.slice(0, VISIBLE_WORDS)) : [];

  return (
    <div className="lib-cmp-row" ref={ref}>
      <div
        className={"lib-cmp-thumb" + (blurred ? " nsfw" : "")}
        onClick={blurred ? () => setRevealed(true) : undefined}
        title={blurred ? t("compact.revealNsfw") : undefined}
      >
        {thumb ? (
          <img
            src={thumb}
            alt=""
            loading="lazy"
            style={blurred ? { filter: NSFW_BLUR_FILTER } : undefined}
          />
        ) : (
          <IconCube size={18} stroke={1.4} />
        )}
      </div>
      <div className="lib-cmp-body">
        <div className="lib-cmp-name" title={name}>
          {name}
        </div>
        <div className="lib-cmp-sig" title={sig}>
          {sig}
        </div>
        {shown.length > 0 && (
          <div className="lib-cmp-tags">
            {shown.map((w) => {
              const done = copied === id + "#" + w;
              return (
                <button
                  key={w}
                  type="button"
                  className={"lib-cmp-tag" + (done ? " done" : "")}
                  title={`${t("compact.copyWord")}: ${w}`}
                  aria-label={`${t("compact.copyWord")}: ${w}`}
                  onClick={() => copy(w, id + "#" + w)}
                >
                  {done ? t("compact.copied") : w}
                </button>
              );
            })}
            {words && words.length > VISIBLE_WORDS && (
              <button
                type="button"
                className="lib-cmp-tag more"
                aria-expanded={expanded}
                onClick={() => setExpanded(!expanded)}
              >
                {expanded
                  ? t("compact.fewer")
                  : `+${words.length - VISIBLE_WORDS}`}
              </button>
            )}
          </div>
        )}
        {words && words.length === 0 && item.model_type === "loras" && (
          <div className="lib-cmp-muted">{t("compact.noWords")}</div>
        )}
      </div>
      <div className="lib-cmp-acts">
        {words && words.length > 0 && (
          <CopyButton
            label={t("compact.copyAllWords")}
            done={copied === id}
            onClick={() => copy(words.join(", "), id)}
          />
        )}
        <OpenButton onClick={() => openInLibrary("modelList", id)} />
      </div>
    </div>
  );
});

/** Compact "Models": one row per file, trigger words copyable in the row. */
export default function ModelsView() {
  const { t } = useT();
  const { loading, error, modelsList, refresh } = useUpdateModels();
  const query = useCompactSearch("models");
  const [dbModels, setDbModels] = useState<Map<string, Model>>(new Map());
  const [dbVersion, setDbVersion] = useState(0);
  const [showNsfw, setShowNsfw] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const { copied, copy } = useCopied();

  useEffect(() => {
    const bump = () => setDbVersion((v) => v + 1);
    window.addEventListener(MODELS_DB_SYNCED_EVENT, bump);
    return () => window.removeEventListener(MODELS_DB_SYNCED_EVENT, bump);
  }, []);

  useEffect(() => {
    let cancelled = false;
    indexdb.models
      .toArray()
      .then((models) => {
        if (!cancelled) setDbModels(new Map(models.map((m) => [m.id, m])));
      })
      .catch((e) => console.error("Error reading indexdb.models:", e));
    return () => {
      cancelled = true;
    };
  }, [modelsList, dbVersion]);

  useEffect(() => {
    const read = () =>
      userSettingsTable
        ?.getSetting("showNsfwModelThumbnail")
        .then((r) => setShowNsfw(r ?? false));
    read();
    window.addEventListener("showNsfwModelThumbnail", read);
    return () => window.removeEventListener("showNsfwModelThumbnail", read);
  }, []);

  const q = query.trim().toLowerCase();
  useEffect(() => setLimit(PAGE), [q]);

  const list = useMemo(() => {
    const rows = modelsList
      .map((m) => ({ m, db: dbModels.get(modelDbId(m)) }))
      .filter(
        ({ m, db }) =>
          !q ||
          [m.model_name, db?.modelName, db?.baseModel]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q)),
      );
    rows.sort(
      (a, b) =>
        typeRank(a.m.model_type) - typeRank(b.m.model_type) ||
        a.m.model_name.localeCompare(b.m.model_name),
    );
    return rows;
  }, [modelsList, dbModels, q]);

  return (
    <CompactFrame
      section="models"
      title={t("compact.nav.models")}
      count={`${list.length}`}
      searchPlaceholder={t("compact.search.models")}
      restoreWhen={!loading}
    >
      {loading && (
        <div className="lib-cmp-empty">
          <Spinner />
        </div>
      )}
      {!loading && error && (
        <div className="lib-cmp-empty">
          <span>{t("models.list.loadError")}</span>
          <button type="button" className="lib-btn" onClick={refresh}>
            {t("models.list.retry")}
          </button>
        </div>
      )}
      {!loading && !error && list.length === 0 && (
        <div className="lib-cmp-empty">{t("compact.empty.models")}</div>
      )}
      {list.slice(0, limit).map(({ m, db }) => (
        <ModelRow
          key={keyOf(m)}
          item={m}
          db={db}
          showNsfw={showNsfw}
          copied={copied}
          copy={copy}
        />
      ))}
      {list.length > limit && (
        <div className="lib-cmp-more">
          <button
            type="button"
            className="lib-btn"
            onClick={() => setLimit(limit + PAGE)}
          >
            {t("compact.loadMore")}
          </button>
        </div>
      )}
    </CompactFrame>
  );
}
