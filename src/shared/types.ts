export interface PaletteColor {
  r: number;
  g: number;
  b: number;
  w: number;
  rgb: string;
}

export interface KeyboardModel {
  keymap: number[][];
  palette: PaletteColor[];
  colormap: number[][];
  defaultLayer: number;
  superkeys: number[][];
  superkeyNames: string[];
  macroNames: string[];
  layerNames: string[];
}

export interface LensConfig {
  version: string;
  keyboard: {
    backupFolder: string;
    neuronID: string;
    product: string;
  };
  overlay: Record<string, unknown>;
  display: Record<string, unknown>;
}

export interface LensSettings {
  opacity: number;
  showUnderglow: boolean;
  layout: string;
  layerNames: string[];
  overlayMode: boolean;
  overlayAutoShow: boolean;
  hoverMode: boolean;
}

export interface LensState {
  model: KeyboardModel | null;
  activeLayer: number;
  configFound: boolean;
}

export interface DecodedKey {
  primary: string;
  hold: string;
  subtitle?: string;    // second line at same size as primary (superkey name, macro name)
  modifiers?: string[]; // modifier tag boxes shown at bottom
}

export type IpcChannel =
  | "lens:model"
  | "lens:active-layer"
  | "lens:settings"
  | "lens:get-state"
  | "lens:get-settings"
  | "lens:set-opacity"
  | "lens:set-show-underglow"
  | "lens:set-layout"
  | "lens:set-layer-name"
  | "lens:set-overlay"
  | "lens:set-overlay-auto-show"
  | "lens:set-hover-mode";
