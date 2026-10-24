import { copyWithToast } from "../../utils/copyToClipboard";
import { Spinner, useToast } from "@chakra-ui/react";
import { ModelsListRespItem } from "../types";
import { useEffect, useRef, useState } from "react";
import { indexdb } from "../../db-tables/indexdb";
import { Model } from "../../types/dbTypes";
import type { DragEvent, MouseEvent as ReactMouseEvent } from "react";
import {
  IconCube,
  IconCopy,
  IconStar,
  IconStarFilled,
  IconWorld,
} from "@tabler/icons-react";
import {
  fetchCivArchiveByHash,
  fetchCivitModelFromHashKey,
  getCivitModelPageUrl,
  isNsfwBlurEligibleCategory,
} from "../../utils/civitUtils";
import { userSettingsTable } from "../../db-tables/WorkspaceDB";
import { useInView } from "../../customHooks/useInView";
import { isModelFavorite, toggleModelFavorite } from "./modelFavorites";
import { useT } from "../../i18n/LanguageContext";
import { NSFW_BLUR_FILTER } from "../components/CivitDetailShared";


interface Props {
  data: ModelsListRespItem;
  onOpenDetail: (data: ModelsListRespItem) => void;
}

const MODEL_TYPE_TO_NODE_MAPPING: Record<string, string> = {
  checkpoints: "CheckpointLoaderSimple",
  vae: "VAELoader",
  loras: "LoraLoader",
  controlnet: "ControlNetLoader",
  upscale_models: "UpscaleModelLoader",
};

