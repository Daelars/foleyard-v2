const { contextBridge, ipcRenderer, webFrame } = require("electron");

/**
 * Sandboxed preload scripts cannot require relative files, so the bridge
 * channel names are mirrored here instead of importing
 * ./main/ipc-channels.cjs. `desktop-ipc-contract.test.ts` asserts this list
 * equals the registry; update both together.
 */
const CHANNEL_NAMES = Object.freeze([
  "desktop:check-for-updates",
  "desktop:install-update",
  "desktop:simulate-update",
  "desktop:copy-file-path",
  "desktop:pick-folder",
  "desktop:reveal-in-explorer",
  "desktop:reveal-path",
  "desktop:open-file-externally",
  "desktop:window-minimize",
  "desktop:window-toggle-maximize",
  "desktop:window-close",
  "desktop:get-window-state",
  "desktop:get-runtime-info",
  "desktop:start-drag-file",
  "desktop:update-available",
  "desktop:update-ready",
  "desktop:update-not-available",
  "desktop:update-error",
  "desktop:update-download-progress",
  "desktop:action-error",
  "desktop:window-state",
]);

const CHANNELS = Object.freeze(
  Object.fromEntries(CHANNEL_NAMES.map((name) => [name, name])),
);

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
  getRuntimeInfo() {
    return ipcRenderer.invoke(CHANNELS["desktop:get-runtime-info"]);
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
