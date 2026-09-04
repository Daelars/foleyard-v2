const { DEV_SERVER_URL } = require("./constants.cjs");

function toServerOrigin(value) {
  return new URL(value).origin;
}

let desktopServerUrl = toServerOrigin(DEV_SERVER_URL);

function getDesktopServerUrl() {
  return desktopServerUrl;
}

function setDesktopServerUrl(startUrl) {
  desktopServerUrl = toServerOrigin(startUrl);
}

module.exports = {
  getDesktopServerUrl,
  setDesktopServerUrl,
};
