export type DesktopActionResult = {
  ok: boolean;
  error?: string;
  path?: string;
};

export type DesktopWindowState = {
  isMaximized: boolean;
};

export type UpdateInfo = {
  version: string;
  releaseDate?: string;
};

export type UpdateProgress = {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
};

export type UpdateError = {
  message: string;
};

export interface DesktopBridge {
  isDesktop: true;
  startDragFile: (fileId: string, filePath: string) => void;
  revealInExplorer: (fileId: string) => Promise<DesktopActionResult>;
  revealPath: (path: string) => Promise<DesktopActionResult>;
  openFileExternally: (fileId: string) => Promise<DesktopActionResult>;
  setZoomFactor: (factor: number) => void;
  copyFilePath: (fileId: string) => Promise<DesktopActionResult>;
  pickFolder: () => Promise<DesktopActionResult>;
  minimizeWindow: () => Promise<{ ok: boolean }>;
  toggleMaximizeWindow: () => Promise<{
    ok: boolean;
    isMaximized?: boolean;
  }>;
  closeWindow: () => Promise<{ ok: boolean }>;
  getWindowState: () => Promise<DesktopWindowState>;
  onActionError: (listener: (message: string) => void) => () => void;
  onWindowState: (
    listener: (state: DesktopWindowState) => void,
  ) => () => void;
  checkForUpdates: () => Promise<{ ok: boolean }>;
  installUpdate: () => Promise<{ ok: boolean }>;
  simulateUpdate: () => Promise<{ ok: boolean }>;
  onUpdateAvailable: (listener: (info: UpdateInfo) => void) => () => void;
  onUpdateReady: (listener: (info: UpdateInfo) => void) => () => void;
  onUpdateNotAvailable: (listener: () => void) => () => void;
  onUpdateError: (listener: (info: UpdateError) => void) => () => void;
  onUpdateDownloadProgress: (listener: (progress: UpdateProgress) => void) => () => void;
}

export function getDesktopBridge() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.desktopBridge ?? null;
}

export function isDesktopApp() {
  return getDesktopBridge()?.isDesktop === true;
}
