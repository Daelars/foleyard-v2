const fs = require("fs");
const path = require("path");

const { dialog } = require("electron");

const { getDesktopUserDataDir } = require("./database.cjs");

let mainWindow = null;
let errorDialogShown = false;

function setMainWindow(windowInstance) {
  mainWindow = windowInstance;
}

function appendDesktopLog(message) {
  try {
    const logPath = path.join(getDesktopUserDataDir(), "desktop-errors.log");
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `[${new Date().toISOString()}]\n${message}\n\n`);
  } catch {}
}

function showErrorDialogOnce(title, message) {
  if (errorDialogShown) {
    return;
  }

  errorDialogShown = true;

  try {
    dialog.showErrorBox(title, message);
  } catch {}
}

function terminateMainProcess(code) {
  try {
    const { app } = require("electron");
    if (app && typeof app.exit === "function") {
      app.exit(code);
      return;
    }
  } catch {}

  process.exit(code);
}

function reportMainProcessError(error, options = {}) {
  const { dialog: showDialog = true, fatal = false } = options;
  const message =
    error instanceof Error ? `${error.message}\n\n${error.stack ?? ""}` : String(error);

  appendDesktopLog(message);

  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("desktop:action-error", message);
    }
  } catch {}

  if (showDialog) {
    showErrorDialogOnce("Foleyard desktop error", message);
  }

  if (fatal) {
    terminateMainProcess(1);
  }
}

function resetMainProcessErrorState() {
  errorDialogShown = false;
}

module.exports = {
  appendDesktopLog,
  reportMainProcessError,
  resetMainProcessErrorState,
  setMainWindow,
};
