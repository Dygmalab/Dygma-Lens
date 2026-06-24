import type { KeyboardModel, LensSettings, LensState } from "../shared/types";

declare global {
  interface Window {
    lens: {
      onModel(cb: (m: KeyboardModel) => void): () => void;
      onActiveLayer(cb: (l: number) => void): () => void;
      onSettings(cb: (s: LensSettings) => void): () => void;
      getState(): Promise<LensState>;
      getSettings(): Promise<LensSettings>;
      setOpacity(v: number): Promise<LensSettings>;
      setAlwaysOnTop(v: boolean): Promise<LensSettings>;
      setShowUnderglow(v: boolean): Promise<LensSettings>;
      setLayout(v: string): Promise<LensSettings>;
      setLayerName(layer: number, name: string): Promise<LensSettings>;
      setOverlay(v: boolean): Promise<LensSettings>;
      setOverlayAutoShow(v: boolean): Promise<LensSettings>;
      winMinimize(): void;
      winMaximize(): void;
      winClose(): void;
    };
  }
}
export {};
