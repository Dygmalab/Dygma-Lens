import type { DecodedKey } from "../shared/types";

const BASE: Record<number, string> = {
  0: "",
  4: "A", 5: "B", 6: "C", 7: "D", 8: "E", 9: "F", 10: "G", 11: "H",
  12: "I", 13: "J", 14: "K", 15: "L", 16: "M", 17: "N", 18: "O", 19: "P",
  20: "Q", 21: "R", 22: "S", 23: "T", 24: "U", 25: "V", 26: "W", 27: "X",
  28: "Y", 29: "Z",
  30: "1", 31: "2", 32: "3", 33: "4", 34: "5",
  35: "6", 36: "7", 37: "8", 38: "9", 39: "0",
  40: "Enter", 41: "Esc", 42: "Bksp", 43: "Tab", 44: "Space",
  45: "-", 46: "=", 47: "[", 48: "]", 49: "\\",
  51: ";", 52: "'", 53: "`", 54: ",", 55: ".", 56: "/",
  57: "Caps",
  58: "F1", 59: "F2", 60: "F3", 61: "F4", 62: "F5", 63: "F6",
  64: "F7", 65: "F8", 66: "F9", 67: "F10", 68: "F11", 69: "F12",
  70: "PrtSc", 71: "ScrLk", 72: "Pause",
  73: "Ins", 74: "Home", 75: "PgUp", 76: "Del", 77: "End", 78: "PgDn",
  79: "→", 80: "←", 81: "↓", 82: "↑",
  83: "NumLk", 84: "KP/", 85: "KP*", 86: "KP-", 87: "KP+", 88: "KPEnt",
  89: "KP1", 90: "KP2", 91: "KP3", 92: "KP4", 93: "KP5",
  94: "KP6", 95: "KP7", 96: "KP8", 97: "KP9", 98: "KP0", 99: "KP.",
  100: "<>", 101: "Menu",
  104: "F13", 105: "F14", 106: "F15",
  107: "F16", 108: "F17", 109: "F18", 110: "F19", 111: "F20",
  112: "F21", 113: "F22", 114: "F23", 115: "F24",
  224: "Ctrl", 225: "Shift", 226: "Alt", 227: "OS",
  228: "Ctrl", 229: "Shift", 230: "AltGr", 231: "OS",
};

const ONE_SHOT_MOD: Record<number, string> = {
  49153: "Ctrl", 49154: "Shift", 49155: "Alt", 49156: "OS",
  49157: "Ctrl", 49158: "Shift", 49159: "AltGr", 49160: "OS",
};

const FUNCTION: Record<number, string> = {
  19682: "Mute", 23785: "Vol+", 23786: "Vol-",
  22733: "Play", 22709: "Next", 22710: "Prev", 22711: "Stop",
  22712: "Eject", 22713: "Shfl",
  18552: "Cam", 18834: "Calc",
  23663: "Bri+", 23664: "Bri-",
  17152: "LED+", 17153: "LED-", 17154: "LED",
  54108: "Batt", 54109: "BT", 54111: "Engy", 54112: "RF",
  20865: "Off", 20866: "Sleep",
};

export { layoutOverrides } from "./layouts";

// Layer key codes — verified against Bazecor src/api/keymap/db/layerswitch.tsx
const LAYER_LOCK_MIN  = 17408;  // LockLayerTable  layer 1-10
const LAYER_LOCK_MAX  = 17417;
const LAYER_SHIFT_MIN = 17450;  // ShiftToLayerTable layer 1-10
const LAYER_SHIFT_MAX = 17459;
const LAYER_MOVE_MIN  = 17492;  // MoveToLayerTable  layer 1-10
const LAYER_MOVE_MAX  = 17501;

// One-shot layer — db/oneshot.tsx layer 1-8
const LAYER_ONESHOT_MIN = 49161;
const LAYER_ONESHOT_MAX = 49168;

// Dual-use layer — db/dualuse.tsx: base 51218 + (layerIdx)*256 + keyCode, layers 1-8
const LAYER_DUAL_MIN = 51218;
const LAYER_DUAL_MAX = 53265;

