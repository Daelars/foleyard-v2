const { ipcMain } = require("electron");

const { checkForUpdates, quitAndInstall, simulateUpdate } = require("./auto-updater.cjs");
const {
  copyFilePath,
  openFileExternally,
  revealInExplorer,
  startDragFile,
} = require("./desktop-service.cjs");
const { reportMainProcessError } = require("./errors.cjs");

function registerIpcHandlers() {
  ipcMain.on("desktop:start-drag-file", async (event, payload) => {
    try {
      await startDragFile(event, payload);
    } catch (error) {
      reportMainProcessError(error);
    }
  });

  ipcMain.handle("desktop:copy-file-path", async (_event, fileId) =>
    copyFilePath(fileId),
  );
  ipcMain.handle("desktop:pick-folder", async () => {
    const { dialog } = require("electron");
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
    });
    if (result.canceled || !result.filePaths.length) {
      return { ok: false, error: "No folder selected" };
    }
    return { ok: true, path: result.filePaths[0] };
  });
  ipcMain.handle("desktop:reveal-in-explorer", async (_event, fileId) =>
    revealInExplorer(fileId),
  );
  ipcMain.handle("desktop:reveal-path", async (_event, path) => {
    const { shell } = require("electron");
    shell.showItemInFolder(path);
    return { ok: true, path };
  });
  ipcMain.handle("desktop:open-file-externally", async (_event, fileId) =>
    openFileExternally(fileId),
  );
  ipcMain.handle("desktop:window-minimize", async (event) => {
    event.sender.getOwnerBrowserWindow()?.minimize();
    return { ok: true };
  });
  ipcMain.handle("desktop:window-toggle-maximize", async (event) => {
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
  ipcMain.handle("desktop:window-close", async (event) => {
    event.sender.getOwnerBrowserWindow()?.close();
    return { ok: true };
  });
  ipcMain.handle("desktop:get-window-state", async (event) => {
    const window = event.sender.getOwnerBrowserWindow();
    return {
      isMaximized: window?.isMaximized() ?? false,
    };
  });
  ipcMain.handle("desktop:check-for-updates", async () => {
    checkForUpdates();
    return { ok: true };
  });
  ipcMain.handle("desktop:install-update", async () => {
    quitAndInstall();
    return { ok: true };
  });
  ipcMain.handle("desktop:simulate-update", async () => {
    simulateUpdate();
    return { ok: true };
  });
}

module.exports = {
  registerIpcHandlers,
};
