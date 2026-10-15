const { app } = require("electron");

const { DEV_SERVER_URL } = require("./constants.cjs");
const { appendDesktopLog } = require("./errors.cjs");
const { startNextProductionServer } = require("./next-server.cjs");
const { isTrustedServerOrigin } = require("./server-url.cjs");

// A packaged Foleyard process loads its own bundled loopback server, full
// stop. The desktop preload and the native grant secret follow whatever origin
// the window loads, so an inherited `ELECTRON_START_URL` pointing somewhere
// else must never be able to claim them (#261). Development keeps the override
// so `scripts/dev-desktop.cjs` can point Electron at `next dev`, but only for
// a loopback origin.
async function resolveDesktopStartUrl({
  packaged = app.isPackaged,
  requestedStartUrl = process.env.ELECTRON_START_URL,
  startBundledServer = startNextProductionServer,
} = {}) {
  if (packaged) {
    return await startBundledServer();
  }

  if (requestedStartUrl) {
    if (isTrustedServerOrigin(requestedStartUrl)) {
      return requestedStartUrl;
    }

    appendDesktopLog(
      `Ignoring ELECTRON_START_URL "${requestedStartUrl}": development only ` +
        `loads a loopback server. Falling back to ${DEV_SERVER_URL}`,
    );
  }

  return DEV_SERVER_URL;
}

module.exports = {
  resolveDesktopStartUrl,
};
