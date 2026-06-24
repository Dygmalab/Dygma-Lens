import fs from "fs";
import path from "path";
import { globSync } from "glob";
import type { KeyboardModel, LensConfig } from "../shared/types";
import { SONSEI_KEYS_PER_LAYER, SONSEI_COLOR_LAYER_SIZE } from "../shared/constants";
import { parseKeymap, parsePaletteRGB, parseColormap, parseSuperkeys } from "./parsers";

interface BazecorBackup {
  neuronID: string;
  backup: { command: string; data: string }[];
}

function getCommandData(backup: BazecorBackup, command: string): string {
  return backup.backup.find((e) => e.command === command)?.data ?? "";
}

function keysPerLayer(product: string): number {
  switch (product.toLowerCase()) {
    case "sonsei":
      return SONSEI_KEYS_PER_LAYER;
    default:
      return SONSEI_KEYS_PER_LAYER;
  }
}

function colorLayerSize(product: string): number {
  switch (product.toLowerCase()) {
    case "sonsei":
      return SONSEI_COLOR_LAYER_SIZE;
    default:
      return SONSEI_COLOR_LAYER_SIZE;
  }
}

export function parseBackupToModel(backupRaw: string, product: string): KeyboardModel {
  const backup = JSON.parse(backupRaw) as BazecorBackup;
  const kpl = keysPerLayer(product);
  const cls = colorLayerSize(product);

  const keymapRaw = getCommandData(backup, "keymap.custom");
  const paletteRaw = getCommandData(backup, "palette");
  const colormapRaw = getCommandData(backup, "colormap.map");
  const defaultLayerRaw = getCommandData(backup, "settings.defaultLayer");
  const superkeysRaw = getCommandData(backup, "superkeys.map");

  return {
    keymap: parseKeymap(keymapRaw, kpl),
    palette: parsePaletteRGB(paletteRaw),
    colormap: parseColormap(colormapRaw, cls),
    defaultLayer: parseInt(defaultLayerRaw.trim() || "0", 10),
    superkeys: parseSuperkeys(superkeysRaw),
  };
}

export function findLatestBackup(config: LensConfig): string | null {
  const { backupFolder, neuronID, product } = config.keyboard;
  const folderPath = path.join(backupFolder, product, neuronID);
  if (!fs.existsSync(folderPath)) return null;

  let pattern: string;
  if (process.platform === "win32") {
    pattern = `${folderPath.replace(/\\/g, "/")}/*.json`;
  } else {
    pattern = `${folderPath}/*.json`;
  }

  const files = globSync(pattern);
  if (files.length === 0) return null;

  const sorted = files
    .map((f) => ({ f, mtime: fs.statSync(f).mtime.getTime() }))
    .sort((a, b) => b.mtime - a.mtime);

  return sorted[0].f;
}

export function readLatestModel(config: LensConfig): KeyboardModel | null {
  const filePath = findLatestBackup(config);
  if (!filePath) return null;
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return parseBackupToModel(raw, config.keyboard.product);
  } catch {
    return null;
  }
}

export function readLensConfig(configPath: string): LensConfig | null {
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(raw) as LensConfig;
  } catch {
    return null;
  }
}
