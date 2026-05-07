const APP_NAME = "Foleyard";
const LEGACY_APP_NAMES = ["SoundSlop"];
const DATABASE_FILENAME = "foleyard.sqlite";
const LEGACY_DATABASE_FILENAMES = ["soundslop.sqlite"];
const DEV_SERVER_URL =
  process.env.ELECTRON_START_URL ?? "http://localhost:3000";

module.exports = {
  APP_NAME,
  DATABASE_FILENAME,
  DEV_SERVER_URL,
  LEGACY_APP_NAMES,
  LEGACY_DATABASE_FILENAMES,
};
