import { useSyncExternalStore } from "react";

export type DesktopActionResult = {
  ok: boolean;
  error?: string;
  path?: string;
  grantToken?: string;
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
  isDesktop: true;  startDragFiles: (fileIds: string[]) => void;
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
  getRuntimeInfo: () => Promise<{
    owner: string;
    platform: string;
    packaged: boolean;
    version: string | null;
    buildId: string | null;
    resourcesPath: string | null;
    docsRoot: string | null;
    installedChannels: string[];
  }>;
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

type DesktopBridgeListener = () => void;

const desktopBridgeListeners = new Set<DesktopBridgeListener>();
let desktopBridgeTrapTarget: unknown = null;

/**
 * Notify subscribed readers that the desktop bridge changed (late injection,
 * tests, or explicit re-read). Late preload injection assigns
 * `window.desktopBridge` after first render; without a notification the
 * `useSyncExternalStore` snapshot would stay stuck at `false`.
 */
export function notifyDesktopBridgeChanged(): void {
  for (const listener of desktopBridgeListeners) {
    listener();
  }
}

function armLateBridgeTrap(): void {
  if (typeof window === "undefined" || desktopBridgeTrapTarget === window) {
    return;
  }
  desktopBridgeTrapTarget = window;
  try {
    window.addEventListener("desktop-bridge-ready", notifyDesktopBridgeChanged);
  } catch {
    // Ignore: notification still works via the setter trap below.
  }
  try {
    let current = window.desktopBridge;
    Object.defineProperty(window, "desktopBridge", {
      configurable: true,
      enumerable: true,
      get: () => current,
      set: (value: DesktopBridge | undefined) => {
        current = value;
        notifyDesktopBridgeChanged();
      },
    });
  } catch {
    // Non-configurable bridge (e.g. contextBridge getter): subscribers still
    // re-read on demand and on "desktop-bridge-ready" if dispatched.
  }
}

/**
 * The desktop bridge is injected by the preload script, normally before the
 * renderer loads but occasionally after first render. The subscription
 * notifies on late assignment (via a setter trap plus a
 * `desktop-bridge-ready` window event) so readers re-render instead of
 * staying stuck at `false`.
 */
export function subscribeDesktopBridge(
  listener: DesktopBridgeListener,
): () => void {
  armLateBridgeTrap();
  desktopBridgeListeners.add(listener);
  return () => {
    desktopBridgeListeners.delete(listener);
  };
}

export function getDesktopSnapshot(): boolean {
  return isDesktopApp();
}

export function getDesktopServerSnapshot(): boolean {
  return false;
}

export function useDesktopApp(): boolean {
  return useSyncExternalStore(
    subscribeDesktopBridge,
    getDesktopSnapshot,
    getDesktopServerSnapshot,
  );
}

declare global {
  interface Window { desktopBridge?: DesktopBridge; }
}
