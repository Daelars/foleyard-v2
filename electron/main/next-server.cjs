const { app } = require("electron");

const { appendDesktopLog } = require("./errors.cjs");

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
    process.env.NEXT_PRIVATE_START_TIME = String(Date.now());

    const { startServer } = require("next/dist/server/lib/start-server");

    await startServer({
      dir: app.getAppPath(),
      hostname: "127.0.0.1",
      port: 0,
      isDev: false,
      allowRetry: false,
      minimalMode: false,
      keepAliveTimeout: 5000,
    });

    appendDesktopLog(`Next production server ready on port ${process.env.PORT}`);
    return `http://127.0.0.1:${process.env.PORT}`;
  })();

  return nextServerUrlPromise;
}

module.exports = {
  startNextProductionServer,
};
