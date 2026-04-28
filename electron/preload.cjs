/* eslint-disable @typescript-eslint/no-require-imports */
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
  onActionError(listener) {
    const wrapped = (_event, message) => listener(message);
    ipcRenderer.on("desktop:action-error", wrapped);
    return () => {
      ipcRenderer.removeListener("desktop:action-error", wrapped);
    };
  },
});

window.addEventListener("DOMContentLoaded", () => {
  const root = document.createElement("div");
  root.id = "soundslop-native-drag-test";
  root.style.position = "fixed";
  root.style.right = "16px";
  root.style.bottom = "140px";
  root.style.zIndex = "999999";
  root.style.padding = "10px 12px";
  root.style.borderRadius = "12px";
  root.style.border = "1px solid rgba(255,255,255,0.24)";
  root.style.background = "rgba(10,10,12,0.88)";
  root.style.color = "white";
  root.style.font = "12px system-ui, sans-serif";
  root.style.cursor = "grab";
  root.style.userSelect = "none";
  root.draggable = true;
  root.textContent = "Test native drag";

  root.addEventListener("dragstart", (event) => {
    event.preventDefault();
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/plain", "SoundSlop native drag test");
    ipcRenderer.send("desktop:start-test-drag-file");
  });

  document.body.appendChild(root);
});
