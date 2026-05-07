const path = require("path");

const { BrowserWindow } = require("electron");

const { DEV_SERVER_URL } = require("./constants.cjs");

function createMainWindow(onClosed) {
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
    },
  });

  if (process.env.ELECTRON_START_URL) {
    void mainWindow.loadURL(DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../../.next/server/index.html"));
  }

  mainWindow.setMenuBarVisibility(false);
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
  mainWindow.on("closed", onClosed);

  return mainWindow;
}

module.exports = {
  createMainWindow,
};
