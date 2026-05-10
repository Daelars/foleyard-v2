const { execSync } = require("child_process");
const { existsSync } = require("fs");
const { join } = require("path");

function hasLockingProcesses() {
  try {
    const result = execSync(
      `powershell -NoProfile -Command "
        Get-Process | Where-Object { 
          (\$_.ProcessName -eq 'node' -or \$_.ProcessName -eq 'electron') 
          -and \$_.Id -ne \$PID 
        } | Select-Object -First 1 | Format-Table -AutoSize
      "`,
      { encoding: "utf-8", timeout: 5000 },
    );
    return result.includes("node") || result.includes("electron");
  } catch {
    return false;
  }
}

function killLockingProcesses() {
  console.log("[prebuild] Killing stale Node.js and Electron processes...");
  execSync("taskkill /f /im node.exe 2>nul", { stdio: "ignore" });
  execSync("taskkill /f /im electron.exe 2>nul", { stdio: "ignore" });
}

function rebuildForElectron() {
  const rebuildPath = join(__dirname, "..", "node_modules", "@electron", "rebuild", "lib", "cli.js");

  if (!existsSync(rebuildPath)) {
    console.error("[prebuild] @electron/rebuild not found at:", rebuildPath);
    console.error("[prebuild] Run 'bun install' first.");
    process.exit(1);
  }

  try {
    console.log("[prebuild] Rebuilding better-sqlite3 for Electron...");
    execSync(`node "${rebuildPath}" -m . -o better-sqlite3 --force`, {
      stdio: "inherit",
      cwd: join(__dirname, ".."),
      timeout: 120000,
    });
    console.log("[prebuild] Electron rebuild complete");
  } catch (err) {
    if (err.message?.includes("EPERM") || err.stderr?.includes("EPERM")) {
      console.error("");
      console.error("[prebuild] ╔══════════════════════════════════════════════════════╗");
      console.error("[prebuild] ║  The better-sqlite3 binary is locked by another     ║");
      console.error("[prebuild] ║  process. This usually means a Node.js or Electron  ║");
      console.error("[prebuild] ║  dev server is still running.                       ║");
      console.error("[prebuild] ║                                                      ║");
      console.error("[prebuild] ║  Fix: Kill all Node.js processes and try again.      ║");
      console.error("[prebuild] ║                                                      ║");
      console.error("[prebuild] ║  Run this in PowerShell as Admin:                    ║");
      console.error("[prebuild] ║    taskkill /f /im node.exe                          ║");
      console.error("[prebuild] ║    taskkill /f /im electron.exe                      ║");
      console.error("[prebuild] ╚══════════════════════════════════════════════════════╝");
      process.exit(1);
    }
    throw err;
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes("--kill")) {
    killLockingProcesses();
  }

  rebuildForElectron();
}

module.exports = { rebuildForElectron, killLockingProcesses };
