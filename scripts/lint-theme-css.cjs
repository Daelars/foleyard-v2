// CSS half of the theme-token law and root-height chain (#142).
//
// ESLint sees JS/TS only, so the globals.css side — token definitions,
// Tailwind utility registration, and the viewport-unit ban — is checked here.
// Wired into `bun run lint` next to eslint; a violation fails lint.

const fs = require("node:fs");
const path = require("node:path");

const globalsPath = path.join(__dirname, "..", "src", "app", "globals.css");
const globals = fs.readFileSync(globalsPath, "utf8");

const failures = [];

for (const token of [
  "--accent-fill: #f0503c",
  "--accent-fill-hover: #ff5a44",
  "--accent-text: #ff7a66",
  "--canvas: #0b0b10",
  "--shell: #101014",
]) {
  if (!globals.includes(token)) {
    failures.push(`theme layer must define ${token}`);
  }
}

for (const token of [
  "--color-accent-fill:",
  "--color-accent-fill-hover:",
  "--color-accent-text:",
  "--color-canvas:",
  "--color-shell:",
]) {
  if (!globals.includes(token)) {
    failures.push(`@theme must register ${token}`);
  }
}

if (/height:\s*100vh/.test(globals)) {
  failures.push("body height must not use viewport units (breaks root zoom)");
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`theme-css: ${failure}`);
  process.exit(1);
}
