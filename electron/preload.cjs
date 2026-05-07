const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopBridge", {
  isDesktop: true,
  startDragFile(fileId, filePath) {
    ipcRenderer.send("desktop:start-drag-file", { fileId, filePath });
  },
  revealInExplorer(fileId) {
    return ipcRenderer.invoke("desktop:reveal-in-explorer", fileId);
  },
  openFileExternally(fileId) {
    return ipcRenderer.invoke("desktop:open-file-externally", fileId);
  },
  copyFilePath(fileId) {
    return ipcRenderer.invoke("desktop:copy-file-path", fileId);
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
