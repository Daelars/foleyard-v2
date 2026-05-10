const { autoUpdater } = require("electron-updater");

const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

let mainWindow = null;

function setUpdateWindow(windowInstance) {
  mainWindow = windowInstance;
}

function initAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  if (!require("electron").app.isPackaged) {
    return;
  }
  autoUpdater.on("update-available", (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("desktop:update-available", {
        version: info.version,
        releaseDate: info.releaseDate,
      });
    }
  });

  autoUpdater.on("update-not-available", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("desktop:update-not-available");
    }
  });

  autoUpdater.on("download-progress", (progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("desktop:update-download-progress", {
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total,
      });
    }
  });

  autoUpdater.on("update-downloaded", (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("desktop:update-ready", {
        version: info.version,
        releaseDate: info.releaseDate,
      });
    }
  });

  autoUpdater.on("error", (error) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("desktop:update-error", {
        message: error.message,
      });
    }
  });

  checkForUpdates();
  setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL_MS);
}

function checkForUpdates() {
  try {
    autoUpdater.checkForUpdates().catch(() => {});
  } catch {}
}

function quitAndInstall() {
  autoUpdater.quitAndInstall();
}

function simulateUpdate() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send("desktop:update-available", {
    version: "0.2.0-dev",
    releaseDate: new Date().toISOString(),
  });

  setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    mainWindow.webContents.send("desktop:update-download-progress", {
      percent: 25,
      bytesPerSecond: 1024000,
      transferred: 256000,
      total: 1024000,
    });
  }, 500);

  setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    mainWindow.webContents.send("desktop:update-download-progress", {
      percent: 60,
      bytesPerSecond: 1024000,
      transferred: 614400,
      total: 1024000,
    });
  }, 1000);

  setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    mainWindow.webContents.send("desktop:update-download-progress", {
      percent: 100,
      bytesPerSecond: 1024000,
      transferred: 1024000,
      total: 1024000,
    });
  }, 1500);

  setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    mainWindow.webContents.send("desktop:update-ready", {
      version: "0.2.0-dev",
      releaseDate: new Date().toISOString(),
    });
  }, 2000);
}

module.exports = {
  initAutoUpdater,
  setUpdateWindow,
  checkForUpdates,
  quitAndInstall,
  simulateUpdate,
};
