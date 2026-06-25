import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { globSync } from "glob";
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    name: "Dygma Lens",
    executableName: "dygma-lens",
    icon: "./src/static/Logo",
    appBundleId: "com.dygmalab.lens",
    // Only sign when an Apple signing identity is present (set in GitHub Actions secrets).
    // Without this, node-hid fails on macOS because the native .node addon is blocked
    // by Hardened Runtime. The USB entitlement is required for HID device access.
    ...(process.env.APPLE_IDENTITY
      ? {
          osxSign: {
            identity: process.env.APPLE_IDENTITY,
            entitlements: "entitlements.mac.plist",
            entitlementsInherit: "entitlements.mac.plist",
            hardenedRuntime: true,
          },
          ...(process.env.APPLE_ID
            ? {
                osxNotarize: {
                  appleId: process.env.APPLE_ID,
                  appleIdPassword: process.env.APPLE_ID_PASSWORD!,
                  teamId: process.env.APPLE_TEAM_ID!,
                },
              }
            : {}),
        }
      : {}),
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      name: "dygma-lens",
    }),
    new MakerZIP({}, ["darwin"]),
    {
      name: "@electron-forge/maker-dmg",
      config: {},
    },
    {
      name: "@reforged/maker-appimage",
      config: {
        options: {
          bin: "dygma-lens",
          categories: ["Utility"],
        },
      },
    },
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: "src/main/index.ts",
          config: "vite.main.config.ts",
          target: "main",
        },
        {
          entry: "src/main/preload.ts",
          config: "vite.preload.config.ts",
          target: "preload",
        },
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.ts",
        },
      ],
    }),
  ],
  hooks: {
    packageAfterPrune: async (_forgeConfig, buildPath, _electronVersion, platform, _arch) => {
      const packageJson = JSON.parse(fs.readFileSync(path.resolve(buildPath, "package.json")).toString());
      packageJson.dependencies = {
        "node-hid": "^3.1.1",
        "chokidar": "^3.6.0",
        "glob": "^10.4.5",
      };
      fs.writeFileSync(path.resolve(buildPath, "package.json"), JSON.stringify(packageJson));
      spawnSync("npm", ["install", "--omit=dev"], {
        cwd: buildPath,
        stdio: "inherit",
        shell: true,
      });
      const prebuilds = globSync(`${buildPath}/**/prebuilds/*`);
      prebuilds.forEach(function (p) {
        if (!p.includes(platform)) {
          fs.rmSync(p, { recursive: true });
        }
      });
    },
  },
  publishers: [],
};

export default config;
