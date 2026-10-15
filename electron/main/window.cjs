const path = require("path");

const { app, BrowserWindow } = require("electron");

const { DEV_SERVER_URL } = require("./constants.cjs");
const { CHANNELS } = require("./ipc-channels.cjs");
const { appendDesktopLog, reportMainProcessError } = require("./errors.cjs");
const {
  installNavigationPolicy,
  installPermissionPolicy,
  setDesktopWindow,
} = require("./window-policy.cjs");

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

/**
 * The trusted document never loaded, so the window would linger blank while
 * still holding the desktop preload. Reported once, loudly, then the process
 * terminates (docs/architecture/desktop.md "Failure behavior").
 */
function reportLoadFailure(target, detail) {
  reportMainProcessError(
    new Error(`Foleyard desktop window failed to load ${target}: ${detail}`),
    { fatal: true },
  );
}

function createMainWindow(startUrl, onClosed) {
  const enableDevTools = !app.isPackaged || shouldOpenDevTools();
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1080,
    minHeight: 720,
    icon: path.join(app.getAppPath(), "icon.png"),
    backgroundColor: "#0a0a0c",
    autoHideMenuBar: true,
    frame: false,
    titleBarStyle: "hidden",
    webPreferences: {
      preload: path.join(__dirname, "../preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      devTools: enableDevTools,
    },
  });

  const loadTarget = startUrl ?? DEV_SERVER_URL;

  // The window owns the privileged preload, so it is the only trusted
  // document: navigation, child windows, permission requests and IPC senders
  // are pinned to it before anything loads (#262).
  setDesktopWindow(mainWindow);
  installNavigationPolicy(mainWindow.webContents);
  installPermissionPolicy(mainWindow.webContents.session);

  void mainWindow.loadURL(loadTarget).catch((error) => {
    reportLoadFailure(loadTarget, error instanceof Error ? error.message : String(error));
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.on("before-input-event", (event, input) => {
    const isToggleDevTools =
      input.key === "F12" ||
      (input.key.toLowerCase() === "i" && input.control && input.shift);

    if (enableDevTools && isToggleDevTools) {
      event.preventDefault();
      mainWindow.webContents.toggleDevTools();
    }
  });

  const emitWindowState = () => {
    mainWindow.webContents.send(CHANNELS["desktop:window-state"], {
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
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (isMainFrame === false) {
        appendDesktopLog(
          `Window did-fail-load ${errorCode} ${errorDescription}: ${validatedURL}`,
        );
        return;
      }

      // ERR_ABORTED: a superseded or cancelled load, normal during reload and
      // dev iteration. Everything else means the trusted document never loaded.
      if (errorCode === -3) {
        appendDesktopLog(`Window load aborted (${errorDescription}): ${validatedURL}`);
        return;
      }

      reportLoadFailure(validatedURL, `${errorDescription} (${errorCode})`);
    },
  );
  mainWindow.webContents.once("did-finish-load", () => {
    if (enableDevTools && shouldOpenDevTools()) {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  });
  mainWindow.on("closed", () => {
    setDesktopWindow(null);
    onClosed();
  });

  return mainWindow;
}

module.exports = {
  createMainWindow,
};
