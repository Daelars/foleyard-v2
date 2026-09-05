const net = require("net");

const PRIVATE_START_SERVER_MODULE = "next/dist/server/lib/start-server";
const SUPPORTED_NEXT_MAJOR = 16;

function getInstalledNextVersion() {
  try {
    return require("next/package.json").version ?? null;
  } catch {
    return null;
  }
}

function getNextMajor(version) {
  if (typeof version !== "string") {
    return null;
  }

  const match = version.trim().match(/^v?(\d+)\./);
  return match ? Number(match[1]) : null;
}

function assertSupportedNextVersion() {
  const installed = getInstalledNextVersion();
  const major = getNextMajor(installed);

  if (major !== SUPPORTED_NEXT_MAJOR) {
    throw new Error(
      `Foleyard desktop cannot start the bundled Next.js server: ` +
        `the desktop adapter supports Next.js v${SUPPORTED_NEXT_MAJOR}, ` +
        `but the installed version is ${installed ?? "unknown"}. ` +
        `Update electron/main/next-server-adapter.cjs before upgrading Next.js.`,
    );
  }

  return installed;
}

function loadPrivateStartServer() {
  try {
    return require(PRIVATE_START_SERVER_MODULE);
  } catch (error) {
    throw new Error(
      `Foleyard desktop cannot start the bundled Next.js server: ` +
        `the private module "${PRIVATE_START_SERVER_MODULE}" could not be loaded. ` +
        `A Next.js upgrade probably moved it. ` +
        `Update electron/main/next-server-adapter.cjs to the new location ` +
        `(adapter supports Next.js v${SUPPORTED_NEXT_MAJOR}). ` +
        `Underlying error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function allocateLoopbackPort(hostname) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, hostname, () => {
      const address = probe.address();
      const port =
        typeof address === "object" && address !== null ? address.port : null;
      probe.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        if (typeof port !== "number" || !Number.isInteger(port) || port <= 0) {
          reject(
            new Error(
              "Foleyard desktop could not determine a loopback port for the bundled Next.js server.",
            ),
          );
          return;
        }
        resolve(port);
      });
    });
  });
}

function assertServerStarted(port) {
  if (typeof port !== "number" || !Number.isInteger(port) || port <= 0) {
    throw new Error(
      "Foleyard desktop failed to start the bundled Next.js server: " +
        "the production server did not report a usable loopback port. " +
        "Check desktop-errors.log for the underlying Next.js error.",
    );
  }
}

async function startProductionServer({ dir, hostname }) {
  assertSupportedNextVersion();
  const { startServer } = loadPrivateStartServer();

  if (typeof startServer !== "function") {
    throw new Error(
      `Foleyard desktop cannot start the bundled Next.js server: ` +
        `the private module "${PRIVATE_START_SERVER_MODULE}" no longer exports startServer. ` +
        `A Next.js upgrade probably changed it. ` +
        `Update electron/main/next-server-adapter.cjs to the new API.`,
    );
  }

  const port = await allocateLoopbackPort(hostname);

  // Private coupling, owned here and guarded by the version check above:
  // start-server reads this for startup-time telemetry instead of taking it
  // as an argument.
  process.env.NEXT_PRIVATE_START_TIME = String(Date.now());

  try {
    await startServer({
      dir,
      hostname,
      port,
      isDev: false,
      allowRetry: false,
      minimalMode: false,
      keepAliveTimeout: 5000,
    });
  } catch (error) {
    throw new Error(
      `Foleyard desktop failed to start the bundled Next.js server on ${hostname}:${port}: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }

  assertServerStarted(port);

  return { url: `http://${hostname}:${port}`, port };
}

module.exports = {
  PRIVATE_START_SERVER_MODULE,
  SUPPORTED_NEXT_MAJOR,
  allocateLoopbackPort,
  assertServerStarted,
  assertSupportedNextVersion,
  getInstalledNextVersion,
  loadPrivateStartServer,
  startProductionServer,
};
