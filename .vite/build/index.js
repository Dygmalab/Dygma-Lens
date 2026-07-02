"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
const electron = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const events = require("events");
const glob = require("glob");
const chokidar = require("chokidar");
const SONSEI_VENDOR_ID = 13807;
const SONSEI_PRODUCT_ID = 49;
const SONSEI_KEYS_PER_LAYER = 60;
const SONSEI_COLOR_LAYER_SIZE = 56;
const LENS_CONFIG_PATH_SEGMENTS = [".lens", "lens-config.json"];
const OVERLAY_MAGIC_BYTE = 170;
const OVERLAY_PACKET_SIZE = 5;
const PACKET_TYPE_OVERLAY = 1;
const PACKET_TYPE_LAYER = 2;
const PACKET_TYPE_OVERLAY_TAP = 3;
const PACKET_TYPE_OVERLAY_HOLD = 4;
const OVERLAY_EVENT_RELEASE = 0;
const OVERLAY_EVENT_TAP = 1;
const OVERLAY_EVENT_HOLD = 2;
const OVERLAY_EVENT_DOUBLE_TAP = 3;
const SONSEI_RAW_HID_REPORT_ID = 5;
function parseKeymap(raw, keysPerLayer2) {
  const nums = raw.trim().split(/\s+/).map(Number);
  const layers = [];
  for (let i = 0; i < nums.length; i += keysPerLayer2) {
    layers.push(nums.slice(i, i + keysPerLayer2));
  }
  return layers;
}
function parsePaletteRGB(raw) {
  const nums = raw.trim().split(/\s+/).map(Number);
  const out = [];
  for (let i = 0; i + 2 < nums.length; i += 3) {
    const [r, g, b] = nums.slice(i, i + 3);
    out.push({ r, g, b, w: 0, rgb: `rgb(${r},${g},${b})` });
  }
  return out;
}
function parseColormap(raw, layerSize) {
  const nums = raw.trim().split(/\s+/).map(Number);
  const layers = [];
  for (let i = 0; i < nums.length; i += layerSize) {
    layers.push(nums.slice(i, i + layerSize));
  }
  return layers;
}
function parseSuperkeys(raw) {
  if (!raw.trim()) return [];
  const nums = raw.trim().split(/\s+/).map(Number);
  const ACTIONS_PER_SUPERKEY = 5;
  const out = [];
  for (let i = 0; i + ACTIONS_PER_SUPERKEY <= nums.length; i += ACTIONS_PER_SUPERKEY) {
    out.push(nums.slice(i, i + ACTIONS_PER_SUPERKEY));
  }
  return out;
}
function parseNames(raw) {
  if (!raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
  }
  return raw.trim().split(/\s+/);
}
function getCommandData(backup, command) {
  var _a;
  return ((_a = backup.backup.find((e) => e.command === command)) == null ? void 0 : _a.data) ?? "";
}
function keysPerLayer(product) {
  switch (product.toLowerCase()) {
    case "sonsei":
      return SONSEI_KEYS_PER_LAYER;
    default:
      return SONSEI_KEYS_PER_LAYER;
  }
}
function colorLayerSize(product) {
  switch (product.toLowerCase()) {
    case "sonsei":
      return SONSEI_COLOR_LAYER_SIZE;
    default:
      return SONSEI_COLOR_LAYER_SIZE;
  }
}
function parseBackupToModel(backupRaw, product) {
  var _a, _b, _c;
  const backup = JSON.parse(backupRaw);
  const kpl = keysPerLayer(product);
  const cls = colorLayerSize(product);
  const keymapRaw = getCommandData(backup, "keymap.custom");
  const paletteRaw = getCommandData(backup, "palette");
  const colormapRaw = getCommandData(backup, "colormap.map");
  const defaultLayerRaw = getCommandData(backup, "settings.defaultLayer");
  const superkeysRaw = getCommandData(backup, "superkeys.map");
  const neuron = backup.neuron;
  const layerNames = ((_a = neuron == null ? void 0 : neuron.layers) == null ? void 0 : _a.slice().sort((a, b) => a.id - b.id).map((l) => l.name)) ?? parseNames(getCommandData(backup, "layers.names"));
  const superkeyNames = ((_b = neuron == null ? void 0 : neuron.superkeys) == null ? void 0 : _b.slice().sort((a, b) => a.id - b.id).map((s) => s.name)) ?? parseNames(getCommandData(backup, "superkeys.names"));
  const macroNames = ((_c = neuron == null ? void 0 : neuron.macros) == null ? void 0 : _c.slice().sort((a, b) => a.id - b.id).map((m) => m.name ?? "")) ?? parseNames(getCommandData(backup, "macros.names"));
  return {
    keymap: parseKeymap(keymapRaw, kpl),
    palette: parsePaletteRGB(paletteRaw),
    colormap: parseColormap(colormapRaw, cls),
    defaultLayer: parseInt(defaultLayerRaw.trim() || "0", 10),
    superkeys: parseSuperkeys(superkeysRaw),
    superkeyNames,
    macroNames,
    layerNames
  };
}
function findLatestBackup(config) {
  const { backupFolder, neuronID, product } = config.keyboard;
  const folderPath = path.join(backupFolder, product, neuronID);
  if (!fs.existsSync(folderPath)) return null;
  let pattern;
  if (process.platform === "win32") {
    pattern = `${folderPath.replace(/\\/g, "/")}/*.json`;
  } else {
    pattern = `${folderPath}/*.json`;
  }
  const files = glob.globSync(pattern);
  if (files.length === 0) return null;
  const sorted = files.map((f) => ({ f, mtime: fs.statSync(f).mtime.getTime() })).sort((a, b) => b.mtime - a.mtime);
  return sorted[0].f;
}
function readLatestModel(config) {
  const filePath = findLatestBackup(config);
  if (!filePath) return null;
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return parseBackupToModel(raw, config.keyboard.product);
  } catch {
    return null;
  }
}
function readLensConfig(configPath) {
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
const LENS_CONFIG_PATH = path.join(os.homedir(), ...LENS_CONFIG_PATH_SEGMENTS);
class ConfigWatcher extends events.EventEmitter {
  constructor() {
    super(...arguments);
    __publicField(this, "watcher", null);
    __publicField(this, "backupWatcher", null);
    __publicField(this, "currentConfig", null);
  }
  async start() {
    const chokidar2 = await import("chokidar");
    this.watcher = chokidar2.watch(LENS_CONFIG_PATH, {
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 50 }
    });
    this.watcher.on("add", (p) => this.onConfigFile(p));
    this.watcher.on("change", (p) => this.onConfigFile(p));
  }
  onConfigFile(filePath) {
    const config = readLensConfig(filePath);
    if (!config) return;
    this.currentConfig = config;
    this.emit("configChanged", config);
    this.loadModel(config);
    this.watchBackupFolder(config);
  }
  loadModel(config) {
    const model = readLatestModel(config);
    if (model) this.emit("modelChanged", model);
  }
  async watchBackupFolder(config) {
    const chokidar2 = await import("chokidar");
    if (this.backupWatcher) {
      await this.backupWatcher.close();
      this.backupWatcher = null;
    }
    const backupDir = path.join(config.keyboard.backupFolder, config.keyboard.product, config.keyboard.neuronID);
    this.backupWatcher = chokidar2.watch(`${backupDir}/*.json`, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 }
    });
    this.backupWatcher.on("add", () => {
      if (this.currentConfig) this.loadModel(this.currentConfig);
    });
    this.backupWatcher.on("change", () => {
      if (this.currentConfig) this.loadModel(this.currentConfig);
    });
  }
  async stop() {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    if (this.backupWatcher) {
      await this.backupWatcher.close();
      this.backupWatcher = null;
    }
  }
  getCurrentConfig() {
    return this.currentConfig;
  }
}
const RECONNECT_INTERVAL_MS = 2e3;
const DEBOUNCE_MS = {
  0: 80,
  // RELEASE
  1: 150,
  // TAP
  2: 150,
  // HOLD
  3: 400
  // DOUBLE_TAP
};
const DEFAULT_DEBOUNCE_MS = 150;
class RawHidListener extends events.EventEmitter {
  constructor() {
    super(...arguments);
    __publicField(this, "device", null);
    __publicField(this, "running", false);
    __publicField(this, "reconnectTimer", null);
    __publicField(this, "lastEventTime", {});
  }
  // Debounces per (source, eventType) pair so bouncy/duplicate packets from a
  // single physical press can't fire the same handler twice in quick succession.
  shouldEmit(source, eventType) {
    const key = `${source}:${eventType}`;
    const now = Date.now();
    const debounce = DEBOUNCE_MS[eventType] ?? DEFAULT_DEBOUNCE_MS;
    const last = this.lastEventTime[key] ?? 0;
    if (now - last < debounce) {
      console.log(`[HID] ${source} eventType=0x${eventType.toString(16)} debounced (${now - last}ms < ${debounce}ms)`);
      return false;
    }
    this.lastEventTime[key] = now;
    return true;
  }
  async start() {
    try {
      const HID = await import("node-hid");
      const devices = HID.devices();
      const target = devices.find(
        (d) => d.vendorId === SONSEI_VENDOR_ID && d.productId === SONSEI_PRODUCT_ID && d.usagePage === 65280 && d.usage === 1
      );
      if (!target || !target.path) {
        console.log(
          "[HID] Device not found (VID=0x%s PID=0x%s usagePage=0xff00 usage=0x01)",
          SONSEI_VENDOR_ID.toString(16),
          SONSEI_PRODUCT_ID.toString(16)
        );
        console.log("[HID] Available devices:", devices.map((d) => {
          var _a, _b;
          return `VID=${(_a = d.vendorId) == null ? void 0 : _a.toString(16)} PID=${(_b = d.productId) == null ? void 0 : _b.toString(16)} usage=${d.usagePage}/${d.usage}`;
        }));
        return;
      }
      console.log(`[HID] Device opened: ${target.path}`);
      this.device = new HID.HID(target.path);
      this.running = true;
      this.emit("connected");
      this.device.on("data", (buf) => this.onData(buf));
      this.device.on("error", () => {
        this.device = null;
        this.running = false;
        this.emit("disconnected");
        console.log("[HID] Device disconnected, scheduling reconnect...");
        this.scheduleReconnect();
      });
    } catch (err) {
      console.log("[HID] start() error:", err);
    }
  }
  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      console.log("[HID] Attempting reconnect...");
      await this.start();
      if (!this.running) this.scheduleReconnect();
    }, RECONNECT_INTERVAL_MS);
  }
  onData(buf) {
    var _a, _b;
    console.log(`[HID] raw packet (${buf.length}b): ${buf.slice(0, 8).toString("hex")}`);
    if (buf.length < OVERLAY_PACKET_SIZE) {
      console.log(`[HID] packet too short: ${buf.length} < ${OVERLAY_PACKET_SIZE}`);
      return;
    }
    const base = buf[0] === SONSEI_RAW_HID_REPORT_ID ? 1 : 0;
    console.log(`[HID] base=${base} buf[base]=0x${(_a = buf[base]) == null ? void 0 : _a.toString(16)} magic=0x${OVERLAY_MAGIC_BYTE.toString(16)}`);
    if (buf[base] !== OVERLAY_MAGIC_BYTE) {
      console.log("[HID] magic byte mismatch, skipping");
      return;
    }
    const packetType = buf[base + 1];
    console.log(`[HID] packetType=0x${packetType == null ? void 0 : packetType.toString(16)} payload=0x${(_b = buf[base + 2]) == null ? void 0 : _b.toString(16)}`);
    if (packetType === PACKET_TYPE_OVERLAY) {
      const eventType = buf[base + 2];
      if (!this.shouldEmit("overlay", eventType)) return;
      console.log(`[HID] emitting overlay (OVERLAY_KEY superkey): eventType=0x${eventType.toString(16)}`);
      this.emit("overlay", { type: "overlay", eventType });
    } else if (packetType === PACKET_TYPE_OVERLAY_TAP) {
      const eventType = buf[base + 2];
      if (!this.shouldEmit("overlay-tap", eventType)) return;
      console.log(`[HID] emitting overlay-tap (OVERLAY_TAP key): eventType=0x${eventType.toString(16)}`);
      this.emit("overlay-tap", { type: "overlay-tap", eventType });
    } else if (packetType === PACKET_TYPE_OVERLAY_HOLD) {
      const eventType = buf[base + 2];
      if (!this.shouldEmit("overlay-hold", eventType)) return;
      console.log(`[HID] emitting overlay-hold (OVERLAY_HOLD key): eventType=0x${eventType.toString(16)}`);
      this.emit("overlay-hold", { type: "overlay-hold", eventType });
    } else if (packetType === PACKET_TYPE_LAYER) {
      console.log(`[HID] emitting layer-change: layer=${buf[base + 2]}`);
      this.emit("layer-change", { type: "layer", layer: buf[base + 2] });
    }
  }
  stop() {
    var _a;
    this.running = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      (_a = this.device) == null ? void 0 : _a.close();
    } catch {
    }
    this.device = null;
  }
}
const STORE_PATH = path.join(os.homedir(), ".lens", "settings.json");
const DEFAULTS = {
  opacity: 0.85,
  showUnderglow: false,
  layout: "us",
  layerNames: [],
  overlayMode: false,
  overlayAutoShow: true,
  hoverMode: false
};
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
function sanitize(s) {
  return {
    opacity: clamp(typeof s.opacity === "number" ? s.opacity : DEFAULTS.opacity, 0.1, 1),
    showUnderglow: typeof s.showUnderglow === "boolean" ? s.showUnderglow : DEFAULTS.showUnderglow,
    layout: typeof s.layout === "string" ? s.layout : DEFAULTS.layout,
    layerNames: Array.isArray(s.layerNames) ? s.layerNames : DEFAULTS.layerNames,
    overlayMode: typeof s.overlayMode === "boolean" ? s.overlayMode : DEFAULTS.overlayMode,
    overlayAutoShow: typeof s.overlayAutoShow === "boolean" ? s.overlayAutoShow : DEFAULTS.overlayAutoShow,
    hoverMode: typeof s.hoverMode === "boolean" ? s.hoverMode : DEFAULTS.hoverMode
  };
}
class SettingsStore {
  constructor() {
    __publicField(this, "data");
    this.data = this.load();
  }
  load() {
    try {
      const raw = fs.readFileSync(STORE_PATH, "utf-8");
      return sanitize(JSON.parse(raw));
    } catch {
      return { ...DEFAULTS };
    }
  }
  save() {
    try {
      fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
      fs.writeFileSync(STORE_PATH, JSON.stringify(this.data, null, 2));
    } catch {
    }
  }
  get() {
    return { ...this.data };
  }
  reload() {
    this.data = this.load();
    return this.get();
  }
  set(updates) {
    this.data = sanitize({ ...this.data, ...updates });
    this.save();
    return this.get();
  }
}
const PID_FILE = path.join(os.homedir(), ".lens", "lens.pid");
const AUTOSTART_FLAG = path.join(os.homedir(), ".lens", ".autostart-registered");
let win = null;
let tray = null;
let overlayVisible = false;
let overlayActive = false;
let normalBounds = null;
let overlayBounds = null;
let overlayLockedSize = null;
let fixingOverlayResize = false;
let currentModel = null;
let activeLayer = 0;
let overlayStyleApplied = false;
let holdKeyActive = false;
let layerAutoShowActive = false;
let layerChangeHideTimer = null;
const LAYER_CHANGE_AUTO_HIDE_MS = 3e3;
const store = new SettingsStore();
const configWatcher = new ConfigWatcher();
const hidListener = new RawHidListener();
const gotLock = electron.app.requestSingleInstanceLock();
if (!gotLock) {
  electron.app.quit();
  process.exit(0);
}
function writePidFile() {
  try {
    fs.mkdirSync(path.dirname(PID_FILE), { recursive: true });
    fs.writeFileSync(PID_FILE, String(process.pid));
  } catch {
  }
}
function removePidFile() {
  try {
    fs.rmSync(PID_FILE, { force: true });
  } catch {
  }
}
function isAutostartRegistered() {
  if (process.platform === "linux") {
    return fs.existsSync(AUTOSTART_FLAG);
  }
  return electron.app.getLoginItemSettings().openAtLogin;
}
function registerAutostart() {
  if (process.platform === "linux") {
    const desktopDir = path.join(os.homedir(), ".config", "autostart");
    try {
      fs.mkdirSync(desktopDir, { recursive: true });
      fs.writeFileSync(
        path.join(desktopDir, "dygma-lens.desktop"),
        `[Desktop Entry]
Type=Application
Name=Dygma Lens
Exec=${process.execPath}
X-GNOME-Autostart-enabled=true
`
      );
      fs.mkdirSync(path.dirname(AUTOSTART_FLAG), { recursive: true });
      fs.writeFileSync(AUTOSTART_FLAG, "");
    } catch {
    }
  } else {
    electron.app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });
  }
}
function createTray() {
  let icon;
  const iconPath = electron.app.isPackaged ? path.join(process.resourcesPath, "Logo.png") : path.join(__dirname, "../../src/static/Logo.png");
  try {
    icon = electron.nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  } catch {
    icon = electron.nativeImage.createEmpty();
  }
  tray = new electron.Tray(icon);
  tray.setToolTip("Dygma Lens");
  tray.setContextMenu(
    electron.Menu.buildFromTemplate([
      { label: "Dygma Lens", enabled: false },
      { type: "separator" },
      { label: "Quit", click: () => electron.app.quit() }
    ])
  );
}
function createWindow() {
  store.get();
  const { width, height } = electron.screen.getPrimaryDisplay().workAreaSize;
  const w = new electron.BrowserWindow({
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
      nodeIntegration: false
    }
  });
  {
    w.loadURL("http://localhost:5173");
  }
  w.once("ready-to-show", () => {
    console.log("[Lens/Main] Window ready-to-show");
    w.webContents.openDevTools({ mode: "detach" });
    overlayActive = true;
    overlayVisible = true;
    console.log("[Lens/Main] Applying overlay mode on startup");
    applyOverlayMode(true);
    w.show();
    console.log("[Lens/Main] Pushing initial state and settings");
    if (currentModel) {
      console.log("[Lens/Main] Pushing existing model to renderer");
      pushModel(currentModel);
      pushActiveLayer(activeLayer);
    }
    pushState();
    pushSettings();
  });
  w.webContents.setVisualZoomLevelLimits(1, 1);
  w.on("closed", () => {
    win = null;
  });
  return w;
}
function winAlive() {
  return win !== null && !win.isDestroyed();
}
function pushModel(model) {
  if (winAlive()) {
    console.log("[Lens/Main] pushModel: sending model to renderer");
    win.webContents.send("lens:model", model);
  } else {
    console.log("[Lens/Main] pushModel: window not alive, skipping");
  }
}
function pushActiveLayer(layer) {
  if (winAlive()) win.webContents.send("lens:active-layer", layer);
}
function pushSettings() {
  if (winAlive()) win.webContents.send("lens:settings", store.get());
}
function pushState() {
  if (!winAlive()) return;
  const state = {
    model: currentModel,
    activeLayer,
    configFound: configWatcher.getCurrentConfig() !== null
  };
  console.log("[Lens/Main] pushState:", { hasModel: !!currentModel, activeLayer, configFound: state.configFound });
  win.webContents.send("lens:state", state);
}
function guardOverlayResize() {
  if (!win || !overlayLockedSize || fixingOverlayResize) return;
  const { width, height } = win.getBounds();
  if (width !== overlayLockedSize.width || height !== overlayLockedSize.height) {
    fixingOverlayResize = true;
    win.setSize(overlayLockedSize.width, overlayLockedSize.height);
    setImmediate(() => {
      fixingOverlayResize = false;
    });
  }
}
function preventOverlayResize(e) {
  e.preventDefault();
}
function syncHoverModeClass(hoverMode) {
  console.log(`[Lens/Main] syncHoverModeClass: hoverMode=${hoverMode}`);
  return `console.log('[Lens/Renderer] Applying hover-mode class:', ${hoverMode});document.body.classList.${hoverMode ? "add" : "remove"}('hover-mode');console.log('[Lens/Renderer] body.classList after toggle:', document.body.className);`;
}
function applyOverlayMode(enabled) {
  if (!win) return;
  const settings = store.get();
  console.log(`[Lens/Main] applyOverlayMode(${enabled}), settings:`, { hoverMode: settings.hoverMode, opacity: settings.opacity });
  overlayStyleApplied = enabled;
  if (enabled) {
    normalBounds = win.getBounds();
    overlayLockedSize = overlayBounds ? { width: overlayBounds.width, height: overlayBounds.height } : { width: normalBounds.width, height: normalBounds.height };
    win.setOpacity(settings.opacity);
    win.setAlwaysOnTop(true, "screen-saver");
    win.setIgnoreMouseEvents(!settings.hoverMode, { forward: true });
    win.setResizable(false);
    win.removeListener("will-resize", preventOverlayResize);
    win.removeListener("resize", guardOverlayResize);
    win.on("will-resize", preventOverlayResize);
    win.on("resize", guardOverlayResize);
    win.webContents.executeJavaScript(
      `document.body.classList.add('overlay');` + (settings.hoverMode ? `document.body.classList.add('hover-mode');` : `document.body.classList.remove('hover-mode');`)
    );
    if (overlayBounds) win.setBounds(overlayBounds);
  } else {
    overlayLockedSize = null;
    win.removeListener("will-resize", preventOverlayResize);
    win.removeListener("resize", guardOverlayResize);
    overlayBounds = win.getBounds();
    win.setOpacity(1);
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
let fadeTimer = null;
function stopFade() {
  if (fadeTimer) {
    clearInterval(fadeTimer);
    fadeTimer = null;
  }
}
function fadeWindowOpacity(target, duration, onComplete) {
  if (!win) return;
  stopFade();
  const start = win.getOpacity();
  const startTime = Date.now();
  fadeTimer = setInterval(() => {
    if (!win) {
      stopFade();
      return;
    }
    const t = Math.min(1, (Date.now() - startTime) / duration);
    win.setOpacity(start + (target - start) * t);
    if (t >= 1) {
      stopFade();
      onComplete == null ? void 0 : onComplete();
    }
  }, FADE_INTERVAL_MS);
}
function showOverlay() {
  if (!win) return;
  overlayVisible = true;
  const settings = store.get();
  if (settings.overlayMode && !overlayStyleApplied) applyOverlayMode(true);
  const target = overlayStyleApplied ? settings.opacity : 1;
  win.setOpacity(0);
  win.show();
  fadeWindowOpacity(target, FADE_IN_DURATION_MS);
}
function hideOverlay() {
  if (!win) return;
  overlayVisible = false;
  fadeWindowOpacity(0, FADE_OUT_DURATION_MS, () => {
    if (win) win.hide();
  });
}
function toggleOverlay() {
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
function onLayerChange(layer) {
  activeLayer = layer;
  pushActiveLayer(layer);
}
function clearLayerChangeHideTimer() {
  if (layerChangeHideTimer) {
    clearTimeout(layerChangeHideTimer);
    layerChangeHideTimer = null;
  }
}
function onOverlayTapAction() {
  if (!overlayActive || !win) return;
  clearLayerChangeHideTimer();
  layerAutoShowActive = false;
  console.log(`[Lens/Main] TAP action → toggling visibility (currently ${overlayVisible ? "visible" : "hidden"})`);
  if (overlayVisible) hideOverlay();
  else showOverlay();
}
function onOverlayHoldStart() {
  if (!overlayActive || !win) return;
  if (overlayVisible) {
    console.log("[Lens/Main] HOLD start ignored (Lens already visible)");
    return;
  }
  clearLayerChangeHideTimer();
  layerAutoShowActive = false;
  holdKeyActive = true;
  console.log("[Lens/Main] HOLD start → showing (was hidden)");
  showOverlay();
}
function onOverlayHoldEnd() {
  if (!holdKeyActive) return;
  holdKeyActive = false;
  clearLayerChangeHideTimer();
  console.log("[Lens/Main] HOLD end (release) → hiding");
  if (win) hideOverlay();
}
function onLayerChangeAutoShow() {
  if (!overlayActive || !win) return;
  if (!store.get().overlayAutoShow) return;
  if (overlayVisible) {
    console.log("[Lens/Main] Layer change auto-show skipped (Lens already visible)");
    return;
  }
  console.log("[Lens/Main] Layer change auto-show (overlayAutoShow enabled) → showing");
  layerAutoShowActive = true;
  showOverlay();
  clearLayerChangeHideTimer();
  layerChangeHideTimer = setTimeout(() => {
    layerChangeHideTimer = null;
    layerAutoShowActive = false;
    console.log("[Lens/Main] Layer change auto-hide timeout elapsed → hiding");
    if (win) hideOverlay();
  }, LAYER_CHANGE_AUTO_HIDE_MS);
}
function onLayerChangeRelease() {
  clearLayerChangeHideTimer();
  if (!layerAutoShowActive) return;
  layerAutoShowActive = false;
  console.log("[Lens/Main] Layer change release (back to default layer) → hiding");
  if (win) hideOverlay();
}
function registerIpcHandlers() {
  electron.ipcMain.handle("lens:get-state", () => ({
    model: currentModel,
    activeLayer,
    configFound: configWatcher.getCurrentConfig() !== null
  }));
  electron.ipcMain.handle("lens:get-settings", () => store.get());
  electron.ipcMain.handle("lens:set-opacity", (_, v) => {
    const s = store.set({ opacity: v });
    if (overlayActive) win == null ? void 0 : win.setOpacity(v);
    return s;
  });
  electron.ipcMain.handle("lens:set-hover-mode", (_, v) => {
    const s = store.set({ hoverMode: v });
    if (overlayActive && overlayVisible) {
      win == null ? void 0 : win.setIgnoreMouseEvents(!v, { forward: true });
      win == null ? void 0 : win.webContents.executeJavaScript(
        v ? `document.body.classList.add('hover-mode');` : `document.body.classList.remove('hover-mode');`
      );
    }
    win == null ? void 0 : win.webContents.send("lens:settings", s);
    return s;
  });
  electron.ipcMain.on("win:move", (_, x, y) => {
    if (!win) return;
    const { width, height } = win.getBounds();
    const w = (overlayLockedSize == null ? void 0 : overlayLockedSize.width) ?? width;
    const h = (overlayLockedSize == null ? void 0 : overlayLockedSize.height) ?? height;
    win.setBounds({ x: Math.round(x), y: Math.round(y), width: w, height: h });
  });
  electron.ipcMain.on("win:move-by", (_, dx, dy) => {
    if (!win) return;
    const { x, y, width, height } = win.getBounds();
    const w = (overlayLockedSize == null ? void 0 : overlayLockedSize.width) ?? width;
    const h = (overlayLockedSize == null ? void 0 : overlayLockedSize.height) ?? height;
    win.setBounds({ x: x + Math.round(dx), y: y + Math.round(dy), width: w, height: h });
  });
  electron.ipcMain.on("win:resize", (_, dir, dx, dy) => {
    if (!win) return;
    const [wx, wy] = win.getPosition();
    const [ww, wh] = win.getSize();
    let nx = wx, ny = wy, nw = ww, nh = wh;
    if (dir.includes("e")) nw = Math.max(400, ww + dx);
    if (dir.includes("s")) nh = Math.max(200, wh + dy);
    if (dir.includes("w")) {
      nx = wx + dx;
      nw = Math.max(400, ww - dx);
    }
    if (dir.includes("n")) {
      ny = wy + dy;
      nh = Math.max(200, wh - dy);
    }
    if (overlayLockedSize) overlayLockedSize = { width: nw, height: nh };
    win.setBounds({ x: nx, y: ny, width: nw, height: nh });
  });
  electron.ipcMain.handle("lens:set-show-underglow", (_, v) => store.set({ showUnderglow: v }));
  electron.ipcMain.handle("lens:set-layout", (_, v) => store.set({ layout: v }));
  electron.ipcMain.handle("lens:set-layer-name", (_, layer, name) => {
    const names = [...store.get().layerNames];
    names[layer] = name;
    return store.set({ layerNames: names });
  });
  electron.ipcMain.handle("lens:set-overlay", (_, v) => {
    const s = store.set({ overlayMode: v });
    applyOverlayMode(v);
    return s;
  });
  electron.ipcMain.handle("lens:set-overlay-auto-show", (_, v) => store.set({ overlayAutoShow: v }));
}
electron.app.whenReady().then(async () => {
  var _a;
  electron.Menu.setApplicationMenu(null);
  if (process.platform === "darwin") (_a = electron.app.dock) == null ? void 0 : _a.hide();
  writePidFile();
  if (!isAutostartRegistered()) {
    registerAutostart();
  }
  createTray();
  win = createWindow();
  registerIpcHandlers();
  electron.ipcMain.on("win:minimize", () => win == null ? void 0 : win.minimize());
  electron.ipcMain.on("win:maximize", () => {
    if (win == null ? void 0 : win.isMaximized()) win.unmaximize();
    else win == null ? void 0 : win.maximize();
  });
  electron.ipcMain.on("win:close", () => win == null ? void 0 : win.close());
  configWatcher.on("modelChanged", (model) => {
    console.log("[Lens/Main] modelChanged event:", { hasModel: !!model, defaultLayer: model == null ? void 0 : model.defaultLayer });
    currentModel = model;
    activeLayer = model.defaultLayer;
    pushModel(model);
    pushActiveLayer(activeLayer);
  });
  hidListener.on("layer-change", ({ layer }) => {
    console.log(`[HID] layer-change received: layer=${layer}`);
    onLayerChange(layer);
    const defaultLayer = (currentModel == null ? void 0 : currentModel.defaultLayer) ?? 0;
    if (layer === defaultLayer) {
      onLayerChangeRelease();
    } else {
      onLayerChangeAutoShow();
    }
  });
  hidListener.on("overlay", ({ eventType }) => {
    const eventNames = {
      [OVERLAY_EVENT_RELEASE]: "RELEASE",
      [OVERLAY_EVENT_TAP]: "TAP",
      [OVERLAY_EVENT_HOLD]: "HOLD",
      [OVERLAY_EVENT_DOUBLE_TAP]: "DOUBLE_TAP"
    };
    const eventName = eventNames[eventType] || `UNKNOWN(0x${eventType.toString(16)})`;
    console.log(`[Lens/Main] Overlay event received: ${eventName} (0x${eventType.toString(16)})`);
    if (eventType === OVERLAY_EVENT_TAP) {
      console.log("[Lens/Main] → TAP event (from OVERLAY_KEY or OVERLAY_TAP)");
      onOverlayTapAction();
    } else if (eventType === OVERLAY_EVENT_HOLD) {
      console.log("[Lens/Main] → HOLD event (from OVERLAY_KEY or OVERLAY_HOLD)");
      onOverlayHoldStart();
    } else if (eventType === OVERLAY_EVENT_RELEASE) {
      console.log("[Lens/Main] → RELEASE event (key released)");
      onOverlayHoldEnd();
    } else if (eventType === OVERLAY_EVENT_DOUBLE_TAP) {
      console.log("[Lens/Main] → DOUBLE_TAP event ignored (double-tap action removed)");
    } else {
      console.log(`[Lens/Main] → Unknown overlay event: 0x${eventType.toString(16)}`);
    }
  });
  hidListener.on("overlay-tap", ({ eventType }) => {
    const eventNames = {
      [OVERLAY_EVENT_RELEASE]: "RELEASE",
      [OVERLAY_EVENT_TAP]: "TAP",
      [OVERLAY_EVENT_HOLD]: "HOLD"
    };
    const eventName = eventNames[eventType] || `UNKNOWN(0x${eventType.toString(16)})`;
    console.log(`[Lens/Main] OVERLAY_TAP key event: ${eventName} (0x${eventType.toString(16)})`);
    if (eventType === OVERLAY_EVENT_TAP) {
      onOverlayTapAction();
    }
  });
  hidListener.on("overlay-hold", ({ eventType }) => {
    const eventNames = {
      [OVERLAY_EVENT_RELEASE]: "RELEASE",
      [OVERLAY_EVENT_TAP]: "TAP",
      [OVERLAY_EVENT_HOLD]: "HOLD"
    };
    const eventName = eventNames[eventType] || `UNKNOWN(0x${eventType.toString(16)})`;
    console.log(`[Lens/Main] OVERLAY_HOLD key event: ${eventName} (0x${eventType.toString(16)})`);
    if (eventType === OVERLAY_EVENT_HOLD) {
      onOverlayHoldStart();
    } else if (eventType === OVERLAY_EVENT_RELEASE) {
      onOverlayHoldEnd();
    }
  });
  electron.globalShortcut.register("CommandOrControl+Alt+L", () => toggleOverlay());
  const settingsFileWatcher = chokidar.watch(STORE_PATH, { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 100 } });
  settingsFileWatcher.on("change", () => {
    const prev = store.get();
    const next = store.reload();
    console.log("[Lens/Main] Settings file changed:", { prevHover: prev.hoverMode, nextHover: next.hoverMode, prevOpacity: prev.opacity, nextOpacity: next.opacity });
    pushSettings();
    if (winAlive() && overlayActive) {
      if (prev.opacity !== next.opacity) {
        console.log(`[Lens/Main] Opacity changed: ${prev.opacity} → ${next.opacity}`);
        win.setOpacity(next.opacity);
      }
      if (prev.hoverMode !== next.hoverMode) {
        console.log(`[Lens/Main] Hover mode changed: ${prev.hoverMode} → ${next.hoverMode}`);
        win.setIgnoreMouseEvents(!next.hoverMode, { forward: true });
        setTimeout(() => {
          if (winAlive()) {
            console.log("[Lens/Main] Executing syncHoverModeClass after 50ms delay");
            win.webContents.executeJavaScript(syncHoverModeClass(next.hoverMode)).catch(() => {
            });
          }
        }, 50);
      }
    }
  });
  await configWatcher.start();
  await hidListener.start().catch(() => {
  });
  electron.app.on("activate", () => {
    if (!win) win = createWindow();
    else win.show();
  });
});
electron.app.on("window-all-closed", () => {
});
electron.app.on("will-quit", async () => {
  removePidFile();
  electron.globalShortcut.unregisterAll();
  clearLayerChangeHideTimer();
  stopFade();
  hidListener.stop();
  await configWatcher.stop();
});
