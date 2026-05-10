const { spawn } = require("child_process");
const waitOn = require("wait-on");

require("./verify-workspace-root.cjs");
const { main: ensureNativeModules } = require("./postinstall.cjs");

const isWindows = process.platform === "win32";
const env = { ...process.env, FOLEYARD_DESKTOP: "1" };
let nextProcess = null;
let electronProcess = null;

function run(command, args, options = {}) {
  return spawn(command, args, {
    stdio: "inherit",
    shell: false,
    ...options,
  });
}

function killProcessTree(pid) {
  if (!pid) {
    return;
  }

  if (isWindows) {
    spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
      stdio: "ignore",
      shell: false,
    });
    return;
  }

  try {
    process.kill(-pid, "SIGTERM");
  } catch {}
}

async function stopStaleProcesses() {
  if (!isWindows) {
    return;
  }

  const script = `$currentPid = ${process.pid}; Get-CimInstance Win32_Process | Where-Object { (($_.Name -eq 'electron.exe') -or ($_.Name -eq 'node.exe')) -and ($_.ProcessId -ne $currentPid) -and (($_.CommandLine -like '*soundslop*') -or ($_.CommandLine -like '*foleyard*')) } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force } catch {} }`;

  await new Promise((resolve, reject) => {
    const child = spawn(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      { stdio: "inherit", shell: false },
    );

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Failed to stop stale processes (${code})`));
    });
  });
}

function shutdown(code = 0) {
  killProcessTree(electronProcess?.pid);
  killProcessTree(nextProcess?.pid);
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

async function main() {
  await ensureNativeModules();
  await stopStaleProcesses();

  nextProcess = run("node", [
    "node_modules/next/dist/bin/next",
    "dev",
    "--webpack",
    "--port",
    "3001",
  ], {
    env,
    detached: !isWindows,
  });

  nextProcess.on("exit", (code) => {
    if (code && code !== 0) {
      shutdown(code);
    }
  });

  await waitOn({ resources: ["http://localhost:3001"] });

  electronProcess = run("node", ["node_modules/electron/cli.js", "."], {
    env: { ...env, ELECTRON_START_URL: "http://localhost:3001" },
    detached: !isWindows,
  });

  electronProcess.on("exit", (code) => {
    shutdown(code ?? 0);
  });
}

main().catch((error) => {
  console.error(error);
  shutdown(1);
});
