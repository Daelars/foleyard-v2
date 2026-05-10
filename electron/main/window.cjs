const path = require("path");

const { app, BrowserWindow } = require("electron");

const { DEV_SERVER_URL } = require("./constants.cjs");
const { appendDesktopLog } = require("./errors.cjs");

function readPackageMetadata() {
  try {
    return require(path.join(app.getAppPath(), "package.json"));
  } catch {
    return {};
  }
}

function shouldOpenDevTools() {
  const metadata = readPackageMetadata();
  return (
    process.env.FOLEYARD_OPEN_DEVTOOLS === "1" ||
    metadata.foleyardOpenDevTools === true
  );
}

function createMainWindow(startUrl, onClosed) {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: "#0a0a0c",
    autoHideMenuBar: true,
    frame: false,
    titleBarStyle: "hidden",
    webPreferences: {
      preload: path.join(__dirname, "../preload.cjs"),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
      devTools: true,
    },
  });

  void mainWindow.loadURL(startUrl ?? DEV_SERVER_URL).catch((error) => {
    appendDesktopLog(
      `Window load failed for ${startUrl ?? DEV_SERVER_URL}\n${error.stack ?? error.message}`,
    );
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.on("before-input-event", (event, input) => {
    const isToggleDevTools =
      input.key === "F12" ||
      (input.key.toLowerCase() === "i" && input.control && input.shift);

    if (isToggleDevTools) {
      event.preventDefault();
      mainWindow.webContents.toggleDevTools();
    }
  });

  const emitWindowState = () => {
    mainWindow.webContents.send("desktop:window-state", {
      isMaximized: mainWindow.isMaximized(),
    });
  };

  mainWindow.on("maximize", emitWindowState);
  mainWindow.on("unmaximize", emitWindowState);
  mainWindow.on("enter-full-screen", emitWindowState);
  mainWindow.on("leave-full-screen", emitWindowState);
  mainWindow.webContents.on("did-finish-load", emitWindowState);
  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL) => {
      appendDesktopLog(
        `Window did-fail-load ${errorCode} ${errorDescription}: ${validatedURL}`,
      );
    },
  );
  mainWindow.webContents.once("did-finish-load", () => {
    if (shouldOpenDevTools()) {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  });
  mainWindow.on("closed", onClosed);

  return mainWindow;
}

module.exports = {
  createMainWindow,
};
