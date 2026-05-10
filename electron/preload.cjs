const { contextBridge, ipcRenderer, webFrame } = require("electron");

contextBridge.exposeInMainWorld("desktopBridge", {
  isDesktop: true,
  checkForUpdates() {
    return ipcRenderer.invoke("desktop:check-for-updates");
  },
  onUpdateAvailable(listener) {
    const wrapped = (_event, info) => listener(info);
    ipcRenderer.on("desktop:update-available", wrapped);
    return () => {
      ipcRenderer.removeListener("desktop:update-available", wrapped);
    };
  },
  onUpdateReady(listener) {
    const wrapped = (_event, info) => listener(info);
    ipcRenderer.on("desktop:update-ready", wrapped);
    return () => {
      ipcRenderer.removeListener("desktop:update-ready", wrapped);
    };
  },
  onUpdateNotAvailable(listener) {
    const wrapped = (_event) => listener();
    ipcRenderer.on("desktop:update-not-available", wrapped);
    return () => {
      ipcRenderer.removeListener("desktop:update-not-available", wrapped);
    };
  },
  onUpdateError(listener) {
    const wrapped = (_event, info) => listener(info);
    ipcRenderer.on("desktop:update-error", wrapped);
    return () => {
      ipcRenderer.removeListener("desktop:update-error", wrapped);
    };
  },
  onUpdateDownloadProgress(listener) {
    const wrapped = (_event, progress) => listener(progress);
    ipcRenderer.on("desktop:update-download-progress", wrapped);
    return () => {
      ipcRenderer.removeListener("desktop:update-download-progress", wrapped);
    };
  },
  installUpdate() {
    return ipcRenderer.invoke("desktop:install-update");
  },
  simulateUpdate() {
    return ipcRenderer.invoke("desktop:simulate-update");
  },
  startDragFile(fileId, filePath) {
    ipcRenderer.send("desktop:start-drag-file", { fileId, filePath });
  },
  revealInExplorer(fileId) {
    return ipcRenderer.invoke("desktop:reveal-in-explorer", fileId);
  },
  revealPath(path) {
    return ipcRenderer.invoke("desktop:reveal-path", path);
  },
  openFileExternally(fileId) {
    return ipcRenderer.invoke("desktop:open-file-externally", fileId);
  },
  setZoomFactor(factor) {
    webFrame.setZoomFactor(factor);
  },
  copyFilePath(fileId) {
    return ipcRenderer.invoke("desktop:copy-file-path", fileId);
  },
  pickFolder() {
    return ipcRenderer.invoke("desktop:pick-folder");
  },
  minimizeWindow() {
    return ipcRenderer.invoke("desktop:window-minimize");
  },
  toggleMaximizeWindow() {
    return ipcRenderer.invoke("desktop:window-toggle-maximize");
  },
  closeWindow() {
    return ipcRenderer.invoke("desktop:window-close");
  },
  getWindowState() {
    return ipcRenderer.invoke("desktop:get-window-state");
  },
  onActionError(listener) {
    const wrapped = (_event, message) => listener(message);
    ipcRenderer.on("desktop:action-error", wrapped);
    return () => {
      ipcRenderer.removeListener("desktop:action-error", wrapped);
    };
  },
  onWindowState(listener) {
    const wrapped = (_event, state) => listener(state);
    ipcRenderer.on("desktop:window-state", wrapped);
    return () => {
      ipcRenderer.removeListener("desktop:window-state", wrapped);
    };
  },
});
