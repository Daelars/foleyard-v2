const { ipcMain } = require("electron");

const {
  copyFilePath,
  openFileExternally,
  revealInExplorer,
  startDragFile,
} = require("./desktop-service.cjs");
const { reportMainProcessError } = require("./errors.cjs");

function registerIpcHandlers() {
  ipcMain.on("desktop:start-drag-file", (event, payload) => {
    try {
      startDragFile(event, payload);
    } catch (error) {
      reportMainProcessError(error);
    }
  });

  ipcMain.handle("desktop:copy-file-path", async (_event, fileId) =>
    copyFilePath(fileId),
  );
  ipcMain.handle("desktop:reveal-in-explorer", async (_event, fileId) =>
    revealInExplorer(fileId),
  );
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
}

module.exports = {
  registerIpcHandlers,
};
