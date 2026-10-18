import { IconEye, IconEyeOff } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { userSettingsTable } from "../../db-tables/WorkspaceDB";
import { useT } from "../../i18n/LanguageContext";

/**
 * On-the-spot NSFW preview toggle. One click flips ONLY
 * `showNsfwModelThumbnail` (blur vs. reveal of NSFW thumbnails) and fires the
 * `showNsfwModelThumbnail` event so the Models and Install cards re-read the
 * blur live - no trip to the Settings panel needed. Whether adult (18+) models
 * are fetched at all (`civitaiIncludeAdultContent`, civitai.red vs .com) is a
 * separate, set-once preference owned by the Settings panel.
 */
export default function NsfwToggleButton() {
  const { t } = useT();
  // checked = NSFW previews shown (unblurred). Off = blurred.
  const [checked, setChecked] = useState(false);

  const read = () => {
    userSettingsTable?.getSetting("showNsfwModelThumbnail").then((res) => {
      setChecked(res ?? false);
    });
  };

  useEffect(() => {
    read();
    // Keep in sync if another surface (Settings panel, other toolbar) flips it.
    window.addEventListener("showNsfwModelThumbnail", read);
    return () => window.removeEventListener("showNsfwModelThumbnail", read);
  }, []);

  const toggle = () => {
    const next = !checked;
    userSettingsTable
      ?.upsert({ showNsfwModelThumbnail: next })
      .then(() => {
        setChecked(next);
        window.dispatchEvent(new Event("showNsfwModelThumbnail"));
      });
  };

  return (
    <button
      type="button"
      className="lib-btn"
      aria-pressed={checked}
      title={
        checked ? t("models.nsfw.blurTooltip") : t("models.nsfw.showTooltip")
      }
      onClick={toggle}
    >
      {checked ? <IconEye size={14} /> : <IconEyeOff size={14} />}
      NSFW
    </button>
  );
}
