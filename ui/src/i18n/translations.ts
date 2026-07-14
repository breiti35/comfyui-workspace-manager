// Lightweight i18n for the workspace manager. Add keys here as more surfaces
// are translated; English is the fallback for any missing key. Coverage grows
// incrementally - untranslated corners keep their original (English) strings.
export type Lang = "de" | "en";

const en = {
  "settings.title": "Settings",
  "settings.language": "Language",
  "settings.language.help": "Language of the workspace-manager interface.",

  "settings.group.civitai": "Civitai",
  "settings.group.storage": "Storage & Sync",
  "settings.group.display": "Display",
  "settings.group.saving": "Saving",
  "settings.group.shortcuts": "Shortcuts",
  "settings.group.advanced": "Advanced",

  "settings.adult.label": "Show adult content (18+)",
  "settings.adult.help":
    "Uses civitai.red instead of civitai.com for search, hash lookup, downloads and links, so NSFW models can be found and installed.",
  "settings.nsfwPreview.label": "Show NSFW preview",
  "settings.nsfwPreview.help":
    "Off = NSFW preview images are blurred (click to reveal). Only effective when adult content is on.",

  "settings.foldersOnTop": "Folders always on top",
  "settings.hideThumbnails": "Hide thumbnails in the workflow list",

  "settings.maxChangelog": "Max. stored change history",
  "settings.disableUnsavedWarning": "Disable 'save/discard' warning",
  "settings.disableUnsavedWarning.warning":
    "Careful: without this warning, unsaved changes are lost when a workflow is closed.",

  "apikey.title": "Civitai API key",
  "apikey.help": "Some Civitai models require an API key (login) to download.",
  "apikey.placeholder": "Paste API key",
  "apikey.save": "Save",
  "apikey.saved": "Saved ✓",
  "apikey.delete": "Delete",

  "workflowsDir.label": "My Workflows save directory",
  "workflowsDir.choose": "Choose folder",
  "workflowsDir.enterPath": "Enter absolute path",
  "workflowsDir.needSync": "Enable two-way sync to link a local folder",

  "shortcuts.header": "Keyboard shortcut",
  "shortcuts.save": "Save current workflow",
  "shortcuts.saveAs": "Save as new workflow",
  "shortcuts.spotlight": "Open spotlight search",
  "shortcuts.placeholder": "Press a key combination",
  "shortcuts.hint": "Press shortcut key combinations to set up",
} as const;

export type TransKey = keyof typeof en;

const de: Record<TransKey, string> = {
  "settings.title": "Einstellungen",
  "settings.language": "Sprache",
  "settings.language.help": "Sprache der Workspace-Manager-Oberfläche.",

  "settings.group.civitai": "Civitai",
  "settings.group.storage": "Speicher & Sync",
  "settings.group.display": "Anzeige",
  "settings.group.saving": "Speichern",
  "settings.group.shortcuts": "Tastenkürzel",
  "settings.group.advanced": "Erweitert",

  "settings.adult.label": "Adult-Inhalte (18+) anzeigen",
  "settings.adult.help":
    "Nutzt civitai.red statt civitai.com für Suche, Hash-Lookup, Downloads und Links, sodass NSFW-Modelle gefunden und installiert werden können.",
  "settings.nsfwPreview.label": "NSFW-Vorschau anzeigen",
  "settings.nsfwPreview.help":
    "Aus = NSFW-Vorschaubilder werden verblurrt (per Klick aufdecken). Nur wirksam, wenn Adult-Inhalte an sind.",

  "settings.foldersOnTop": "Ordner immer oben",
  "settings.hideThumbnails": "Thumbnails in der Workflow-Liste ausblenden",

  "settings.maxChangelog": "Max. gespeicherte Änderungs-Historie",
  "settings.disableUnsavedWarning": "‚Speichern/Verwerfen'-Warnung deaktivieren",
  "settings.disableUnsavedWarning.warning":
    "Vorsicht: Ohne diese Warnung gehen ungespeicherte Änderungen beim Schließen eines Workflows verloren.",

  "apikey.title": "Civitai API-Key",
  "apikey.help":
    "Manche Civitai-Modelle erfordern zum Download einen API-Key (Login).",
  "apikey.placeholder": "API-Key einfügen",
  "apikey.save": "Speichern",
  "apikey.saved": "Gespeichert ✓",
  "apikey.delete": "Löschen",

  "workflowsDir.label": "Speicherordner für ‚My Workflows'",
  "workflowsDir.choose": "Ordner wählen",
  "workflowsDir.enterPath": "Absoluten Pfad eingeben",
  "workflowsDir.needSync":
    "Zwei-Wege-Sync aktivieren, um einen lokalen Ordner zu verknüpfen",

  "shortcuts.header": "Tastenkürzel",
  "shortcuts.save": "Aktuellen Workflow speichern",
  "shortcuts.saveAs": "Als neuen Workflow speichern",
  "shortcuts.spotlight": "Spotlight-Suche öffnen",
  "shortcuts.placeholder": "Tastenkombination drücken",
  "shortcuts.hint": "Tastenkombination drücken zum Festlegen",
};

export const translations: Record<Lang, Record<TransKey, string>> = { en, de };
