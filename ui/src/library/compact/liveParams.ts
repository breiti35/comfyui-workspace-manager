import {
  calcInputListRecursive,
  type ImagePrompt,
  type PromptNodeInputItem,
} from "../../gallery/components/MetaBox/utils";

export interface LiveParams {
  model: string;
  sampler: string;
  steps: string;
  cfg: string;
  seed: string;
  size: string;
  loras: string;
  positive: string;
  negative: string;
}

const fmt = (v: unknown): string =>
  Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v);

function pick(list: PromptNodeInputItem[], ctRe: RegExp, names: string[]) {
  return list.find((i) => ctRe.test(i.classType) && names.includes(i.inputName))
    ?.inputValue;
}

/** Essentials of the current graph (same rules as the gallery's param panel). */
export function extractLiveParams(prompt: ImagePrompt): LiveParams {
  const list = calcInputListRecursive(prompt);
  const texts = list.filter(
    (i) => /cliptextencode/i.test(i.classType) && i.inputName === "text",
  );
  const pos = texts.filter((i) => i.children?.[0] === "positive");
  const neg = texts.filter((i) => i.children?.[0] === "negative");
  const samplerRe = /ksampler|sampler/i;
  const sampler = [
    pick(list, samplerRe, ["sampler_name"]),
    pick(list, samplerRe, ["scheduler"]),
  ]
    .map(fmt)
    .filter(Boolean)
    .join(" · ");
  const w = pick(list, /latent|empty/i, ["width"]);
  const h = pick(list, /latent|empty/i, ["height"]);
  return {
    model: fmt(
      pick(list, /checkpoint|unet|diffusionmodel/i, [
        "ckpt_name",
        "unet_name",
        "model_name",
      ]),
    ),
    sampler,
    steps: fmt(pick(list, samplerRe, ["steps"])),
    cfg: fmt(pick(list, samplerRe, ["cfg"])),
    seed: fmt(pick(list, samplerRe, ["seed", "noise_seed"])),
    size: w != null && h != null ? `${w} × ${h}` : "",
    loras: list
      .filter(
        (i) =>
          /lora/i.test(i.classType) &&
          /lora/i.test(i.inputName) &&
          fmt(i.inputValue) !== "" &&
          fmt(i.inputValue).toLowerCase() !== "none",
      )
      .map((i) => fmt(i.inputValue))
      .join(", "),
    positive: pos.map((i) => fmt(i.inputValue)).join("\n"),
    negative: neg.map((i) => fmt(i.inputValue)).join("\n"),
  };
}