// Macros and superkeys — verified against Bazecor src/api/keymap/db/macros.ts & superkeys.ts
const MACRO_MIN     = 53852;  // 53852 + index (128 macros)
const MACRO_MAX     = 53979;
const SUPERKEY_MIN  = 53980;  // 53980 + index (128 superkeys)
const SUPERKEY_MAX  = 54107;

function modBitsToArray(modByte: number): string[] {
  const mods: string[] = [];
  if (modByte & 0x01) mods.push("Ctrl");
  if (modByte & 0x02) mods.push("Shift");
  if (modByte & 0x04) mods.push("Alt");
  if (modByte & 0x08) mods.push("OS");
  if (modByte & 0x10) mods.push("Ctrl");
  if (modByte & 0x20) mods.push("Shift");
  if (modByte & 0x40) mods.push("AltGr");
  if (modByte & 0x80) mods.push("OS");
  return [...new Set(mods)];
}

function modBitsToString(modByte: number): string {
  return modBitsToArray(modByte).join("+");
}

export function superkeyIndex(code: number): number | null {
  if (code >= SUPERKEY_MIN && code <= SUPERKEY_MAX) return code - SUPERKEY_MIN;
  return null;
}

function layerName(num: number, layerNames: string[]): string {
  return layerNames[num - 1] || `L${num}`;
}

function decodeLayerKey(code: number, layerNames: string[], layout: Record<number, string>): DecodedKey | null {
  if (code >= LAYER_LOCK_MIN && code <= LAYER_LOCK_MAX)
    return { primary: layerName(code - LAYER_LOCK_MIN + 1, layerNames), hold: "lock" };
  if (code >= LAYER_SHIFT_MIN && code <= LAYER_SHIFT_MAX)
    return { primary: layerName(code - LAYER_SHIFT_MIN + 1, layerNames), hold: "shft" };
  if (code >= LAYER_MOVE_MIN && code <= LAYER_MOVE_MAX)
    return { primary: `>${layerName(code - LAYER_MOVE_MIN + 1, layerNames)}`, hold: "move" };
  if (code >= LAYER_ONESHOT_MIN && code <= LAYER_ONESHOT_MAX)
    return { primary: layerName(code - LAYER_ONESHOT_MIN + 1, layerNames), hold: "1shot" };
  if (code >= LAYER_DUAL_MIN && code <= LAYER_DUAL_MAX) {
    const layerIdx = Math.trunc((code - LAYER_DUAL_MIN) / 256);
    const tapLabel = layout[(code - LAYER_DUAL_MIN) % 256] ?? BASE[(code - LAYER_DUAL_MIN) % 256] ?? "";
    const name = layerName(layerIdx + 1, layerNames);
    return { primary: tapLabel || name, hold: name };
  }
  return null;
}

export function decodeKey(
  code: number,
  layout: Record<number, string> = {},
  layerNames: string[] = [],
  macroNames: string[] = [],
): DecodedKey {
  if (code === 0) return { primary: "NoKey", hold: "" };
  if (code === 1 || code === 65535) return { primary: "Trans", hold: "" };
  if (layout[code]) return { primary: layout[code], hold: "" };
  if (BASE[code] !== undefined) return { primary: BASE[code], hold: "" };
  if (ONE_SHOT_MOD[code]) return { primary: ONE_SHOT_MOD[code], hold: "" };
  if (FUNCTION[code]) return { primary: FUNCTION[code], hold: "" };

  const layerKey = decodeLayerKey(code, layerNames, layout);
  if (layerKey) return layerKey;

  if (code >= SUPERKEY_MIN && code <= SUPERKEY_MAX)
    return { primary: `SK${code - SUPERKEY_MIN}`, hold: "" };

  if (code >= MACRO_MIN && code <= MACRO_MAX) {
    const idx = code - MACRO_MIN;
    return { primary: "Macro", subtitle: macroNames[idx] || `M${idx + 1}`, hold: "" };
  }

  // Key + modifier combination: high byte = modifier flags, low byte = HID keycode.
  // Checked last so all named ranges above take priority.
  const modFlags = (code >> 8) & 0xff;
  const baseCode = code & 0xff;
  if (modFlags !== 0) {
    const baseLabel = layout[baseCode] ?? BASE[baseCode];
    if (baseLabel) return { primary: baseLabel, hold: "", modifiers: modBitsToArray(modFlags) };
  }

  return { primary: `#${code}`, hold: "" };
}
