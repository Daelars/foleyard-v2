const { DEV_SERVER_URL } = require("./constants.cjs");

// The loaded origin keeps the desktop preload and the native grant secret, so
// the desktop only ever trusts a loopback server: the bundled Next production
// server on 127.0.0.1, or the local development server. Everything else is
// refused before it can become the target of a grant request (#261).
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

function toServerOrigin(value) {
  return new URL(value).origin;
}

function isTrustedServerOrigin(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }
    return LOOPBACK_HOSTNAMES.has(url.hostname);
  } catch {
    return false;
  }
}

let desktopServerUrl = toServerOrigin(DEV_SERVER_URL);

function getDesktopServerUrl() {
  return desktopServerUrl;
}

function setDesktopServerUrl(startUrl) {
  const origin = toServerOrigin(startUrl);

  if (!isTrustedServerOrigin(origin)) {
    throw new Error(
      `Foleyard desktop refuses to trust a non-loopback server origin: ${origin}`,
    );
  }

  desktopServerUrl = origin;
}

module.exports = {
  getDesktopServerUrl,
  isTrustedServerOrigin,
  setDesktopServerUrl,
};