// Short type badge (like the reference's "CKPT").
const TYPE_ABBR: Record<string, string> = {
  checkpoints: "CKPT",
  loras: "LORA",
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

export function ModelItem({ data, onOpenDetail }: Props) {
  const { t } = useT();
  const { ref, inView } = useInView<HTMLDivElement>("400px");
  const [url, setUrl] = useState<string>();
  const [isNsfw, setIsNsfw] = useState(false);
  const [showNsfw, setShowNsfw] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [hashing, setHashing] = useState(!data.file_hash);
  // true once getThumbnail() has finished for the current file - with no url
  // by then, the card shows a placeholder instead of an endless spinner.
  const [thumbDone, setThumbDone] = useState(false);
  // Bumped per getThumbnail() run; a run that's no longer the latest (hash
  // changed, card unmounted) doesn't touch state anymore.
  const thumbRunRef = useRef(0);
  const [model, setModel] = useState<Model>();
  const [isFav, setIsFav] = useState(false);
  const toast = useToast();

  useEffect(() => {
    setIsFav(isModelFavorite(data.model_name + "@" + data.model_type));
  }, [data.model_name, data.model_type]);

  // Defer the (possibly networked) thumbnail lookup until the card is near the
  // viewport, so a large grid doesn't hammer indexdb + Civitai up front.
  useEffect(() => {
    if (!inView) return;
    setHashing(!data.file_hash);
    setThumbDone(false);
    const run = ++thumbRunRef.current;
    const isCurrent = () => run === thumbRunRef.current;
    getThumbnail(isCurrent)
      .catch((e) => console.error("Error loading model thumbnail:", e))
      .finally(() => {
        if (isCurrent()) setThumbDone(true);
      });
    return () => {
      thumbRunRef.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, data.file_hash]);

  useEffect(() => {
    const updateShowNsfw = () => {
      userSettingsTable?.getSetting("showNsfwModelThumbnail").then((res) => {
        setShowNsfw(res ?? false);
      });
    };
    updateShowNsfw();
    window.addEventListener("showNsfwModelThumbnail", updateShowNsfw);
    return () => {
      window.removeEventListener("showNsfwModelThumbnail", updateShowNsfw);
    };
  }, []);

  const getThumbnail = async (isCurrent: () => boolean) => {
    const nsfwEligible = isNsfwBlurEligibleCategory(data.model_type);
    const id = data.model_name + "@" + data.model_type;
    let resolvedUrl: string | undefined;
    const m = await indexdb.models.get(id);
    if (!isCurrent()) return;
    if (m != null) {
      setModel(m);
      if (m.imageUrl?.length) resolvedUrl = m.imageUrl;
      setIsNsfw(nsfwEligible && (m.imageIsNsfw ?? false));
    }
    if (!resolvedUrl && data.file_hash != null) {
      try {
        const json = await fetchCivitModelFromHashKey(data.file_hash);
        if (!isCurrent()) return;
        const image_url = json.imageUrl;
        if (image_url) resolvedUrl = image_url;
        const imageIsNsfw = nsfwEligible && (json.imageIsNsfw ?? false);
        setIsNsfw(imageIsNsfw);

        // A transient lookup (rate limit / network) carries no data - don't
        // overwrite the record with empty Civitai fields.
        if (!json.transient) {
          const civitFields: Partial<Model> = {
            fileHash: data.file_hash,
            fileFolder: data.model_type,
            fileName: data.model_name + data.model_extension,
            modelName: json.modelName ?? null,
            versionName: json.versionName,
            baseModel: json.baseModel,
            civitModelID: json.civitModelID,
            civitModelVersionID: json.civitModelVersionID,
            imageUrl: image_url ?? null,
            imageIsNsfw,
          };
          // Merge into the stored record (it may carry e.g. downloadUrl,
          // or have been refreshed by a sync meanwhile) instead of replacing.
          const merged = await indexdb.transaction(
            "rw",
            indexdb.models,
            async () => {
              const current = await indexdb.models.get(id);
              const next: Model = { ...current, ...civitFields, id } as Model;
              await indexdb.models.put(next);
              return next;
            },
          );
          if (isCurrent()) setModel(merged);
        }
      } catch (e) {
        console.error("Error updating model record:", e);
      }
    }
    if (!isCurrent()) return;
    // A user's own local preview file beats a remote thumbnail.
    if (data.preview) resolvedUrl = data.preview;
    // Last resort: models Civitai doesn't know (deleted, or mirrored from
    // another platform) - fill the card from CivArchive's SHA256 mirror.
    if (!resolvedUrl && data.file_hash != null) {
      try {
        const arch = await fetchCivArchiveByHash(data.file_hash);
        if (arch.imageUrl) resolvedUrl = arch.imageUrl;
      } catch (e) {}
    }
    if (resolvedUrl && isCurrent()) setUrl(resolvedUrl);
  };

  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
    const nodeType = MODEL_TYPE_TO_NODE_MAPPING[data.model_type];
    if (!nodeType) return;
    e.dataTransfer.setData("eventName", "WorkspaceManagerAddNode");
    e.dataTransfer.setData(
      "modelRelativePath",
      data.model_name + data.model_extension,
    );
    e.dataTransfer.setData("nodeType", nodeType);
  };

  const openCivit = async (e: ReactMouseEvent) => {
    e.stopPropagation();
    if (!model?.civitModelID) return;
    const win = window.open();
    if (win) {
      win.location.href = await getCivitModelPageUrl(
        model.civitModelID,
        model.civitModelVersionID,
      );
    }
  };

  const copyName = (e: ReactMouseEvent) => {
    e.stopPropagation();
    void copyWithToast(
      toast,
      data.model_name + data.model_extension,
      `${t("models.item.filenameLabel")} ${t("models.copiedSuffix")}`,
      t("common.copyFailed"),
    );
  };

  const toggleFav = (e: ReactMouseEvent) => {
    e.stopPropagation();
    setIsFav(toggleModelFavorite(data.model_name + "@" + data.model_type));
  };

  const versionChip = model?.versionName ?? undefined;
  const typeBadge =
    TYPE_ABBR[data.model_type] ?? data.model_type.slice(0, 4).toUpperCase();
  const signature = [typeBadge, model?.baseModel].filter(Boolean).join(" · ");
  const blurred = isNsfw && !showNsfw && !revealed;

  const meta = versionChip ?? "";

  return (
    <div
      ref={ref}
      className="lib-card"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onOpenDetail(data);
        }
      }}
      draggable
      onDragStart={handleDragStart}
      onClick={() => onOpenDetail(data)}
      style={{ cursor: "pointer" }}
    >
      <div className="lib-sig" title={signature}>
        {signature}
      </div>
      <div className="lib-name" title={data.model_name + data.model_extension}>
        {data.model_name}
      </div>
      <div className="lib-pv">
        {!url && (hashing || (inView && !thumbDone)) ? (
          <div className="ph">
            <Spinner size="sm" />
          </div>
        ) : !url && thumbDone ? (
          // Nothing found anywhere (no Civitai/CivArchive hit, no local
          // preview): a type placeholder instead of an endless spinner.
          <div className="ph">
            <IconCube size={36} stroke={1.2} />
            {typeBadge}
          </div>
        ) : url ? (
          <img
            src={url}
            loading="lazy"
            draggable={false}
            alt=""
            style={{ filter: blurred ? NSFW_BLUR_FILTER : undefined }}
          />
        ) : null}

        {isFav && (
          <span className="stars">
            <IconStarFilled size={13} />
          </span>
        )}
        <div className="acts">
          <button
            type="button"
            className={"lib-btn" + (isFav ? " fav" : "")}
            title={
              isFav
                ? t("models.item.favoriteTooltipOn")
                : t("models.item.favoriteTooltipOff")
            }
            aria-label={t("models.item.favoriteAria")}
            onClick={toggleFav}
          >
            {isFav ? <IconStarFilled size={13} /> : <IconStar size={13} />}
          </button>
          {model?.civitModelID && (
            <button
              type="button"
              className="lib-btn"
              title={t("models.openOnCivitai")}
              aria-label={t("models.item.openCivitaiAria")}
              onClick={openCivit}
            >
              <IconWorld size={13} />
            </button>
          )}
          <button
            type="button"
            className="lib-btn"
            title={t("models.item.copyFilenameTooltip")}
            aria-label={t("models.item.copyFilenameAria")}
            onClick={copyName}
          >
            <IconCopy size={13} />
          </button>
        </div>

        {/* NSFW reveal (per-card) */}
        {blurred && (
          <div className="ov">
            <span>{t("models.item.nsfwLabel")}</span>
            <button
              type="button"
              className="lib-btn"
              onClick={(e) => {
                e.stopPropagation();
                setRevealed(true);
              }}
            >
              {t("models.item.reveal")}
            </button>
          </div>
        )}
      </div>
      <div className="lib-meta">{meta || " "}</div>
    </div>
  );
}
