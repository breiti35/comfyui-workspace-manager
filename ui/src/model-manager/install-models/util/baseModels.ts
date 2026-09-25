// Civitai base models for the Install panel's filter.
//
// The live list comes from Civitai's /api/v1/enums (`ActiveBaseModel`, see
// fetchBaseModels.ts), so new families (MiniMax H3, Krea 2, ...) show up
// without a plugin update. FALLBACK_BASE_MODELS is only used when that call
// fails; it is a snapshot of `ActiveBaseModel` from September 2026.
//
// Keys must match Civitai's `baseModels` values 1:1 - anything else returns
// an empty result instead of an error.

export interface BaseModelOption {
  key: string;
  label: string;
}

export const FALLBACK_BASE_MODELS: string[] = [
  "Anima",
  "AuraFlow",
  "Chroma",
  "CogVideoX",
  "Ernie",
  "Flux.1 S",
  "Flux.1 D",
  "Flux.1 Krea",
  "Flux.1 Kontext",
  "Flux.2 D",
  "Flux.2 Klein 9B",
  "Flux.2 Klein 9B-base",
  "Flux.2 Klein 4B",
  "Flux.2 Klein 4B-base",
  "Flux 3 Video",
  "HiDream",
  "HiDream-O1",
  "Hunyuan 1",
  "Hunyuan Video",
  "Illustrious",
  "Kolors",
  "Krea 2",
  "LTXV",
  "LTXV2",
  "LTXV 2.3",
  "LTXV 2.5",
  "Lumina",
  "MiniMax H3",
  "Mochi",
  "NoobAI",
  "PixArt a",
  "PixArt E",
  "Pony",
  "Pony V7",
  "Qwen",
  "Qwen 2",
  "Qwen 2.1",
  "Qwen 3",
  "SD 1.4",
  "SD 1.5",
  "SD 1.5 LCM",
  "SD 1.5 Hyper",
  "SD 2.0",
  "SD 2.1",
  "SDXL 1.0",
  "SDXL Lightning",
  "SDXL Hyper",
  "Wan Video 1.3B t2v",
  "Wan Video 14B t2v",
  "Wan Video 14B i2v 480p",
  "Wan Video 14B i2v 720p",
  "Wan Video 2.2 TI2V-5B",
  "Wan Video 2.2 I2V-A14B",
  "Wan Video 2.2 T2V-A14B",
  "Wan Video 2.5 T2V",
  "Wan Video 2.5 I2V",
  "Wan Image 2.7",
  "Wan Video 2.7",
  "Wan Video 3.0",
  "ZImageTurbo",
  "ZImageBase",
  "ACE Audio",
  "Upscaler",
  "Other",
];

// Civitai's internal spellings that read badly in a menu. Everything else is
// shown as-is, so the label always matches what Civitai shows on its site.
const LABEL_OVERRIDES: Record<string, string> = {
  "PixArt a": "PixArt α",
  "PixArt E": "PixArt Σ",
  "Hunyuan 1": "Hunyuan DiT",
  ZImageTurbo: "Z-Image Turbo",
  ZImageBase: "Z-Image Base",
};

export function baseModelLabel(key: string): string {
  return LABEL_OVERRIDES[key] ?? key;
}

/** Deduplicated, sorted options (case-insensitive, numbers in natural order). */
export function toBaseModelOptions(keys: readonly unknown[]): BaseModelOption[] {
  const seen = new Set<string>();
  const out: BaseModelOption[] = [];
  for (const k of keys) {
    if (typeof k !== "string") continue;
    const key = k.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, label: baseModelLabel(key) });
  }
  return out.sort((a, b) =>
    a.label.localeCompare(b.label, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );
}

// Lowercase and drop everything but letters/digits, so "wan 2.2", "Wan2.2"
// and "wan-2-2" all find "Wan Video 2.2 ...", and "zimage" finds "Z-Image".
function squash(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/**
 * Filter for the search box: every whitespace-separated word of the query
 * must appear in the key or the label.
 */
export function filterBaseModels(
  options: BaseModelOption[],
  query: string,
): BaseModelOption[] {
  const words = query.split(/\s+/).map(squash).filter(Boolean);
  if (!words.length) return options;
  return options.filter((o) => {
    const hay = squash(o.key) + " " + squash(o.label);
    return words.every((w) => hay.includes(w));
  });
}
