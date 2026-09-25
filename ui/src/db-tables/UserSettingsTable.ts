import type { UserSettings } from "../types/dbTypes";
import { TableBase } from "./TableBase";
import { MODEL_TYPE_TO_FOLDER_MAPPING } from "../model-manager/install-models/util/modelTypes";
import { fetchApi, fetchMyWorkflowsDir } from "../Api";

export class UserSettingsTable extends TableBase<UserSettings> {
  public defaultSettings: UserSettings;
  public readonly DEFAULT_USER = "guest";
  static readonly TABLE_NAME = "userSettings";

  private _settings: UserSettings | undefined = undefined;

  get settings() {
    return this._settings;
  }

  constructor() {
    super("userSettings");
    this.defaultSettings = {
      id: this.DEFAULT_USER,
      topBarStyle: {
        top: 0,
        left: 0,
      },
      myWorkflowsDir: "",
      shortcuts: {
        save: "Shift+S",
        saveAs: "Control+Alt+S",
        openSpotlightSearch: "Control+P",
      },
      defaultFolders: MODEL_TYPE_TO_FOLDER_MAPPING,
      autoSave: false,
      autoSaveDuration: 3,
      twoWaySync: false,
      foldersOnTop: false,
      maximumChangelogNumber: 80,
      hideCoverImage: false,
      disableUnsavedWarning: false,
    };
  }

  /**
   * In-memory copy of what the server's db/settings.json holds (raw, without
   * defaults merged in). getSetting() reads from here instead of doing a
   * get_settings round-trip per call - on the RunPod proxy every call costs
   * ~300ms and getSetting() is hit from many places (twoWaySync checks on
   * every workflow write, per-card NSFW checks, ...). Refreshed on upsert and
   * via refresh(). undefined = never loaded successfully.
   */
  private _raw: UserSettings | undefined = undefined;
  /**
   * Changes whose upsert is still in flight. Layered on top of _raw by
   * getSetting(), so a toggle (e.g. Civitai adult content, API key) takes
   * effect immediately instead of ~one round-trip later.
   */
  private _pending: Partial<UserSettings>[] = [];
  /** Throttles getSetting()'s retry when the startup load failed. */
  private _lastRefreshAttempt = 0;
  /** upserts run one after another - see upsert(). */
  private _queue: Promise<unknown> = Promise.resolve();

  private setRaw(raw: UserSettings | undefined) {
    this._raw = raw;
    this._settings = {
      ...this.defaultSettings,
      ...(raw ?? {}),
    };
  }

  private current(): Partial<UserSettings> | undefined {
    if (!this._raw && this._pending.length === 0) return undefined;
    return Object.assign({}, this._raw ?? {}, ...this._pending);
  }

  public async getSetting<K extends keyof UserSettings>(
    key: K,
  ): Promise<UserSettings[K]> {
    if (!this._raw && Date.now() - this._lastRefreshAttempt > 10_000) {
      // Startup load failed - retry (at most every 10s) instead of serving
      // defaults forever or hammering an unreachable server per call.
      this._lastRefreshAttempt = Date.now();
      await this.refresh().catch(() => undefined);
    }
    const currentUserSettings = this.current();
    if (key === "shortcuts" && currentUserSettings?.shortcuts) {
      return {
        ...this.defaultSettings.shortcuts,
        ...currentUserSettings.shortcuts,
      } as UserSettings[K];
    }
    return (currentUserSettings?.[key] ??
      this.defaultSettings[key]) as UserSettings[K];
  }

  /** Always hits the server (no cache). Throws on network/HTTP errors. */
  public async get(_id: string): Promise<UserSettings | undefined> {
    const res = await fetchApi("/workspace/get_settings", {
      headers: {
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) {
      throw new Error(`get_settings failed: HTTP ${res.status}`);
    }
    const obj = await res.json();
    return (obj ?? undefined) as any;
  }

  /**
   * Re-reads the settings from the server into the cache (e.g. when the
   * settings panel opens, to pick up changes made in another tab).
   */
  public async refresh(): Promise<UserSettings | undefined> {
    const raw = await this.get(this.DEFAULT_USER);
    this.setRaw(raw ?? ({} as UserSettings));
    return raw;
  }

  /**
   * Merges `newPairs` into the stored settings. Serialized: two quick toggles
   * would otherwise both read the same old state and the second write would
   * drop the first change. Throws when the write fails; the cache is only
   * updated after the server confirmed the write.
   */
  public upsert(newPairs: Partial<UserSettings>): Promise<void> {
    this._pending.push(newPairs);
    const task = async () => {
      try {
        // Re-read the latest server state as base (another tab may have
        // changed something). If that read fails, fall back to the cache -
        // but never to bare defaults: writing defaults + one key would wipe
        // every other setting (API key, folders, shortcuts ...).
        let base: UserSettings | undefined;
        try {
          base = (await this.get(this.DEFAULT_USER)) ?? this.defaultSettings;
        } catch (e) {
          if (!this._raw) throw e;
          base = this._raw;
        }
        const newSettings = {
          ...base,
          ...newPairs,
        };
        const res = await fetchApi("/workspace/save_settings", {
          method: "POST",
          body: JSON.stringify(newSettings),
          headers: {
            "Content-Type": "application/json",
          },
        });
        if (!res.ok) {
          throw new Error(`save_settings failed: HTTP ${res.status}`);
        }
        this.setRaw(newSettings);
      } finally {
        const i = this._pending.indexOf(newPairs);
        if (i >= 0) this._pending.splice(i, 1);
      }
    };
    const run = this._queue.then(task, task);
    this._queue = run.catch(() => undefined);
    return run;
  }

  static async load(): Promise<UserSettingsTable> {
    const instance = new UserSettingsTable();
    const myWorkflowsDir = await fetchMyWorkflowsDir();

    instance.defaultSettings.myWorkflowsDir = myWorkflowsDir.path!;

    try {
      await instance.refresh();
    } catch (e) {
      // Keep _raw undefined so getSetting() retries later; the synchronous
      // `settings` getter still gets defaults meanwhile.
      console.error("Error loading user settings:", e);
      instance._settings = { ...instance.defaultSettings };
    }
    return instance;
  }
}
