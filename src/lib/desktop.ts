export type DesktopActionResult = {
  ok: boolean;
  error?: string;
  path?: string;
};

export type DesktopWindowState = {
  isMaximized: boolean;
};

export interface DesktopBridge {
  isDesktop: true;
  startDragFile: (fileId: string, filePath: string) => void;
  revealInExplorer: (fileId: string) => Promise<DesktopActionResult>;
  openFileExternally: (fileId: string) => Promise<DesktopActionResult>;
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
