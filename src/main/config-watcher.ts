import path from "path";
import os from "os";
import { EventEmitter } from "events";
import type { LensConfig, KeyboardModel } from "../shared/types";
import { LENS_CONFIG_PATH_SEGMENTS } from "../shared/constants";
import { readLensConfig, readLatestModel, findLatestBackup } from "./backup-reader";

export const LENS_CONFIG_PATH = path.join(os.homedir(), ...LENS_CONFIG_PATH_SEGMENTS);

type ConfigWatcherEvents = {
  configChanged: [config: LensConfig];
  modelChanged: [model: KeyboardModel];
  error: [err: Error];
};

export class ConfigWatcher extends EventEmitter<ConfigWatcherEvents> {
  private watcher: import("chokidar").FSWatcher | null = null;
  private backupWatcher: import("chokidar").FSWatcher | null = null;
  private currentConfig: LensConfig | null = null;

  async start(): Promise<void> {
    const chokidar = await import("chokidar");

    this.watcher = chokidar.watch(LENS_CONFIG_PATH, {
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 50 },
    });

    this.watcher.on("add", (p) => this.onConfigFile(p));
    this.watcher.on("change", (p) => this.onConfigFile(p));
  }

  private onConfigFile(filePath: string): void {
    const config = readLensConfig(filePath);
    if (!config) return;

    this.currentConfig = config;
    this.emit("configChanged", config);
    this.loadModel(config);
    this.watchBackupFolder(config);
  }

  private loadModel(config: LensConfig): void {
    const model = readLatestModel(config);
    if (model) this.emit("modelChanged", model);
  }

  private async watchBackupFolder(config: LensConfig): Promise<void> {
    const chokidar = await import("chokidar");

    if (this.backupWatcher) {
      await this.backupWatcher.close();
      this.backupWatcher = null;
    }

    const backupDir = path.join(config.keyboard.backupFolder, config.keyboard.product, config.keyboard.neuronID);

    this.backupWatcher = chokidar.watch(`${backupDir}/*.json`, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
    });

    this.backupWatcher.on("add", () => {
      if (this.currentConfig) this.loadModel(this.currentConfig);
    });
    this.backupWatcher.on("change", () => {
      if (this.currentConfig) this.loadModel(this.currentConfig);
    });
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    if (this.backupWatcher) {
      await this.backupWatcher.close();
      this.backupWatcher = null;
    }
  }

  getCurrentConfig(): LensConfig | null {
    return this.currentConfig;
  }
}
