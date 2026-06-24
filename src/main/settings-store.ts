import fs from "fs";
import path from "path";
import os from "os";
import type { LensSettings } from "../shared/types";

const STORE_PATH = path.join(os.homedir(), ".lens", "settings.json");

const DEFAULTS: LensSettings = {
  opacity: 1.0,
  alwaysOnTop: true,
  showUnderglow: false,
  layout: "us",
  layerNames: [],
  overlayMode: false,
  overlayAutoShow: true,
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function sanitize(s: Partial<LensSettings>): LensSettings {
  return {
    opacity: clamp(typeof s.opacity === "number" ? s.opacity : DEFAULTS.opacity, 0.1, 1.0),
    alwaysOnTop: typeof s.alwaysOnTop === "boolean" ? s.alwaysOnTop : DEFAULTS.alwaysOnTop,
    showUnderglow: typeof s.showUnderglow === "boolean" ? s.showUnderglow : DEFAULTS.showUnderglow,
    layout: typeof s.layout === "string" ? s.layout : DEFAULTS.layout,
    layerNames: Array.isArray(s.layerNames) ? s.layerNames : DEFAULTS.layerNames,
    overlayMode: typeof s.overlayMode === "boolean" ? s.overlayMode : DEFAULTS.overlayMode,
    overlayAutoShow: typeof s.overlayAutoShow === "boolean" ? s.overlayAutoShow : DEFAULTS.overlayAutoShow,
  };
}

export class SettingsStore {
  private data: LensSettings;

  constructor() {
    this.data = this.load();
  }

  private load(): LensSettings {
    try {
      const raw = fs.readFileSync(STORE_PATH, "utf-8");
      return sanitize(JSON.parse(raw));
    } catch {
      return { ...DEFAULTS };
    }
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
      fs.writeFileSync(STORE_PATH, JSON.stringify(this.data, null, 2));
    } catch {
      // ignore save errors
    }
  }

  get(): LensSettings {
    return { ...this.data };
  }

  set(updates: Partial<LensSettings>): LensSettings {
    this.data = sanitize({ ...this.data, ...updates });
    this.save();
    return this.get();
  }
}
