import { app, BrowserWindow, globalShortcut, ipcMain, Menu, NativeImage, nativeImage, screen, Tray } from "electron";
import path from "path";
import fs from "fs";
import os from "os";
import type { KeyboardModel, LensSettings, LensState } from "../shared/types";
import { ConfigWatcher } from "./config-watcher";
import { RawHidListener } from "./raw-hid-listener";
import { SettingsStore, STORE_PATH } from "./settings-store";
import chokidar from "chokidar";
import { OVERLAY_EVENT_TAP, OVERLAY_EVENT_HOLD, OVERLAY_EVENT_RELEASE, OVERLAY_EVENT_DOUBLE_TAP } from "../shared/constants";

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

const PID_FILE = path.join(os.homedir(), ".lens", "lens.pid");
const AUTOSTART_FLAG = path.join(os.homedir(), ".lens", ".autostart-registered");

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let overlayVisible = false;
let overlayActive = false;
let normalBounds: Electron.Rectangle | null = null;
let overlayBounds: Electron.Rectangle | null = null;
let overlayLockedSize: { width: number; height: number } | null = null;
let fixingOverlayResize = false;
let currentModel: KeyboardModel | null = null;
let activeLayer = 0;
let overlayStyleApplied = false;
let holdKeyActive = false;
let layerAutoShowActive = false;
let layerChangeHideTimer: ReturnType<typeof setTimeout> | null = null;

const LAYER_CHANGE_AUTO_HIDE_MS = 3000;

const store = new SettingsStore();
const configWatcher = new ConfigWatcher();
const hidListener = new RawHidListener();

// ── Single-instance guard ─────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

// ── PID file helpers ──────────────────────────────────────────────────────────
function writePidFile(): void {
  try {
    fs.mkdirSync(path.dirname(PID_FILE), { recursive: true });
    fs.writeFileSync(PID_FILE, String(process.pid));
  } catch { /* ignore */ }
}

function removePidFile(): void {
  try { fs.rmSync(PID_FILE, { force: true }); } catch { /* ignore */ }
}

// ── OS autostart helpers ──────────────────────────────────────────────────────
function isAutostartRegistered(): boolean {
  if (process.platform === "linux") {
    return fs.existsSync(AUTOSTART_FLAG);
  }
  return app.getLoginItemSettings().openAtLogin;
}

function registerAutostart(): void {
  if (process.platform === "linux") {
    const desktopDir = path.join(os.homedir(), ".config", "autostart");
    try {
      fs.mkdirSync(desktopDir, { recursive: true });
      fs.writeFileSync(
        path.join(desktopDir, "dygma-lens.desktop"),
        `[Desktop Entry]\nType=Application\nName=Dygma Lens\nExec=${process.execPath}\nX-GNOME-Autostart-enabled=true\n`,
      );
      fs.mkdirSync(path.dirname(AUTOSTART_FLAG), { recursive: true });
      fs.writeFileSync(AUTOSTART_FLAG, "");
    } catch { /* ignore */ }
  } else {
    app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });
  }
}

// ── System tray ───────────────────────────────────────────────────────────────
function createTray(): void {
  let icon: NativeImage;
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, "Logo.png")
    : path.join(__dirname, "../../src/static/Logo.png");
  try {
    icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  } catch {
    icon = nativeImage.createEmpty();
  }
  tray = new Tray(icon);
  tray.setToolTip("Dygma Lens");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Dygma Lens", enabled: false },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() },
    ]),
  );
}

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
    console.log('[Lens/Main] Window ready-to-show');
    w.webContents.openDevTools({ mode: 'detach' });
    overlayActive = true;
    overlayVisible = true;
    console.log('[Lens/Main] Applying overlay mode on startup');
    applyOverlayMode(true);
    w.show();
    console.log('[Lens/Main] Pushing initial state and settings');
    if (currentModel) {
      console.log('[Lens/Main] Pushing existing model to renderer');
      pushModel(currentModel);
      pushActiveLayer(activeLayer);
    }
    pushState();
    pushSettings();
  });

  w.webContents.setVisualZoomLevelLimits(1, 1);

  w.on("closed", () => { win = null; });

  return w;
}

function winAlive(): boolean {
  return win !== null && !win.isDestroyed();
}

