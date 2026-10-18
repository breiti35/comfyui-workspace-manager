import { useEffect, useState } from "react";
import { ShortcutSettings } from "../settings/ShortcutSettings";
import TwoWaySyncSettings from "../settings/TwoWaySyncSettings";
import CommonToggleSetting from "../settings/CommonToggleSetting";
import CivitaiApiKeySetting from "../settings/CivitaiApiKeySetting";
import SelectMyWorkflowsDir from "../settings/SelectMyWorkflowsDir";
import { CommonNumberSetting } from "../settings/CommonNumberSetting";
import SettingsSection from "../settings/SettingsSection";
import DockSectionsSetting from "../settings/DockSectionsSetting";
import LanguageSetting from "../settings/LanguageSetting";
import { userSettingsTable } from "../db-tables/WorkspaceDB";
import { useT } from "../i18n/LanguageContext";
import { LibraryHeader } from "../library/primitives";

export default function WorkspaceSettingsModal(_props: {
  onClose?: () => void;
}) {
  const { t } = useT();
  // Adult host state drives whether the NSFW-blur toggle is meaningful.
  const [adultOn, setAdultOn] = useState(false);
  const [advOpen, setAdvOpen] = useState(false);
  useEffect(() => {
    // Settings are cached in memory (see UserSettingsTable); re-read them
    // once when the panel opens so changes from another tab show up.
    (userSettingsTable?.refresh() ?? Promise.resolve())
      .catch(() => undefined)
      .then(() => userSettingsTable?.getSetting("civitaiIncludeAdultContent"))
      .then((r) => setAdultOn(!!r));
  }, []);

  return (
    <div className="lib-section">
      <LibraryHeader title={t("settings.title")} />
      <div className="lib-scroll">
        <div className="lib-settings">
          <div className="lib-settings-grid">
            <SettingsSection title={t("settings.language")}>
              <LanguageSetting />
            </SettingsSection>

            <SettingsSection title={t("settings.group.civitai")}>
              <CommonToggleSetting
                settingKey={"civitaiIncludeAdultContent"}
                label={t("settings.adult.label")}
                helpText={t("settings.adult.help")}
                onAfterChange={(v) => {
                  setAdultOn(v);
                  window.dispatchEvent(new Event("civitaiIncludeAdultContent"));
                }}
              />
              <CommonToggleSetting
                settingKey={"showNsfwModelThumbnail"}
                label={t("settings.nsfwPreview.label")}
                helpText={t("settings.nsfwPreview.help")}
                isDisabled={!adultOn}
                onAfterChange={() =>
                  window.dispatchEvent(new Event("showNsfwModelThumbnail"))
                }
              />
              <CivitaiApiKeySetting />
            </SettingsSection>

            <SettingsSection title={t("settings.group.storage")}>
              <SelectMyWorkflowsDir />
            </SettingsSection>

            <SettingsSection title={t("settings.group.display")}>
              <CommonToggleSetting
                settingKey={"foldersOnTop"}
                label={t("settings.foldersOnTop")}
              />
              <CommonToggleSetting
                settingKey={"hideCoverImage"}
                label={t("settings.hideThumbnails")}
              />
            </SettingsSection>

            <SettingsSection title={t("settings.group.dock")}>
              <DockSectionsSetting />
            </SettingsSection>

            <SettingsSection title={t("settings.group.saving")}>
              <CommonNumberSetting
                label={t("settings.maxChangelog")}
                settingKey={"maximumChangelogNumber"}
              />
              <CommonToggleSetting
                settingKey={"disableUnsavedWarning"}
                label={t("settings.disableUnsavedWarning")}
                warning={t("settings.disableUnsavedWarning.warning")}
              />
            </SettingsSection>

            <SettingsSection wide title={t("settings.group.shortcuts")}>
              <ShortcutSettings />
            </SettingsSection>

            <section className="lib-set-card wide">
              <button
                type="button"
                className="lib-set-title"
                aria-expanded={advOpen}
                onClick={() => setAdvOpen((v) => !v)}
              >
                {t("settings.group.advanced")}
                <span className="caret" aria-hidden>
                  {advOpen ? "▲" : "▼"}
                </span>
              </button>
              {advOpen && (
                <div className="lib-set-body">
                  <TwoWaySyncSettings />
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
