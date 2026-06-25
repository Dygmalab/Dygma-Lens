import type { PaletteColor } from "../shared/types";

export function parseKeymap(raw: string, keysPerLayer: number): number[][] {
  const nums = raw.trim().split(/\s+/).map(Number);
  const layers: number[][] = [];
  for (let i = 0; i < nums.length; i += keysPerLayer) {
    layers.push(nums.slice(i, i + keysPerLayer));
  }
  return layers;
}

export function parsePaletteRGB(raw: string): PaletteColor[] {
  const nums = raw.trim().split(/\s+/).map(Number);
  const out: PaletteColor[] = [];
  for (let i = 0; i + 2 < nums.length; i += 3) {
    const [r, g, b] = nums.slice(i, i + 3);
    out.push({ r, g, b, w: 0, rgb: `rgb(${r},${g},${b})` });
  }
  return out;
}

export function parsePaletteRGBW(raw: string): PaletteColor[] {
  const nums = raw.trim().split(/\s+/).map(Number);
  const out: PaletteColor[] = [];
  for (let i = 0; i + 3 < nums.length; i += 4) {
    const [r, g, b, w] = nums.slice(i, i + 4);
    out.push({ r, g, b, w, rgb: `rgb(${r},${g},${b})` });
  }
  return out;
}

export function parseColormap(raw: string, layerSize: number): number[][] {
  const nums = raw.trim().split(/\s+/).map(Number);
  const layers: number[][] = [];
  for (let i = 0; i < nums.length; i += layerSize) {
    layers.push(nums.slice(i, i + layerSize));
  }
  return layers;
}

export function parseSuperkeys(raw: string): number[][] {
  if (!raw.trim()) return [];
  const nums = raw.trim().split(/\s+/).map(Number);
  const ACTIONS_PER_SUPERKEY = 5;
  const out: number[][] = [];
  for (let i = 0; i + ACTIONS_PER_SUPERKEY <= nums.length; i += ACTIONS_PER_SUPERKEY) {
    out.push(nums.slice(i, i + ACTIONS_PER_SUPERKEY));
  }
  return out;
}

export function parseNames(raw: string): string[] {
  if (!raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch { /* fall through to space-split */ }
  return raw.trim().split(/\s+/);
}

export function parseActiveLayer(raw: string): number {
  const bits = parseInt(raw.trim(), 10);
  if (isNaN(bits) || bits === 0) return 0;
  return Math.floor(Math.log2(bits));
}
