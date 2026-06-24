"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("lens", {
  onModel(cb) {
    const listener = (_, m) => cb(m);
    electron.ipcRenderer.on("lens:model", listener);
    return () => electron.ipcRenderer.removeListener("lens:model", listener);
  },
  onActiveLayer(cb) {
    const listener = (_, l) => cb(l);
    electron.ipcRenderer.on("lens:active-layer", listener);
    return () => electron.ipcRenderer.removeListener("lens:active-layer", listener);
  },
  onSettings(cb) {
    const listener = (_, s) => cb(s);
    electron.ipcRenderer.on("lens:settings", listener);
    return () => electron.ipcRenderer.removeListener("lens:settings", listener);
  },
  getState() {
    return electron.ipcRenderer.invoke("lens:get-state");
  },
  getSettings() {
    return electron.ipcRenderer.invoke("lens:get-settings");
  },
  setOpacity(v) {
    return electron.ipcRenderer.invoke("lens:set-opacity", v);
  },
  setAlwaysOnTop(v) {
    return electron.ipcRenderer.invoke("lens:set-always-on-top", v);
  },
  setShowUnderglow(v) {
    return electron.ipcRenderer.invoke("lens:set-show-underglow", v);
  },
  setLayout(v) {
    return electron.ipcRenderer.invoke("lens:set-layout", v);
  },
  setLayerName(layer, name) {
    return electron.ipcRenderer.invoke("lens:set-layer-name", layer, name);
  },
  setOverlay(v) {
    return electron.ipcRenderer.invoke("lens:set-overlay", v);
  },
  setOverlayAutoShow(v) {
    return electron.ipcRenderer.invoke("lens:set-overlay-auto-show", v);
  },
  winMinimize() {
    electron.ipcRenderer.send("win:minimize");
  },
  winMaximize() {
    electron.ipcRenderer.send("win:maximize");
  },
  winClose() {
    electron.ipcRenderer.send("win:close");
  }
});
