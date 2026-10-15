/**
 * The trusted desktop document and its senders (#262).
 *
 * A Foleyard window loads its own loopback server with the desktop preload
 * attached and the native grant secret aimed at it (#261). Everything that can
 * move that document elsewhere, spawn a new one, ask the OS for capabilities,
 * or speak over IPC has to stay on the trusted origin.
 *
 * This module owns four decisions, all defaulting to "no":
 * - main-frame navigation may only reach `trustedOrigin`
 * - `window.open` never creates a child window; a validated external link is
 *   handed to the OS instead
 * - Electron permission requests are denied unless a capability is listed in
 *   REQUIRED_PERMISSIONS
 * - an IPC sender must be the top frame of the tracked desktop window on the
 *   trusted origin
 */

const { shell } = require("electron");

const { appendDesktopLog } = require("./errors.cjs");
const { getDesktopServerUrl } = require("./server-url.cjs");

// The window that owns the privileged preload. IPC may only come from it.
let desktopWindow = null;

function setDesktopWindow(windowInstance) {
  desktopWindow = windowInstance ?? null;
}

function getDesktopWindow() {
  return desktopWindow;
}

function readOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/** True when `targetUrl` is the desktop server origin, and nothing else. */
function isTrustedNavigation(targetUrl, trustedOrigin = getDesktopServerUrl()) {
  const target = readOrigin(targetUrl);
  return target !== null && target === trustedOrigin;
}

// External links leave the application through the OS only for schemes the OS
// browser/handler understands. `javascript:`, `data:`, `file:`, `ms-msdt:` and
// unparseable values never reach `shell.openExternal`.
const EXTERNAL_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/** The absolute URL to hand to the OS, or null when it must not be opened. */
function resolveExternalLink(value) {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  return EXTERNAL_LINK_PROTOCOLS.has(url.protocol) ? url.href : null;
}

/**
 * Pin a webContents to the trusted document: block main-frame navigation that
 * leaves it, and answer every `window.open` with a validated external link.
 */
function installNavigationPolicy(webContents, options = {}) {
  const {
    trustedOrigin = getDesktopServerUrl(),
    openExternal = (url) => shell.openExternal(url),
    log = appendDesktopLog,
  } = options;

  const refuseNavigation = (event, target) => {
    event.preventDefault();
    log(`Refused main-frame navigation outside the desktop server: ${target}`);
  };

  for (const eventName of ["will-navigate", "will-redirect"]) {
    webContents.on(eventName, (event, target) => {
      if (!isTrustedNavigation(target, trustedOrigin)) {
        refuseNavigation(event, target);
      }
    });
  }

  webContents.setWindowOpenHandler(({ url }) => {
    // Deny unconditionally: a child window would spawn without the desktop
    // preload's trust, but with a live session — and the policy for external
    // links is "leave through the OS", not "open a second app window".
    if (!isTrustedNavigation(url, trustedOrigin)) {
      const externalUrl = resolveExternalLink(url);
      if (externalUrl) {
        openExternalSafely(externalUrl, openExternal, log);
      } else {
        log(`Refused window.open target: ${url}`);
      }
    }

    return { action: "deny" };
  });
}

function openExternalSafely(url, openExternal, log) {
  try {
    void Promise.resolve(openExternal(url)).catch((error) => {
      log(`Failed to open external link ${url}: ${error?.message ?? error}`);
    });
  } catch (error) {
    log(`Failed to open external link ${url}: ${error?.message ?? error}`);
  }
}

// The local renderer needs no browser permission: clipboard writes, drag-out,
// file reveal and window state are explicit Desktop actions on the validated
// bridge. A permission is only granted when a capability is listed here with
// its reason, so this stays empty rather than leaning on Electron's defaults.
const REQUIRED_PERMISSIONS = Object.freeze([]);

function isPermissionAllowed(permission) {
  return REQUIRED_PERMISSIONS.includes(permission);
}

/** Deny every permission request and check unless it is explicitly required. */
function installPermissionPolicy(session, options = {}) {
  const { log = appendDesktopLog } = options;

  session.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = isPermissionAllowed(permission);
    if (!allowed) {
      log(`Denied Electron permission request: ${permission}`);
    }
    callback(allowed);
  });

  // Synchronous checks stay silent: they fire for ordinary page loads and
  // logging each one would bury the real denials.
  session.setPermissionCheckHandler((_webContents, permission) =>
    isPermissionAllowed(permission),
  );
}

function isMainFrame(frame) {
  try {
    return frame.parent === null || frame.parent === undefined;
  } catch {
    return false;
  }
}

/**
 * Why this IPC event may not use native authority, or null when it may. The
 * sender must be the top frame of the tracked desktop window, loading the
 * trusted origin.
 */
function describeUntrustedSender(event, options = {}) {
  const {
    trustedOrigin = getDesktopServerUrl(),
    trustedWindow = desktopWindow,
  } = options;

  const frame = event?.senderFrame;
  if (!frame || typeof frame.url !== "string") {
    return "IPC sender has no frame";
  }
  if (!isMainFrame(frame)) {
    return "IPC sender is not the main frame";
  }
  if (!isTrustedNavigation(frame.url, trustedOrigin)) {
    return `IPC sender origin is not the desktop server: ${frame.url}`;
  }

  const sender = event?.sender;
  const owner =
    sender && typeof sender.getOwnerBrowserWindow === "function"
      ? sender.getOwnerBrowserWindow()
      : null;
  if (!owner) {
    return "IPC sender has no owning desktop window";
  }
  if (trustedWindow && owner !== trustedWindow) {
    return "IPC sender does not own the desktop window";
  }

  return null;
}

module.exports = {
  REQUIRED_PERMISSIONS,
  describeUntrustedSender,
  getDesktopWindow,
  installNavigationPolicy,
  installPermissionPolicy,
  isPermissionAllowed,
  isTrustedNavigation,
  resolveExternalLink,
  setDesktopWindow,
};
