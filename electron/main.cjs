const { app, BrowserWindow } = require("electron");

const { APP_NAME } = require("./main/constants.cjs");
const { ensureDesktopDatabaseInitialized, resetDesktopDatabaseForBuild } = require("./main/database.cjs");
const { appendDesktopLog, reportMainProcessError, setMainWindow } = require("./main/errors.cjs");
const { registerIpcHandlers } = require("./main/ipc.cjs");
const { startNextProductionServer } = require("./main/next-server.cjs");
const { createMainWindow } = require("./main/window.cjs");
const { initAutoUpdater, setUpdateWindow } = require("./main/auto-updater.cjs");

app.setName(APP_NAME);

let mainWindow = null;

async function openMainWindow() {
  const startUrl =
    process.env.ELECTRON_START_URL ?? (await startNextProductionServer());

  appendDesktopLog(`Opening main window: ${startUrl}`);
  mainWindow = createMainWindow(startUrl, () => {
    appendDesktopLog("Main window closed");
    mainWindow = null;
    setMainWindow(null);
  });
  setMainWindow(mainWindow);
  setUpdateWindow(mainWindow);
}

registerIpcHandlers();

app.whenReady().then(() => {
  appendDesktopLog("Electron app ready");
  resetDesktopDatabaseForBuild();
  ensureDesktopDatabaseInitialized();
  void openMainWindow().then(() => {
    initAutoUpdater();
  }).catch(reportMainProcessError);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void openMainWindow().catch(reportMainProcessError);
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

process.on("uncaughtException", (error) => {
  reportMainProcessError(error);
});
