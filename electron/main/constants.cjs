const APP_NAME = "Foleyard";
const LEGACY_APP_NAMES = ["SoundSlop"];
const DATABASE_FILENAME = "foleyard.sqlite";
const LEGACY_DATABASE_FILENAMES = ["soundslop.sqlite"];
// The desktop only ever loads a loopback server: the bundled Next production
// server or the local development server. `ELECTRON_START_URL` is read by
// `main/start-url.cjs`, which accepts it only in development and only for a
// loopback origin — a packaged build never adopts it (#261).
const DEV_SERVER_URL = "http://localhost:3000";

module.exports = {
  APP_NAME,
  DATABASE_FILENAME,
  DEV_SERVER_URL,
  LEGACY_APP_NAMES,
  LEGACY_DATABASE_FILENAMES,
};
