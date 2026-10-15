const { app, ipcMain } = require("electron");

const { CHANNELS } = require("./ipc-channels.cjs");

const { checkForUpdates, quitAndInstall, simulateUpdate } = require("./auto-updater.cjs");
const {
  copyFilePath,
  grantDirectoryPath,
  openFileExternally,
  revealPath,
  revealInExplorer,
  startDragFile,
} = require("./desktop-service.cjs");
const { appendDesktopLog, reportMainProcessError } = require("./errors.cjs");
const { describeUntrustedSender } = require("./window-policy.cjs");

/** Why this IPC event may not use native authority, or null when it may. */
function rejectUntrustedSender(event) {
  const reason = describeUntrustedSender(event);
  if (!reason) {
    return null;
  }

  appendDesktopLog(`Refused Desktop IPC from an untrusted sender: ${reason}`);
  return reason;
}

/**
 * Every handler answers only the trusted desktop document. A rejected invoke
 * is a uniform `{ ok: false }`; the sender never learns whether the channel
 * exists or what it would have done (#262).
 */
function guardIpcHandler(handler) {
  return async (event, ...args) => {
    const reason = rejectUntrustedSender(event);
    if (reason) {
      return { ok: false, error: reason };
    }

    return handler(event, ...args);
  };
}

function registerIpcHandlers() {
  ipcMain.on(CHANNELS["desktop:start-drag-file"], async (event, payload) => {
    if (rejectUntrustedSender(event)) {
      return;
    }

    try {
      await startDragFile(event, payload);
    } catch (error) {
      reportMainProcessError(error);
    }
  });

  ipcMain.handle(
    CHANNELS["desktop:copy-file-path"],
    guardIpcHandler(async (_event, fileId) => copyFilePath(fileId)),
  );
  ipcMain.handle(
    CHANNELS["desktop:pick-folder"],
    guardIpcHandler(async (_event, purpose) => {
      const { dialog } = require("electron");
      const result = await dialog.showOpenDialog({
        properties: ["openDirectory"],
      });
      if (result.canceled || !result.filePaths.length) {
        return { ok: false, error: "No folder selected" };
      }
      return await grantDirectoryPath(result.filePaths[0], purpose);
    }),
  );
  ipcMain.handle(
    CHANNELS["desktop:reveal-in-explorer"],
    guardIpcHandler(async (_event, fileId) => revealInExplorer(fileId)),
  );
  ipcMain.handle(
    CHANNELS["desktop:reveal-path"],
    guardIpcHandler(async (_event, path) => revealPath(path)),
  );
  ipcMain.handle(
    CHANNELS["desktop:open-file-externally"],
    guardIpcHandler(async (_event, fileId) => openFileExternally(fileId)),
  );
  ipcMain.handle(
    CHANNELS["desktop:window-minimize"],
    guardIpcHandler(async (event) => {
      event.sender.getOwnerBrowserWindow()?.minimize();
      return { ok: true };
    }),
  );
  ipcMain.handle(
    CHANNELS["desktop:window-toggle-maximize"],
    guardIpcHandler(async (event) => {
      const window = event.sender.getOwnerBrowserWindow();
      if (!window) {
        return { ok: false };
      }

      if (window.isMaximized()) {
        window.unmaximize();
      } else {
        window.maximize();
      }

      return { ok: true, isMaximized: window.isMaximized() };
    }),
  );
  ipcMain.handle(
    CHANNELS["desktop:window-close"],
    guardIpcHandler(async (event) => {
      event.sender.getOwnerBrowserWindow()?.close();
      return { ok: true };
    }),
  );
  ipcMain.handle(
    CHANNELS["desktop:get-window-state"],
    guardIpcHandler(async (event) => {
      const window = event.sender.getOwnerBrowserWindow();
      return {
        isMaximized: window?.isMaximized() ?? false,
      };
    }),
  );
  ipcMain.handle(
    CHANNELS["desktop:get-runtime-info"],
    guardIpcHandler(async () => {
      const { getDesktopIdentity } = require("./runtime-info.cjs");
      return getDesktopIdentity();
    }),
  );
  ipcMain.handle(
    CHANNELS["desktop:check-for-updates"],
    guardIpcHandler(async () => {
      checkForUpdates();
      return { ok: true };
    }),
  );
  ipcMain.handle(
    CHANNELS["desktop:install-update"],
    guardIpcHandler(async () => {
      quitAndInstall();
      return { ok: true };
    }),
  );
  // Dev-only: the update simulator is never registered in the packaged app,
  // so the fake-update endpoint is unreachable outside development.
  if (!app.isPackaged) {
    ipcMain.handle(
      CHANNELS["desktop:simulate-update"],
      guardIpcHandler(async () => {
        simulateUpdate();
        return { ok: true };
      }),
    );
  }
}

module.exports = {
  registerIpcHandlers,
};
