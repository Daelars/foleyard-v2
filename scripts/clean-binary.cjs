const { rmSync, existsSync } = require("fs");
const { resolve } = require("path");

const binaryPath = resolve(
  __dirname,
  "..",
  "node_modules",
  ".bun",
  "better-sqlite3@12.9.0",
  "node_modules",
  "better-sqlite3",
  "build",
  "Release",
  "better_sqlite3.node",
);

if (existsSync(binaryPath)) {
  try {
    rmSync(binaryPath);
    console.log("[clean-binary] Removed old better_sqlite3.node");
  } catch (err) {
    if (err.code === "EPERM") {
      console.error("[clean-binary] ╔══════════════════════════════════════════════╗");
      console.error("[clean-binary] ║  Cannot delete better_sqlite3.node — it is  ║");
      console.error("[clean-binary] ║  locked by a running process.                ║");
      console.error("[clean-binary] ║                                              ║");
      console.error("[clean-binary] ║  Close all Node.js and Electron processes    ║");
      console.error("[clean-binary] ║  and try again.                              ║");
      console.error("[clean-binary] ║                                              ║");
      console.error("[clean-binary] ║    taskkill /f /im node.exe                  ║");
      console.error("[clean-binary] ║    taskkill /f /im electron.exe              ║");
      console.error("[clean-binary] ╚══════════════════════════════════════════════╝");
      process.exit(1);
    } else {
      throw err;
    }
  }
} else {
  console.log("[clean-binary] No binary to clean");
}
