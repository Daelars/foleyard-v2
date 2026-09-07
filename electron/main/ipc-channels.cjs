/**
 * Single registry for every Desktop bridge channel. The main process, the
 * preload bridge, and the renderer wrapper all reference these constants, so
 * a rename breaks loudly at require/import time instead of silently dropping
 * (e.g. drag start) at runtime.
 *
 * kind: "invoke" (renderer calls, main answers), "send" (renderer fires,
 * main handles, no answer), "event" (main pushes, renderer listens).
 * payload: required fields of the payload object, or [] for scalar/no args.
 */

/** @typedef {"invoke" | "send" | "event"} IpcChannelKind */

/**
 * @typedef {object} IpcChannelSpec
 * @property {IpcChannelKind} kind
 * @property {string[]} payload
 */

/** @type {Record<string, IpcChannelSpec>} */
const CHANNEL_SPECS = {
  "desktop:check-for-updates": { kind: "invoke", payload: [] },
  "desktop:install-update": { kind: "invoke", payload: [] },
  "desktop:simulate-update": { kind: "invoke", payload: [] },
  "desktop:copy-file-path": { kind: "invoke", payload: [] },
  "desktop:pick-folder": { kind: "invoke", payload: [] },
  "desktop:reveal-in-explorer": { kind: "invoke", payload: [] },
  "desktop:reveal-path": { kind: "invoke", payload: [] },
  "desktop:open-file-externally": { kind: "invoke", payload: [] },
  "desktop:window-minimize": { kind: "invoke", payload: [] },
  "desktop:window-toggle-maximize": { kind: "invoke", payload: [] },
  "desktop:window-close": { kind: "invoke", payload: [] },
  "desktop:get-window-state": { kind: "invoke", payload: [] },
  "desktop:get-runtime-info": { kind: "invoke", payload: [] },
  "desktop:start-drag-file": { kind: "send", payload: ["fileIds"] },
  "desktop:update-available": { kind: "event", payload: ["version"] },
  "desktop:update-ready": { kind: "event", payload: ["version"] },
  "desktop:update-not-available": { kind: "event", payload: [] },
  "desktop:update-error": { kind: "event", payload: ["message"] },
  "desktop:update-download-progress": { kind: "event", payload: ["percent", "bytesPerSecond", "transferred", "total"] },
  "desktop:action-error": { kind: "event", payload: [] },
  "desktop:window-state": { kind: "event", payload: ["isMaximized"] },
};

/** @typedef {keyof typeof CHANNEL_SPECS} IpcChannelName */

const CHANNELS = Object.freeze(
  Object.fromEntries(Object.keys(CHANNEL_SPECS).map((name) => [name, name])),
);

/**
 * Report a missing field, an unknown channel, or null when the call is well-formed.
 * @param {string} channel
 * @param {unknown} payload
 * @returns {string | null}
 */
function validateIpcPayload(channel, payload) {
  const spec = CHANNEL_SPECS[channel];
  if (!spec) {
    return `unknown Desktop channel ${channel}`;
  }
  if (spec.payload.length === 0) {
    return null;
  }
  if (typeof payload !== "object" || payload === null) {
    return `Desktop channel ${channel} needs a payload object`;
  }
  for (const field of spec.payload) {
    if (!(field in payload)) {
      return `Desktop channel ${channel} is missing payload field '${field}'`;
    }
  }
  return null;
}

module.exports = {
  CHANNELS,
  CHANNEL_SPECS,
  validateIpcPayload,
};
