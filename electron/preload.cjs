const { contextBridge, ipcRenderer, webFrame } = require("electron");

const { CHANNELS } = require("./main/ipc-channels.cjs");

contextBridge.exposeInMainWorld("desktopBridge", {
  isDesktop: true,
  checkForUpdates() {
    return ipcRenderer.invoke(CHANNELS["desktop:check-for-updates"]);
  },
  onUpdateAvailable(listener) {
    const wrapped = (_event, info) => listener(info);
    ipcRenderer.on(CHANNELS["desktop:update-available"], wrapped);
    return () => {
      ipcRenderer.removeListener(CHANNELS["desktop:update-available"], wrapped);
    };
  },
  onUpdateReady(listener) {
    const wrapped = (_event, info) => listener(info);
    ipcRenderer.on(CHANNELS["desktop:update-ready"], wrapped);
    return () => {
      ipcRenderer.removeListener(CHANNELS["desktop:update-ready"], wrapped);
    };
  },
  onUpdateNotAvailable(listener) {
    const wrapped = () => listener();
    ipcRenderer.on(CHANNELS["desktop:update-not-available"], wrapped);
    return () => {
      ipcRenderer.removeListener(CHANNELS["desktop:update-not-available"], wrapped);
    };
  },
  onUpdateError(listener) {
    const wrapped = (_event, info) => listener(info);
    ipcRenderer.on(CHANNELS["desktop:update-error"], wrapped);
    return () => {
      ipcRenderer.removeListener(CHANNELS["desktop:update-error"], wrapped);
    };
  },
  onUpdateDownloadProgress(listener) {
    const wrapped = (_event, progress) => listener(progress);
    ipcRenderer.on(CHANNELS["desktop:update-download-progress"], wrapped);
    return () => {
      ipcRenderer.removeListener(CHANNELS["desktop:update-download-progress"], wrapped);
    };
  },
  installUpdate() {
    return ipcRenderer.invoke(CHANNELS["desktop:install-update"]);
  },
  simulateUpdate() {
    return ipcRenderer.invoke(CHANNELS["desktop:simulate-update"]);
  },
  startDragFiles(fileIds) {
    ipcRenderer.send(CHANNELS["desktop:start-drag-file"], { fileIds });
  },
  revealInExplorer(fileId) {
    return ipcRenderer.invoke(CHANNELS["desktop:reveal-in-explorer"], fileId);
  },
  revealPath(path) {
    return ipcRenderer.invoke(CHANNELS["desktop:reveal-path"], path);
  },
  openFileExternally(fileId) {
    return ipcRenderer.invoke(CHANNELS["desktop:open-file-externally"], fileId);
  },
  setZoomFactor(factor) {
    webFrame.setZoomFactor(factor);
  },
  copyFilePath(fileId) {
    return ipcRenderer.invoke(CHANNELS["desktop:copy-file-path"], fileId);
  },
  pickFolder() {
    return ipcRenderer.invoke(CHANNELS["desktop:pick-folder"]);
  },
  minimizeWindow() {
    return ipcRenderer.invoke(CHANNELS["desktop:window-minimize"]);
  },
  toggleMaximizeWindow() {
    return ipcRenderer.invoke(CHANNELS["desktop:window-toggle-maximize"]);
  },
  closeWindow() {
    return ipcRenderer.invoke(CHANNELS["desktop:window-close"]);
  },
  getWindowState() {
    return ipcRenderer.invoke(CHANNELS["desktop:get-window-state"]);
  },
  onActionError(listener) {
    const wrapped = (_event, message) => listener(message);
    ipcRenderer.on(CHANNELS["desktop:action-error"], wrapped);
    return () => {
      ipcRenderer.removeListener(CHANNELS["desktop:action-error"], wrapped);
    };
  },
  onWindowState(listener) {
    const wrapped = (_event, state) => listener(state);
    ipcRenderer.on(CHANNELS["desktop:window-state"], wrapped);
    return () => {
      ipcRenderer.removeListener(CHANNELS["desktop:window-state"], wrapped);
    };
  },
});
