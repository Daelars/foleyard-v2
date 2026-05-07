const fs = require("fs");
const path = require("path");

const { dialog } = require("electron");

const { getDesktopUserDataDir } = require("./database.cjs");

let mainWindow = null;

function setMainWindow(windowInstance) {
  mainWindow = windowInstance;
}

function reportMainProcessError(error) {
  const message =
    error instanceof Error ? `${error.message}\n\n${error.stack ?? ""}` : String(error);

  try {
    const logPath = path.join(getDesktopUserDataDir(), "desktop-errors.log");
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `[${new Date().toISOString()}]\n${message}\n\n`);
  } catch {}

  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("desktop:action-error", message);
    }
  } catch {}

  dialog.showErrorBox("Main process error", message);
}

module.exports = {
  reportMainProcessError,
  setMainWindow,
};
