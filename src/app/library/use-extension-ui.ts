"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { interpretExtensionUiIntent } from "@/lib/extensions/ui-intent";
import type { ExtensionGridItem } from "@/lib/extensions/types";
import type { YardExtensionHostOutcome } from "@yard-core";
import type { FileRecord } from "./types";

export interface ExtensionUiCallbacks {
  showShelf: () => void;
  openSettings: () => void;
  requestClearShelf: () => void;
  getSelectedFile: () => FileRecord | null;
  addToCollection: (collectionId: string, fileId: string) => Promise<unknown>;
  addToShelf: (fileIds: string[]) => Promise<unknown>;
  saveSearch: (name: string) => Promise<boolean>;
  renameCollection: (id: string, name: string) => Promise<unknown>;
}

/**
 * Extension UI state: tool dialogs, save-search and rename dialogs, and
 * hosted-command dispatch with UI-intent handling. Navigation and domain
 * mutations arrive through explicit callbacks; this hook owns only its
 * dialog state. Make Pack retired to v2: its dialog and intents live on
 * the v2 path now.
 */
export function useExtensionUi(callbacks: ExtensionUiCallbacks) {
  const [selectedExtension, setSelectedExtension] =
    useState<ExtensionGridItem | null>(null);
  const [folderJanitorOpen, setFolderJanitorOpen] = useState(false);
  const [folderJanitorTarget, setFolderJanitorTarget] = useState<
    "library" | "folder"
  >("library");
  const [folderJanitorFolderPath, setFolderJanitorFolderPath] = useState("");
  const [gatherOpen, setGatherOpen] = useState(false);
  const [showSaveSearch, setShowSaveSearch] = useState(false);
  const [renamingCollection, setRenamingCollection] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  });

  const executeHostedCommand = useCallback(
    async (
      extensionId: string,
      commandId: string,
      target?: { fileIds?: string[]; folderPath?: string },
      input?: unknown,
    ) => {
      try {
        const response = await fetch("/api/extensions/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ extensionId, commandId, selection: target, input }),
        });
        const outcome = (await response.json()) as YardExtensionHostOutcome;

        if (!response.ok || !outcome.ok) {
          throw new Error(
            outcome.ok ? "Extension command failed" : outcome.message,
          );
        }

        if (outcome.type === "ui-intent") {
          const actions = callbacksRef.current;
          const handled = interpretExtensionUiIntent(outcome.intent, {
            openFolderJanitor: (payload) => {
              setFolderJanitorTarget(payload.target);
              setFolderJanitorFolderPath(
                payload.target === "folder" ? payload.folderPath : "",
              );
              setFolderJanitorOpen(true);
            },
            openLibraryGatherer: () => setGatherOpen(true),
            openSettings: () => actions.openSettings(),
          });

          if (!handled) {
            toast.info(`No UI handles intent "${outcome.intent.type}" yet`);
          }
        }
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to run extension command",
        );
      }
    },
    [],
  );

  const handleScanFolder = useCallback((folderPath: string) => {
    setFolderJanitorTarget("folder");
    setFolderJanitorFolderPath(folderPath);
    setFolderJanitorOpen(true);
  }, []);

  // v2 dialog openers (renderer-owned, mirroring the Make Pack v2 run
  // path): v2 scan/gather commands return values and plans, never
  // UI intents, so palette/row/menu invocations open the dialogs that
  // orchestrate them instead of invoking headless.
  const openJanitorLibrary = useCallback(() => {
    setFolderJanitorTarget("library");
    setFolderJanitorFolderPath("");
    setFolderJanitorOpen(true);
  }, []);

  const openGatherDialog = useCallback(() => {
    setGatherOpen(true);
  }, []);

  const handleRunCommand = useCallback(
    (extensionId: string, commandId: string) => {
      if (extensionId === "sound-shelf-v2" && commandId === "sound-shelf-v2.clear") {
        callbacksRef.current.showShelf();
        callbacksRef.current.requestClearShelf();
        return;
      }
      void executeHostedCommand(extensionId, commandId);
    },
    [executeHostedCommand],
  );

  const handleAddToCollection = useCallback(async (collectionId: string) => {
    const selectedFile = callbacksRef.current.getSelectedFile();
    if (!selectedFile) {
      return;
    }
    await callbacksRef.current.addToCollection(collectionId, selectedFile.id);
  }, []);

  const handleAddCurrentToShelf = useCallback(async () => {
    const selectedFile = callbacksRef.current.getSelectedFile();
    if (!selectedFile) {
      return;
    }
    await callbacksRef.current.addToShelf([selectedFile.id]);
  }, []);

  const submitSaveSearch = useCallback(async (name: string) => {
    const saved = await callbacksRef.current.saveSearch(name);
    if (saved) {
      setShowSaveSearch(false);
    }
  }, []);

  const submitRenameCollection = useCallback(
    async (name: string) => {
      if (name.trim() && renamingCollection) {
        await callbacksRef.current.renameCollection(
          renamingCollection.id,
          name.trim(),
        );
        setRenamingCollection(null);
      }
    },
    [renamingCollection],
  );

  const openRenameCollection = useCallback((id: string, name: string) => {
    setRenamingCollection({ id, name });
  }, []);

  const handleCloseExtensionDetails = useCallback((open: boolean) => {
    if (!open) setSelectedExtension(null);
  }, []);

  const handleCloseGather = useCallback((open: boolean) => {
    if (!open) setGatherOpen(false);
  }, []);

  return {
    selectedExtension,
    setSelectedExtension,
    folderJanitorOpen,
    setFolderJanitorOpen,
    folderJanitorTarget,
    folderJanitorFolderPath,
    gatherOpen,
    showSaveSearch,
    setShowSaveSearch,
    renamingCollection,
    setRenamingCollection,
    openRenameCollection,
    executeHostedCommand,
    handleScanFolder,
    openJanitorLibrary,
    openGatherDialog,
    handleRunCommand,
    handleAddToCollection,
    handleAddCurrentToShelf,
    submitSaveSearch,
    submitRenameCollection,
    handleCloseExtensionDetails,
    handleCloseGather,
  };
}
