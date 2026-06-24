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
const os = require("os");
const events = require("events");
const fs = require("fs");
const glob = require("glob");
const SONSEI_VENDOR_ID = 13807;
const SONSEI_PRODUCT_ID = 49;
const SONSEI_KEYS_PER_LAYER = 60;
const SONSEI_COLOR_LAYER_SIZE = 56;
const LENS_CONFIG_PATH_SEGMENTS = [".lens", "lens-config.json"];
const OVERLAY_MAGIC_BYTE = 170;
const OVERLAY_PACKET_SIZE = 5;
const PACKET_TYPE_OVERLAY = 1;
const PACKET_TYPE_LAYER = 2;
const OVERLAY_EVENT_TAP = 1;
const OVERLAY_EVENT_HOLD = 2;
const OVERLAY_EVENT_DOUBLE_TAP = 3;
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
  for (let i = 0; i < nums.length; i += ACTIONS_PER_SUPERKEY) {
    const chunk = nums.slice(i, i + ACTIONS_PER_SUPERKEY);
    if (chunk.every((n) => n === 0)) break;
    out.push(chunk);
  }
  return out;
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
  const backup = JSON.parse(backupRaw);
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
    superkeys: parseSuperkeys(superkeysRaw)
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
    const chokidar = await import("chokidar");
    this.watcher = chokidar.watch(LENS_CONFIG_PATH, {
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
    const chokidar = await import("chokidar");
    if (this.backupWatcher) {
      await this.backupWatcher.close();
      this.backupWatcher = null;
    }
    const backupDir = path.join(config.keyboard.backupFolder, config.keyboard.product, config.keyboard.neuronID);
    this.backupWatcher = chokidar.watch(`${backupDir}/*.json`, {
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
class RawHidListener extends events.EventEmitter {
  constructor() {
    super(...arguments);
    __publicField(this, "device", null);
    __publicField(this, "running", false);
  }
  async start() {
    try {
      const HID = await import("node-hid");
      const devices = HID.devices();
      const target = devices.find(
        (d) => d.vendorId === SONSEI_VENDOR_ID && d.productId === SONSEI_PRODUCT_ID && d.usagePage === 65280 && d.usage === 1
      );
      if (!target || !target.path) {
        return;
      }
      this.device = new HID.HID(target.path);
      this.running = true;
      this.emit("connected");
      this.device.on("data", (buf) => this.onData(buf));
      this.device.on("error", () => {
        this.device = null;
        this.running = false;
        this.emit("disconnected");
      });
    } catch {
    }
  }
  onData(buf) {
    if (buf.length < OVERLAY_PACKET_SIZE) return;
    if (buf[0] !== OVERLAY_MAGIC_BYTE) return;
    const packetType = buf[1];
    if (packetType === PACKET_TYPE_OVERLAY) {
      this.emit("overlay", { type: "overlay", eventType: buf[2] });
    } else if (packetType === PACKET_TYPE_LAYER) {
      this.emit("layer-change", { type: "layer", layer: buf[2] });
    }
  }
  stop() {
    var _a;
    this.running = false;
    try {
      (_a = this.device) == null ? void 0 : _a.close();
    } catch {
    }
    this.device = null;
  }
}
class SerialListener extends events.EventEmitter {
  constructor() {
    super(...arguments);
    __publicField(this, "port", null);
    __publicField(this, "lineBuf", "");
  }
  async start() {
    try {
      const { SerialPort } = await import("serialport");
      const ports = await SerialPort.list();
      const vidHex = SONSEI_VENDOR_ID.toString(16).padStart(4, "0");
      const target = ports.find(
        (p) => {
          var _a;
          return ((_a = p.vendorId) == null ? void 0 : _a.toLowerCase()) === vidHex;
        }
      );
      if (!target) {
        console.log("[SerialListener] Sonsei not found on any serial port");
        return;
      }
      console.log("[SerialListener] connecting to", target.path);
      this.port = new SerialPort({
        path: target.path,
        baudRate: 115200,
        autoOpen: false
      });
      this.port.on("data", (chunk) => {
        this.lineBuf += chunk.toString();
        let nl = this.lineBuf.indexOf("\n");
        while (nl >= 0) {
          const line = this.lineBuf.slice(0, nl).replace(/\r$/, "");
          this.lineBuf = this.lineBuf.slice(nl + 1);
          this.handleLine(line);
          nl = this.lineBuf.indexOf("\n");
        }
      });
      this.port.on("close", () => {
        console.log("[SerialListener] disconnected");
        this.port = null;
        this.lineBuf = "";
        this.emit("disconnected");
      });
      this.port.on("error", (err) => {
        var _a;
        console.log("[SerialListener] error:", err.message);
        try {
          (_a = this.port) == null ? void 0 : _a.close();
        } catch {
        }
        this.port = null;
        this.lineBuf = "";
        this.emit("disconnected");
      });
      await new Promise((resolve, reject) => {
        this.port.open((err) => err ? reject(err) : resolve());
      });
      console.log("[SerialListener] connected to", target.path);
      this.emit("connected");
    } catch (err) {
      console.log("[SerialListener] not available:", err.message);
    }
  }
  handleLine(line) {
    if (!line.startsWith("overlay_layer:")) return;
    const layer = Number.parseInt(line.slice("overlay_layer:".length), 10);
    if (!Number.isNaN(layer)) {
      console.log("[SerialListener] layer-change:", layer);
      this.emit("layer-change", { type: "layer", layer });
    }
  }
  stop() {
    var _a;
    try {
      (_a = this.port) == null ? void 0 : _a.close();
    } catch {
    }
    this.port = null;
    this.lineBuf = "";
  }
}
const STORE_PATH = path.join(os.homedir(), ".lens", "settings.json");
const DEFAULTS = {
  opacity: 1,
  alwaysOnTop: true,
  showUnderglow: false,
  layout: "us",
  layerNames: [],
  overlayMode: false,
  overlayAutoShow: true
};
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
function sanitize(s) {
  return {
    opacity: clamp(typeof s.opacity === "number" ? s.opacity : DEFAULTS.opacity, 0.1, 1),
    alwaysOnTop: typeof s.alwaysOnTop === "boolean" ? s.alwaysOnTop : DEFAULTS.alwaysOnTop,
    showUnderglow: typeof s.showUnderglow === "boolean" ? s.showUnderglow : DEFAULTS.showUnderglow,
    layout: typeof s.layout === "string" ? s.layout : DEFAULTS.layout,
    layerNames: Array.isArray(s.layerNames) ? s.layerNames : DEFAULTS.layerNames,
    overlayMode: typeof s.overlayMode === "boolean" ? s.overlayMode : DEFAULTS.overlayMode,
    overlayAutoShow: typeof s.overlayAutoShow === "boolean" ? s.overlayAutoShow : DEFAULTS.overlayAutoShow
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
  set(updates) {
    this.data = sanitize({ ...this.data, ...updates });
    this.save();
    return this.get();
  }
}
let win = null;
let overlayActive = false;
let currentModel = null;
let activeLayer = 0;
const store = new SettingsStore();
const configWatcher = new ConfigWatcher();
const hidListener = new RawHidListener();
const serialListener = new SerialListener();
function createWindow() {
  const settings = store.get();
  const { width, height } = electron.screen.getPrimaryDisplay().workAreaSize;
  const w = new electron.BrowserWindow({
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
      nodeIntegration: false
    }
  });
  {
    w.loadURL("http://localhost:5173");
  }
  w.once("ready-to-show", () => {
    w.show();
    pushState();
    pushSettings();
  });
  return w;
}
function pushModel(model) {
  win == null ? void 0 : win.webContents.send("lens:model", model);
}
function pushActiveLayer(layer) {
  win == null ? void 0 : win.webContents.send("lens:active-layer", layer);
}
function pushSettings() {
  win == null ? void 0 : win.webContents.send("lens:settings", store.get());
}
function pushState() {
  const state = {
    model: currentModel,
    activeLayer,
    configFound: configWatcher.getCurrentConfig() !== null
  };
  win == null ? void 0 : win.webContents.send("lens:state", state);
}
function applyOverlayMode(enabled) {
  if (!win) return;
  const settings = store.get();
  if (enabled) {
    win.setOpacity(settings.opacity);
    win.setAlwaysOnTop(true, "screen-saver");
    win.setIgnoreMouseEvents(true, { forward: true });
    win.webContents.executeJavaScript(`document.body.classList.add('overlay')`);
  } else {
    win.setOpacity(1);
    win.setAlwaysOnTop(settings.alwaysOnTop);
    win.setIgnoreMouseEvents(false);
    win.webContents.executeJavaScript(`document.body.classList.remove('overlay')`);
  }
}
function showOverlay() {
  if (!win) return;
  const settings = store.get();
  if (settings.overlayMode) applyOverlayMode(true);
  win.show();
}
function toggleOverlay() {
  if (!win) return;
  if (overlayActive) {
    overlayActive = false;
    applyOverlayMode(false);
    win.hide();
  } else {
    overlayActive = true;
    applyOverlayMode(true);
    win.show();
  }
}
function onLayerChange(layer) {
  activeLayer = layer;
  pushActiveLayer(layer);
  const settings = store.get();
  if (settings.overlayAutoShow && settings.overlayMode) {
    showOverlay();
  }
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
    win == null ? void 0 : win.setOpacity(v);
    return s;
  });
  electron.ipcMain.handle("lens:set-always-on-top", (_, v) => {
    const s = store.set({ alwaysOnTop: v });
    if (!store.get().overlayMode) win == null ? void 0 : win.setAlwaysOnTop(v);
    return s;
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
  electron.Menu.setApplicationMenu(null);
  win = createWindow();
  registerIpcHandlers();
  electron.ipcMain.on("win:minimize", () => win == null ? void 0 : win.minimize());
  electron.ipcMain.on("win:maximize", () => {
    if (win == null ? void 0 : win.isMaximized()) win.unmaximize();
    else win == null ? void 0 : win.maximize();
  });
  electron.ipcMain.on("win:close", () => win == null ? void 0 : win.close());
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
  electron.globalShortcut.register("CommandOrControl+Alt+L", () => toggleOverlay());
  await configWatcher.start();
  await hidListener.start().catch(() => {
  });
  await serialListener.start();
  electron.app.on("activate", () => {
    if (!win) win = createWindow();
    else win.show();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
electron.app.on("will-quit", async () => {
  electron.globalShortcut.unregisterAll();
  hidListener.stop();
  await configWatcher.stop();
});
