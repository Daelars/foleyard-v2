/**
 * Desktop-owned runtime identity.
 * Electron main owns desktop identity, installed IPC handlers and
 * resource availability. Absolute install/user-data paths are reported as
 * presence booleans only (#307). No generic invoke-anything IPC is added.
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

/**
 * Build provenance written after `next build` (#241). The server runtime reads
 * the same file from FOLEYARD_APP_PATH, so both identities report one build id
 * and revision.
 */
function readBuildProvenance(appPath) {
  const result = { buildId: null, sourceRevision: null, sourceDirty: null };
  try {
    const candidate = path.join(appPath, ".next", "build-provenance.json");
    if (fs.existsSync(candidate)) {
      const parsed = JSON.parse(fs.readFileSync(candidate, "utf8"));
      if (typeof parsed.buildId === "string") result.buildId = parsed.buildId;
      if (typeof parsed.sourceRevision === "string") result.sourceRevision = parsed.sourceRevision;
      if (typeof parsed.sourceDirty === "boolean") result.sourceDirty = parsed.sourceDirty;
    }
  } catch {
    // absence is explicit
  }
  if (!result.buildId) result.buildId = readBuildId(appPath);
  return result;
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
  const provenance = readBuildProvenance(appPath);
  // Report only whether the install/resource locations exist. Absolute
  // resources/user-data paths belong to the operator's machine, not to a
  // diagnostic export (#307).
  const resourcesPath = process.resourcesPath || null;
  return {
    owner: "desktop",
    platform: process.platform,
    packaged: app.isPackaged,
    version,
    buildId: provenance.buildId,
    sourceRevision: provenance.sourceRevision,
    sourceDirty: provenance.sourceDirty,
    resourcesPresent: Boolean(resourcesPath),
    docsRootPresent: (() => {
      try {
        return Boolean(resourcesPath && fs.existsSync(path.join(resourcesPath, "foleyard-docs")));
      } catch {
        return false;
      }
    })(),
    installedChannels: getInstalledChannels(),
  };
}

module.exports = { getDesktopIdentity };
