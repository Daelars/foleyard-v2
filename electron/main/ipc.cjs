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
const { reportMainProcessError } = require("./errors.cjs");

function registerIpcHandlers() {
  ipcMain.on(CHANNELS["desktop:start-drag-file"], async (event, payload) => {
    try {
      await startDragFile(event, payload);
    } catch (error) {
      reportMainProcessError(error);
    }
  });

  ipcMain.handle(CHANNELS["desktop:copy-file-path"], async (_event, fileId) =>
    copyFilePath(fileId),
  );
  ipcMain.handle(CHANNELS["desktop:pick-folder"], async () => {
    const { dialog } = require("electron");
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
    });
    if (result.canceled || !result.filePaths.length) {
      return { ok: false, error: "No folder selected" };
    }
    return await grantDirectoryPath(result.filePaths[0]);
  });
  ipcMain.handle(CHANNELS["desktop:reveal-in-explorer"], async (_event, fileId) =>
    revealInExplorer(fileId),
  );
  ipcMain.handle(CHANNELS["desktop:reveal-path"], async (_event, path) =>
    revealPath(path),
  );
  ipcMain.handle(CHANNELS["desktop:open-file-externally"], async (_event, fileId) =>
    openFileExternally(fileId),
  );
  ipcMain.handle(CHANNELS["desktop:window-minimize"], async (event) => {
    event.sender.getOwnerBrowserWindow()?.minimize();
    return { ok: true };
  });
  ipcMain.handle(CHANNELS["desktop:window-toggle-maximize"], async (event) => {
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
  });
  ipcMain.handle(CHANNELS["desktop:window-close"], async (event) => {
    event.sender.getOwnerBrowserWindow()?.close();
    return { ok: true };
  });
  ipcMain.handle(CHANNELS["desktop:get-window-state"], async (event) => {
    const window = event.sender.getOwnerBrowserWindow();
    return {
      isMaximized: window?.isMaximized() ?? false,
    };
  });
  ipcMain.handle(CHANNELS["desktop:get-runtime-info"], async () => {
    const { getDesktopIdentity } = require("./runtime-info.cjs");
    return getDesktopIdentity();
  });
  ipcMain.handle(CHANNELS["desktop:check-for-updates"], async () => {
    checkForUpdates();
    return { ok: true };
  });
  ipcMain.handle(CHANNELS["desktop:install-update"], async () => {
    quitAndInstall();
    return { ok: true };
  });
  // Dev-only: the update simulator is never registered in the packaged app,
  // so the fake-update endpoint is unreachable outside development.
  if (!app.isPackaged) {
    ipcMain.handle(CHANNELS["desktop:simulate-update"], async () => {
      simulateUpdate();
      return { ok: true };
    });
  }
}

module.exports = {
  registerIpcHandlers,
};
