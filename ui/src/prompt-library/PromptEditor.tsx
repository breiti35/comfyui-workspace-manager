import { IconArrowLeft, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { useT } from "../i18n/LanguageContext";
import { LibraryHeader } from "../library/primitives";
import type { PromptRecipe } from "./promptsStore";

interface Props {
  /** null = create a new entry */
  value: PromptRecipe | null;
  onSave: (data: Omit<PromptRecipe, "id" | "createTime">) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

const splitList = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

export default function PromptEditor({
  value,
  onSave,
  onCancel,
  onDelete,
}: Props) {
  const { t } = useT();
  const [name, setName] = useState(value?.name ?? "");
  const [tags, setTags] = useState((value?.tags ?? []).join(", "));
  const [positive, setPositive] = useState(value?.positive ?? "");
  const [negative, setNegative] = useState(value?.negative ?? "");
  const [model, setModel] = useState(value?.model ?? "");
  const [loras, setLoras] = useState((value?.loras ?? []).join(", "));
  const [sampler, setSampler] = useState(value?.sampler ?? "");
  const [scheduler, setScheduler] = useState(value?.scheduler ?? "");
  const [steps, setSteps] = useState(value?.steps ?? "");
  const [cfg, setCfg] = useState(value?.cfg ?? "");
  const [seed, setSeed] = useState(value?.seed ?? "");
  const [size, setSize] = useState(value?.size ?? "");

  const submit = () => {
    onSave({
      name: name.trim() || t("prompts.untitled"),
      positive,
      negative,
      model: model.trim() || undefined,
      loras: splitList(loras),
      sampler: sampler.trim() || undefined,
      scheduler: scheduler.trim() || undefined,
      steps: String(steps).trim() || undefined,
      cfg: String(cfg).trim() || undefined,
      seed: String(seed).trim() || undefined,
      size: size.trim() || undefined,
      tags: splitList(tags),
      thumbnail: value?.thumbnail,
      updateTime: Date.now(),
    });
  };

  const field = (
    label: string,
    v: string,
    set: (s: string) => void,
    placeholder?: string,
  ) => (
    <label className="lib-field">
      <span>{label}</span>
      <input
        className="lib-input"
        value={v}
        placeholder={placeholder}
        onChange={(e) => set(e.target.value)}
      />
    </label>
  );

  const area = (
    label: string,
    v: string,
    set: (s: string) => void,
    rows: number,
  ) => (
    <label className="lib-field">
      <span>{label}</span>
      <textarea
        className="lib-input"
        rows={rows}
        value={v}
        onChange={(e) => set(e.target.value)}
      />
    </label>
  );

  return (
    <>
      <LibraryHeader
        title={value ? t("prompts.editTitle") : t("prompts.newTitle")}
        back={
          <div className="lib-crumb">
            <button
              type="button"
              className="lib-btn sm"
              onClick={onCancel}
              aria-label={t("prompts.back")}
            >
              <IconArrowLeft size={14} />
              {t("prompts.back")}
            </button>
          </div>
        }
        actions={
          <>
            {onDelete && (
              <button
                type="button"
                className="lib-btn icon"
                title={t("prompts.delete")}
                aria-label={t("prompts.delete")}
                onClick={onDelete}
              >
                <IconTrash size={16} />
              </button>
            )}
            <button type="button" className="lib-btn primary" onClick={submit}>
              {t("prompts.save")}
            </button>
          </>
        }
      />
      <div className="lib-edit">
        <div className="lib-edit-in">
          <div className="lib-fields wide">
            {field(t("prompts.field.name"), name, setName)}
            {field(
              t("prompts.field.tags"),
              tags,
              setTags,
              t("prompts.field.tagsPlaceholder"),
            )}
          </div>
          {area(t("prompts.field.positive"), positive, setPositive, 5)}
          {area(t("prompts.field.negative"), negative, setNegative, 3)}
          <h2>{t("prompts.section.recipe")}</h2>
          <div className="lib-fields narrow">
            {field(t("prompts.field.model"), model, setModel)}
            {field(
              t("prompts.field.loras"),
              loras,
              setLoras,
              t("prompts.field.tagsPlaceholder"),
            )}
            {field(t("prompts.field.sampler"), sampler, setSampler)}
            {field(t("prompts.field.scheduler"), scheduler, setScheduler)}
            {field(t("prompts.field.steps"), String(steps), setSteps)}
            {field(t("prompts.field.cfg"), String(cfg), setCfg)}
            {field(t("prompts.field.seed"), String(seed), setSeed)}
            {field(t("prompts.field.size"), size, setSize)}
          </div>
          <div className="lib-edit-foot">
            <button type="button" className="lib-btn" onClick={onCancel}>
              {t("prompts.cancel")}
            </button>
            <button type="button" className="lib-btn primary" onClick={submit}>
              {t("prompts.save")}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
