/**
 * Desktop-owned runtime identity.
 * Electron main owns desktop identity, installed IPC handlers and resource
 * locations. No generic invoke-anything IPC is added.
 */
const { app } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

function readBuildId(appPath) {
  try {
    const candidate = path.join(appPath, ".next", "BUILD_ID");
    if (fs.existsSync(candidate)) {
      const raw = fs.readFileSync(candidate, "utf8").trim();
      return raw || null;
    }
  } catch {
    // absence is explicit
  }
  return null;
}

function getInstalledChannels() {
  try {
    const { CHANNEL_SPECS } = require("./ipc-channels.cjs");
    const { ipcMain } = require("electron");
    return Object.keys(CHANNEL_SPECS).filter((name) => {
      if (name === "desktop:simulate-update" && app.isPackaged) return false;
      // _eventsCount is internal; use listenerCount via EventEmitter API
      try {
        return (
          ipcMain.listenerCount(name) > 0 ||
          (ipcMain._invokeHandlers && ipcMain._invokeHandlers.has(name))
        );
      } catch {
        return true;
      }
    });
  } catch {
    return [];
  }
}

function getDesktopIdentity() {
  const appPath = app.getAppPath();
  let version = null;
  try {
    version = app.getVersion();
  } catch {
    version = null;
  }
  return {
    owner: "desktop",
    platform: process.platform,
    packaged: app.isPackaged,
    version,
    buildId: readBuildId(appPath),
    resourcesPath: process.resourcesPath || null,
    docsRoot: (() => {
      try {
        const candidate = path.join(process.resourcesPath || "", "foleyard-docs");
        return fs.existsSync(candidate) ? candidate : null;
      } catch {
        return null;
      }
    })(),
    installedChannels: getInstalledChannels(),
  };
}

module.exports = { getDesktopIdentity };