function pushModel(model: KeyboardModel): void {
  if (winAlive()) {
    console.log('[Lens/Main] pushModel: sending model to renderer');
    win!.webContents.send("lens:model", model);
  } else {
    console.log('[Lens/Main] pushModel: window not alive, skipping');
  }
}

function pushActiveLayer(layer: number): void {
  if (winAlive()) win!.webContents.send("lens:active-layer", layer);
}

function pushSettings(): void {
  if (winAlive()) win!.webContents.send("lens:settings", store.get());
}

function pushState(): void {
  if (!winAlive()) return;
  const state: LensState = {
    model: currentModel,
    activeLayer,
    configFound: configWatcher.getCurrentConfig() !== null,
  };
  console.log('[Lens/Main] pushState:', { hasModel: !!currentModel, activeLayer, configFound: state.configFound });
  win!.webContents.send("lens:state", state);
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

function syncHoverModeClass(hoverMode: boolean): string {
  console.log(`[Lens/Main] syncHoverModeClass: hoverMode=${hoverMode}`);
  return (
    `console.log('[Lens/Renderer] Applying hover-mode class:', ${hoverMode});` +
    `document.body.classList.${hoverMode ? "add" : "remove"}('hover-mode');` +
    `console.log('[Lens/Renderer] body.classList after toggle:', document.body.className);`
  );
}

function applyOverlayMode(enabled: boolean): void {
  if (!win) return;
  const settings = store.get();
  console.log(`[Lens/Main] applyOverlayMode(${enabled}), settings:`, { hoverMode: settings.hoverMode, opacity: settings.opacity });
  overlayStyleApplied = enabled;
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

const FADE_IN_DURATION_MS = 160;
const FADE_OUT_DURATION_MS = 320;
const FADE_INTERVAL_MS = 16;
let fadeTimer: ReturnType<typeof setInterval> | null = null;

function stopFade(): void {
  if (fadeTimer) {
    clearInterval(fadeTimer);
    fadeTimer = null;
  }
}

// The window is never destroyed while hidden — its content stays fully rendered — so a
// plain win.show()/hide() reveals the finished layout instantly and only then plays
// Windows' own native reveal animation, producing a flash-then-animate glitch. Driving
// opacity ourselves in small steps gives one smooth, consistent transition instead.
function fadeWindowOpacity(target: number, duration: number, onComplete?: () => void): void {
  if (!win) return;
  stopFade();
  const start = win.getOpacity();
  const startTime = Date.now();
  fadeTimer = setInterval(() => {
    if (!win) { stopFade(); return; }
    const t = Math.min(1, (Date.now() - startTime) / duration);
    win.setOpacity(start + (target - start) * t);
    if (t >= 1) {
      stopFade();
      onComplete?.();
    }
  }, FADE_INTERVAL_MS);
}

function showOverlay(): void {
  if (!win) return;
  overlayVisible = true;
  const settings = store.get();
  // Only (re)apply overlay styling (bounds/opacity/always-on-top/CSS) once; hideOverlay()
  // never tears it down, so reapplying it on every show causes a visible flash.
  if (settings.overlayMode && !overlayStyleApplied) applyOverlayMode(true);
  const target = overlayStyleApplied ? settings.opacity : 1.0;
  win.setOpacity(0);
  win.show();
  fadeWindowOpacity(target, FADE_IN_DURATION_MS);
}

function hideOverlay(): void {
  if (!win) return;
  overlayVisible = false;
  fadeWindowOpacity(0, FADE_OUT_DURATION_MS, () => {
    if (win) win.hide();
  });
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

function clearLayerChangeHideTimer(): void {
  if (layerChangeHideTimer) {
    clearTimeout(layerChangeHideTimer);
    layerChangeHideTimer = null;
  }
}

// Shared handlers for the overlay TAP / HOLD gesture, regardless of whether it
// originates from the OVERLAY_KEY superkey (eventType-based) or a dedicated
// OVERLAY_TAP / OVERLAY_HOLD key (its own packet type).
function onOverlayTapAction(): void {
  if (!overlayActive || !win) return;
  clearLayerChangeHideTimer();
  layerAutoShowActive = false;
  console.log(`[Lens/Main] TAP action → toggling visibility (currently ${overlayVisible ? "visible" : "hidden"})`);
  if (overlayVisible) hideOverlay(); else showOverlay();
}

function onOverlayHoldStart(): void {
  if (!overlayActive || !win) return;
  if (overlayVisible) {
    console.log('[Lens/Main] HOLD start ignored (Lens already visible)');
    return;
  }
  clearLayerChangeHideTimer();
  layerAutoShowActive = false;
  holdKeyActive = true;
  console.log('[Lens/Main] HOLD start → showing (was hidden)');
  showOverlay();
}

function onOverlayHoldEnd(): void {
  if (!holdKeyActive) return;
  holdKeyActive = false;
  clearLayerChangeHideTimer();
  console.log('[Lens/Main] HOLD end (release) → hiding');
  if (win) hideOverlay();
}

function onLayerChangeAutoShow(): void {
  if (!overlayActive || !win) return;
  if (!store.get().overlayAutoShow) return;
  if (overlayVisible) {
    // Already visible for some other reason (e.g. a manual TAP) — leave it alone.
    // Only Lens' own layer-change auto-show is allowed to auto-hide on release.
    console.log('[Lens/Main] Layer change auto-show skipped (Lens already visible)');
    return;
  }
  console.log('[Lens/Main] Layer change auto-show (overlayAutoShow enabled) → showing');
  layerAutoShowActive = true;
  showOverlay();
  // Fallback in case the layer never reverts to the default layer (e.g. a locked
  // layer switch instead of a momentary hold) — don't leave Lens on screen forever.
  clearLayerChangeHideTimer();
  layerChangeHideTimer = setTimeout(() => {
    layerChangeHideTimer = null;
    layerAutoShowActive = false;
    console.log('[Lens/Main] Layer change auto-hide timeout elapsed → hiding');
    if (win) hideOverlay();
  }, LAYER_CHANGE_AUTO_HIDE_MS);
}

// A layer-change back to the model's default (resting) layer is the release of
// whatever momentary layer-shift key caused the earlier change — hide right away
// instead of waiting out the fallback timeout, but only if we're the ones who
// showed it (don't clobber a window the user opened some other way).
function onLayerChangeRelease(): void {
  clearLayerChangeHideTimer();
  if (!layerAutoShowActive) return;
  layerAutoShowActive = false;
  console.log('[Lens/Main] Layer change release (back to default layer) → hiding');
  if (win) hideOverlay();
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

  // Hide macOS dock icon — Lens is a background/overlay app
  if (process.platform === "darwin") app.dock?.hide();

  writePidFile();

  if (!isAutostartRegistered()) {
    registerAutostart();
  }

  createTray();

  win = createWindow();
  registerIpcHandlers();

  ipcMain.on("win:minimize", () => win?.minimize());
  ipcMain.on("win:maximize", () => {
    if (win?.isMaximized()) win.unmaximize();
    else win?.maximize();
  });
  ipcMain.on("win:close", () => win?.close());

  configWatcher.on("modelChanged", (model) => {
    console.log('[Lens/Main] modelChanged event:', { hasModel: !!model, defaultLayer: model?.defaultLayer });
    currentModel = model;
    activeLayer = model.defaultLayer;
    pushModel(model);
    pushActiveLayer(activeLayer);
  });

  hidListener.on("layer-change", ({ layer }) => {
    console.log(`[HID] layer-change received: layer=${layer}`);
    onLayerChange(layer);
    const defaultLayer = currentModel?.defaultLayer ?? 0;
    if (layer === defaultLayer) {
      onLayerChangeRelease();
    } else {
      onLayerChangeAutoShow();
    }
  });

  hidListener.on("overlay", ({ eventType }) => {
    const eventNames: Record<number, string> = {
      [OVERLAY_EVENT_RELEASE]: 'RELEASE',
      [OVERLAY_EVENT_TAP]: 'TAP',
      [OVERLAY_EVENT_HOLD]: 'HOLD',
      [OVERLAY_EVENT_DOUBLE_TAP]: 'DOUBLE_TAP',
    };
    const eventName = eventNames[eventType] || `UNKNOWN(0x${eventType.toString(16)})`;
    console.log(`[Lens/Main] Overlay event received: ${eventName} (0x${eventType.toString(16)})`);

    if (eventType === OVERLAY_EVENT_TAP) {
      console.log('[Lens/Main] → TAP event (from OVERLAY_KEY or OVERLAY_TAP)');
      onOverlayTapAction();
    } else if (eventType === OVERLAY_EVENT_HOLD) {
      console.log('[Lens/Main] → HOLD event (from OVERLAY_KEY or OVERLAY_HOLD)');
      onOverlayHoldStart();
    } else if (eventType === OVERLAY_EVENT_RELEASE) {
      console.log('[Lens/Main] → RELEASE event (key released)');
      onOverlayHoldEnd();
    } else if (eventType === OVERLAY_EVENT_DOUBLE_TAP) {
      console.log('[Lens/Main] → DOUBLE_TAP event ignored (double-tap action removed)');
    } else {
      console.log(`[Lens/Main] → Unknown overlay event: 0x${eventType.toString(16)}`);
    }
  });

  hidListener.on("overlay-tap", ({ eventType }) => {
    const eventNames: Record<number, string> = {
      [OVERLAY_EVENT_RELEASE]: 'RELEASE',
      [OVERLAY_EVENT_TAP]: 'TAP',
      [OVERLAY_EVENT_HOLD]: 'HOLD',
    };
    const eventName = eventNames[eventType] || `UNKNOWN(0x${eventType.toString(16)})`;
    console.log(`[Lens/Main] OVERLAY_TAP key event: ${eventName} (0x${eventType.toString(16)})`);
    if (eventType === OVERLAY_EVENT_TAP) {
      onOverlayTapAction();
    }
  });

  hidListener.on("overlay-hold", ({ eventType }) => {
    const eventNames: Record<number, string> = {
      [OVERLAY_EVENT_RELEASE]: 'RELEASE',
      [OVERLAY_EVENT_TAP]: 'TAP',
      [OVERLAY_EVENT_HOLD]: 'HOLD',
    };
    const eventName = eventNames[eventType] || `UNKNOWN(0x${eventType.toString(16)})`;
    console.log(`[Lens/Main] OVERLAY_HOLD key event: ${eventName} (0x${eventType.toString(16)})`);
    if (eventType === OVERLAY_EVENT_HOLD) {
      onOverlayHoldStart();
    } else if (eventType === OVERLAY_EVENT_RELEASE) {
      onOverlayHoldEnd();
    }
  });

  globalShortcut.register("CommandOrControl+Alt+L", () => toggleOverlay());

  const settingsFileWatcher = chokidar.watch(STORE_PATH, { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 100 } });
  settingsFileWatcher.on("change", () => {
    const prev = store.get();
    const next = store.reload();
    console.log('[Lens/Main] Settings file changed:', { prevHover: prev.hoverMode, nextHover: next.hoverMode, prevOpacity: prev.opacity, nextOpacity: next.opacity });
    pushSettings();
    if (winAlive() && overlayActive) {
      if (prev.opacity !== next.opacity) {
        console.log(`[Lens/Main] Opacity changed: ${prev.opacity} → ${next.opacity}`);
        win!.setOpacity(next.opacity);
      }
      if (prev.hoverMode !== next.hoverMode) {
        console.log(`[Lens/Main] Hover mode changed: ${prev.hoverMode} → ${next.hoverMode}`);
        win!.setIgnoreMouseEvents(!next.hoverMode, { forward: true });
        setTimeout(() => {
          if (winAlive()) {
            console.log('[Lens/Main] Executing syncHoverModeClass after 50ms delay');
            win!.webContents.executeJavaScript(syncHoverModeClass(next.hoverMode)).catch(() => {});
          }
        }, 50);
      }
    }
  });

  await configWatcher.start();
  await hidListener.start().catch(() => { /* HID not available, skip */ });

  app.on("activate", () => {
    if (!win) win = createWindow();
    else win.show();
  });
});

app.on("window-all-closed", () => {
  // Lens lives in the system tray — do NOT quit when the window is closed.
  // The user quits via Tray → Quit.
});

app.on("will-quit", async () => {
  removePidFile();
  globalShortcut.unregisterAll();
  clearLayerChangeHideTimer();
  stopFade();
  hidListener.stop();
  await configWatcher.stop();
});
