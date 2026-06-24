import { app, BrowserWindow, globalShortcut, ipcMain, Menu, screen } from "electron";
import path from "path";
import type { KeyboardModel, LensSettings, LensState } from "../shared/types";
import { ConfigWatcher } from "./config-watcher";
import { RawHidListener } from "./raw-hid-listener";
import { SerialListener } from "./serial-listener";
import { SettingsStore } from "./settings-store";
import { OVERLAY_EVENT_TAP, OVERLAY_EVENT_HOLD, OVERLAY_EVENT_DOUBLE_TAP } from "../shared/constants";

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

let win: BrowserWindow | null = null;
let overlayVisible = false;
let overlayActive = false;
let currentModel: KeyboardModel | null = null;
let activeLayer = 0;

const store = new SettingsStore();
const configWatcher = new ConfigWatcher();
const hidListener = new RawHidListener();
const serialListener = new SerialListener();

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
    alwaysOnTop: settings.alwaysOnTop,
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

function applyOverlayMode(enabled: boolean): void {
  if (!win) return;
  const settings = store.get();
  if (enabled) {
    win.setOpacity(settings.opacity);
    win.setAlwaysOnTop(true, "screen-saver");
    win.setIgnoreMouseEvents(true, { forward: true });
    win.webContents.executeJavaScript(`document.body.classList.add('overlay')`);
  } else {
    win.setOpacity(1.0);
    win.setAlwaysOnTop(settings.alwaysOnTop);
    win.setIgnoreMouseEvents(false);
    win.webContents.executeJavaScript(`document.body.classList.remove('overlay')`);
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
  const settings = store.get();
  if (settings.overlayAutoShow && settings.overlayMode) {
    showOverlay();
  }
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
    win?.setOpacity(v);
    return s;
  });

  ipcMain.handle("lens:set-always-on-top", (_, v: boolean): LensSettings => {
    const s = store.set({ alwaysOnTop: v });
    if (!store.get().overlayMode) win?.setAlwaysOnTop(v);
    return s;
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

  hidListener.on("layer-change", ({ layer }) => onLayerChange(layer));
  serialListener.on("layer-change", ({ layer }) => onLayerChange(layer));

  hidListener.on("overlay", ({ eventType }) => {
    if (eventType === OVERLAY_EVENT_TAP || eventType === OVERLAY_EVENT_DOUBLE_TAP) {
      toggleOverlay();
    } else if (eventType === OVERLAY_EVENT_HOLD) {
      showOverlay();
    }
  });

  globalShortcut.register("CommandOrControl+Alt+L", () => toggleOverlay());

  await configWatcher.start();
  await hidListener.start().catch(() => { /* HID not available, skip */ });
  await serialListener.start();

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
