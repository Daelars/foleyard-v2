import type { YardUiIntent } from "@yard-core";

export type FolderJanitorOpenScanPayload =
  | { target: "library" }
  | { target: "folder"; folderPath: string };

export type ExtensionUiIntentActions = {
  openFolderJanitor(payload: FolderJanitorOpenScanPayload): void;
  openLibraryGatherer(): void;
  openMakePack(payload: MakePackOpenPayload): void;
  openSettings(): void;
};

export type MakePackOpenPayload = {
  source: "selection" | "shelf" | "recent";
  fileIds: string[];
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

function isMakePackPayload(payload: unknown): payload is MakePackOpenPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "source" in payload &&
    (payload.source === "selection" ||
      payload.source === "shelf" ||
      payload.source === "recent") &&
    "fileIds" in payload &&
    Array.isArray(payload.fileIds) &&
    payload.fileIds.every((fileId) => typeof fileId === "string")
  );
}

export function interpretExtensionUiIntent(
  intent: YardUiIntent,
  actions: ExtensionUiIntentActions,
): boolean {
  if (
    intent.type === "folder-janitor.open-scan" &&
    isFolderJanitorPayload(intent.payload)
  ) {
    actions.openFolderJanitor(intent.payload);
    return true;
  }

  if (intent.type === "library-gatherer.open") {
    actions.openLibraryGatherer();
    return true;
  }

  if (intent.type === "make-pack.open" && isMakePackPayload(intent.payload)) {
    actions.openMakePack(intent.payload);
    return true;
  }

  if (intent.type === "drop-rules.open-settings") {
    actions.openSettings();
    return true;
  }

  return false;
}
