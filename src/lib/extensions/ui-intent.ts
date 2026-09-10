import type { YardUiIntent } from "@yard-core";

export type FolderJanitorOpenScanPayload =
  | { target: "library" }
  | { target: "folder"; folderPath: string };

export type ExtensionUiIntentActions = {
  openFolderJanitor(payload: FolderJanitorOpenScanPayload): void;
  openLibraryGatherer(): void;
  openSettings(): void;
};

function isFolderJanitorPayload(
  payload: unknown,
): payload is FolderJanitorOpenScanPayload {
  if (typeof payload !== "object" || payload === null || !("target" in payload)) {
    return false;
  }

  if (payload.target === "library") {
    return true;
  }

  return (
    payload.target === "folder" &&
    "folderPath" in payload &&
    typeof payload.folderPath === "string" &&
    payload.folderPath.length > 0
  );
}

export function interpretExtensionUiIntent(
  intent: YardUiIntent,
  actions: ExtensionUiIntentActions,
): boolean {
  return uiIntentHandlers.get(intent.type)?.(intent.payload, actions) ?? false;
}

export type ExtensionUiIntentHandler = (
  payload: unknown,
  actions: ExtensionUiIntentActions,
) => boolean;

const uiIntentHandlers = new Map<string, ExtensionUiIntentHandler>([
  [
    "folder-janitor.open-scan",
    (payload, actions) => {
      if (!isFolderJanitorPayload(payload)) {
        return false;
      }
      actions.openFolderJanitor(payload);
      return true;
    },
  ],
  [
    "library-gatherer.open",
    (_payload, actions) => {
      actions.openLibraryGatherer();
      return true;
    },
  ],
]);

export function registerUiIntentHandler(
  type: string,
  handler: ExtensionUiIntentHandler,
): void {
  uiIntentHandlers.set(type, handler);
}
