const { app } = require("electron");

const { appendDesktopLog } = require("./errors.cjs");
const { startProductionServer } = require("./next-server-adapter.cjs");

let nextServerUrlPromise = null;
let consoleCaptureInstalled = false;

function formatConsoleValue(value) {
  if (value instanceof Error) {
    return `${value.message}\n${value.stack ?? ""}`;
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function installServerConsoleCapture() {
  if (consoleCaptureInstalled) {
    return;
  }

  consoleCaptureInstalled = true;
  const originalError = console.error.bind(console);
  const originalWarn = console.warn.bind(console);

  console.error = (...args) => {
    appendDesktopLog(`[server:error]\n${args.map(formatConsoleValue).join("\n")}`);
    originalError(...args);
  };

  console.warn = (...args) => {
    appendDesktopLog(`[server:warn]\n${args.map(formatConsoleValue).join("\n")}`);
    originalWarn(...args);
  };
}

async function startNextProductionServer() {
  if (nextServerUrlPromise) {
    return nextServerUrlPromise;
  }

  nextServerUrlPromise = (async () => {
    installServerConsoleCapture();
    process.env.FOLEYARD_DESKTOP = "1";

    // All private Next.js coupling (version check, private module import,
    // loopback port selection) lives in next-server-adapter.cjs, which fails
    // loud instead of presenting a blank window when a framework upgrade
    // moves the private server bootstrap.
    const { url, port } = await startProductionServer({
      dir: app.getAppPath(),
      hostname: "127.0.0.1",
    });

    appendDesktopLog(`Next production server ready on port ${port}`);
    return url;
  })();

  return nextServerUrlPromise;
}

module.exports = {
  startNextProductionServer,
};
