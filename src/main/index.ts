import { app, BrowserWindow, globalShortcut, ipcMain, Menu, screen } from "electron";
import path from "path";
import type { KeyboardModel, LensSettings, LensState } from "../shared/types";
import { ConfigWatcher } from "./config-watcher";
import { RawHidListener } from "./raw-hid-listener";
import { SettingsStore } from "./settings-store";
import { OVERLAY_EVENT_TAP, OVERLAY_EVENT_HOLD, OVERLAY_EVENT_RELEASE, OVERLAY_EVENT_DOUBLE_TAP } from "../shared/constants";

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

let win: BrowserWindow | null = null;
let overlayVisible = false;
let overlayActive = false;
let normalBounds: Electron.Rectangle | null = null;
let overlayBounds: Electron.Rectangle | null = null;
let overlayLockedSize: { width: number; height: number } | null = null;
let fixingOverlayResize = false;
let currentModel: KeyboardModel | null = null;
let activeLayer = 0;

const store = new SettingsStore();
const configWatcher = new ConfigWatcher();
const hidListener = new RawHidListener();

function createWindow(): BrowserWindow {
  const settings = store.get();
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  const w = new BrowserWindow({
    width: Math.min(1270, width),
    height: Math.min(560, height),
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    alwaysOnTop: false,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    w.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    w.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  w.once("ready-to-show", () => {
    w.show();
    pushState();
    pushSettings();
  });

  w.webContents.setVisualZoomLevelLimits(1, 1);

  return w;
}

function pushModel(model: KeyboardModel): void {
  win?.webContents.send("lens:model", model);
}

function pushActiveLayer(layer: number): void {
  win?.webContents.send("lens:active-layer", layer);
}

function pushSettings(): void {
  win?.webContents.send("lens:settings", store.get());
}

function pushState(): void {
  const state: LensState = {
    model: currentModel,
    activeLayer,
    configFound: configWatcher.getCurrentConfig() !== null,
  };
  win?.webContents.send("lens:state", state);
}

function guardOverlayResize(): void {
  if (!win || !overlayLockedSize || fixingOverlayResize) return;
  const { width, height } = win.getBounds();
  if (width !== overlayLockedSize.width || height !== overlayLockedSize.height) {
    fixingOverlayResize = true;
    win.setSize(overlayLockedSize.width, overlayLockedSize.height);
    setImmediate(() => { fixingOverlayResize = false; });
  }
}

function preventOverlayResize(e: { preventDefault(): void }): void {
  e.preventDefault();
}

function applyOverlayMode(enabled: boolean): void {
  if (!win) return;
  const settings = store.get();
  if (enabled) {
    normalBounds = win.getBounds();
    overlayLockedSize = overlayBounds
      ? { width: overlayBounds.width, height: overlayBounds.height }
      : { width: normalBounds.width, height: normalBounds.height };
    win.setOpacity(settings.opacity);
    win.setAlwaysOnTop(true, "screen-saver");
    win.setIgnoreMouseEvents(!settings.hoverMode, { forward: true });
    win.setResizable(false);
    win.removeListener('will-resize', preventOverlayResize);
    win.removeListener('resize', guardOverlayResize);
    win.on('will-resize', preventOverlayResize);
    win.on('resize', guardOverlayResize);
    win.webContents.executeJavaScript(
      `document.body.classList.add('overlay');` +
      (settings.hoverMode ? `document.body.classList.add('hover-mode');` : `document.body.classList.remove('hover-mode');`)
    );
    if (overlayBounds) win.setBounds(overlayBounds);
  } else {
    overlayLockedSize = null;
    win.removeListener('will-resize', preventOverlayResize);
    win.removeListener('resize', guardOverlayResize);
    overlayBounds = win.getBounds();
    win.setOpacity(1.0);
    win.setAlwaysOnTop(false);
    win.setIgnoreMouseEvents(false);
    win.setResizable(true);
    win.webContents.executeJavaScript(`document.body.classList.remove('overlay','hover-mode');`);
    if (normalBounds) win.setBounds(normalBounds);
  }
}

function showOverlay(): void {
  if (!win) return;
  overlayVisible = true;
  const settings = store.get();
  if (settings.overlayMode) applyOverlayMode(true);
  win.show();
}

function hideOverlay(): void {
  if (!win) return;
  overlayVisible = false;
  win.hide();
}

function toggleOverlay(): void {
  if (!win) return;
  if (overlayActive) {
    overlayActive = false;
    overlayVisible = false;
    applyOverlayMode(false);
    win.hide();
  } else {
    overlayActive = true;
    overlayVisible = true;
    applyOverlayMode(true);
    win.show();
  }
}

function onLayerChange(layer: number): void {
  activeLayer = layer;
  pushActiveLayer(layer);
}

function registerIpcHandlers(): void {
  ipcMain.handle("lens:get-state", (): LensState => ({
    model: currentModel,
    activeLayer,
    configFound: configWatcher.getCurrentConfig() !== null,
  }));

  ipcMain.handle("lens:get-settings", (): LensSettings => store.get());

  ipcMain.handle("lens:set-opacity", (_, v: number): LensSettings => {
    const s = store.set({ opacity: v });
    if (overlayActive) win?.setOpacity(v);
    return s;
  });

  ipcMain.handle("lens:set-hover-mode", (_, v: boolean): LensSettings => {
    const s = store.set({ hoverMode: v });
    if (overlayActive && overlayVisible) {
      win?.setIgnoreMouseEvents(!v, { forward: true });
      win?.webContents.executeJavaScript(
        v ? `document.body.classList.add('hover-mode');`
          : `document.body.classList.remove('hover-mode');`
      );
    }
    win?.webContents.send("lens:settings", s);
    return s;
  });

  ipcMain.on("win:move", (_, x: number, y: number) => {
    if (!win) return;
    // Absolute positioning: the renderer computes the target top-left from the
    // cursor's screen position minus the grab offset, so it self-corrects every
    // frame and never accumulates. We must NOT read position back from
    // getBounds() (DWM rounding on transparent/frameless Windows drifts it).
    // Pin the size to the intended overlay size so a move can never resize.
    const { width, height } = win.getBounds();
    const w = overlayLockedSize?.width ?? width;
    const h = overlayLockedSize?.height ?? height;
    win.setBounds({ x: Math.round(x), y: Math.round(y), width: w, height: h });
  });

  ipcMain.on("win:move-by", (_, dx: number, dy: number) => {
    if (!win) return;
    const { x, y, width, height } = win.getBounds();
    const w = overlayLockedSize?.width ?? width;
    const h = overlayLockedSize?.height ?? height;
    win.setBounds({ x: x + Math.round(dx), y: y + Math.round(dy), width: w, height: h });
  });

  ipcMain.on("win:resize", (_, dir: string, dx: number, dy: number) => {
    if (!win) return;
    const [wx, wy] = win.getPosition();
    const [ww, wh] = win.getSize();
    let nx = wx, ny = wy, nw = ww, nh = wh;
    if (dir.includes("e")) nw = Math.max(400, ww + dx);
    if (dir.includes("s")) nh = Math.max(200, wh + dy);
    if (dir.includes("w")) { nx = wx + dx; nw = Math.max(400, ww - dx); }
    if (dir.includes("n")) { ny = wy + dy; nh = Math.max(200, wh - dy); }
    if (overlayLockedSize) overlayLockedSize = { width: nw, height: nh };
    win.setBounds({ x: nx, y: ny, width: nw, height: nh });
  });

  ipcMain.handle("lens:set-show-underglow", (_, v: boolean): LensSettings => store.set({ showUnderglow: v }));

  ipcMain.handle("lens:set-layout", (_, v: string): LensSettings => store.set({ layout: v }));

  ipcMain.handle("lens:set-layer-name", (_, layer: number, name: string): LensSettings => {
    const names = [...store.get().layerNames];
    names[layer] = name;
    return store.set({ layerNames: names });
  });

  ipcMain.handle("lens:set-overlay", (_, v: boolean): LensSettings => {
    const s = store.set({ overlayMode: v });
    applyOverlayMode(v);
    return s;
  });

  ipcMain.handle("lens:set-overlay-auto-show", (_, v: boolean): LensSettings => store.set({ overlayAutoShow: v }));
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  win = createWindow();
  registerIpcHandlers();

  ipcMain.on("win:minimize", () => win?.minimize());
  ipcMain.on("win:maximize", () => {
    if (win?.isMaximized()) win.unmaximize();
    else win?.maximize();
  });
  ipcMain.on("win:close", () => win?.close());

  configWatcher.on("modelChanged", (model) => {
    currentModel = model;
    activeLayer = model.defaultLayer;
    pushModel(model);
    pushActiveLayer(activeLayer);
  });

  hidListener.on("layer-change", ({ layer }) => {
    console.log(`[HID] layer-change received: layer=${layer}`);
    onLayerChange(layer);
  });

  hidListener.on("overlay", ({ eventType }) => {
    if (eventType === OVERLAY_EVENT_TAP) {
      // Re-show the overlay window only if already in overlay mode and currently hidden
      if (overlayActive && !overlayVisible) {
        overlayVisible = true;
        win?.show();
      }
    } else if (eventType === OVERLAY_EVENT_HOLD) {
      // Hide window only when in overlay mode
      if (overlayActive) {
        overlayVisible = false;
        win?.hide();
      }
    } else if (eventType === OVERLAY_EVENT_DOUBLE_TAP) {
      // Toggle overlay mode; exiting overlay shows the window in normal mode
      if (overlayActive) {
        overlayActive = false;
        overlayVisible = true;
        applyOverlayMode(false);
        win?.show();
      } else {
        overlayActive = true;
        overlayVisible = true;
        applyOverlayMode(true);
        win?.show();
      }
    }
  });

  globalShortcut.register("CommandOrControl+Alt+L", () => toggleOverlay());

  await configWatcher.start();
  await hidListener.start().catch(() => { /* HID not available, skip */ });

  app.on("activate", () => {
    if (!win) win = createWindow();
    else win.show();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", async () => {
  globalShortcut.unregisterAll();
  hidListener.stop();
  await configWatcher.stop();
});
