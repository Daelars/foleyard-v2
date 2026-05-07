const { app, BrowserWindow } = require("electron");

const { APP_NAME } = require("./main/constants.cjs");
const { ensureDesktopDatabaseInitialized } = require("./main/database.cjs");
const { reportMainProcessError, setMainWindow } = require("./main/errors.cjs");
const { registerIpcHandlers } = require("./main/ipc.cjs");
const { createMainWindow } = require("./main/window.cjs");

app.setName(APP_NAME);

let mainWindow = null;

function openMainWindow() {
  mainWindow = createMainWindow(() => {
    mainWindow = null;
    setMainWindow(null);
  });
  setMainWindow(mainWindow);
}

registerIpcHandlers();

app.whenReady().then(() => {
  ensureDesktopDatabaseInitialized();
  openMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      openMainWindow();
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
