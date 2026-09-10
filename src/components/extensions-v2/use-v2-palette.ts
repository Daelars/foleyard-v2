"use client";

import { useCallback, useMemo } from "react";
import { toast } from "sonner";

import type { ExtensionV2Catalog } from "@yard-core";
import {
  FOLDER_JANITOR_V2_DELETE_FOLDERS,
  FOLDER_JANITOR_V2_ID,
  FOLDER_JANITOR_V2_SCAN_FOLDER,
  FOLDER_JANITOR_V2_SCAN_LIBRARY,
} from "@foleyard/folder-janitor-v2";
import { LIBRARY_GATHERER_V2_ID } from "@foleyard/library-gatherer-v2";

import {
  invokeV2Command,
  resolveV2UiPoint,
  type V2UiState,
} from "@/lib/extensions-v2/contributions";

/**
 * Bridge between the v2 catalog and the existing command palette
 * (Application context, R6).
 *
 * Pure resolution over the already-loaded catalog: the caller passes
 * the `useV2Catalog` snapshot, so selection changes re-resolve locally
 * instead of refetching the catalog and states on every selection.
 * Entries keep v1 palette IDs untouched — v2 entries use the `v2tool:`
 * prefix and dispatch through `runV2Command`, so v1 entries and
 * shortcuts keep working. Unavailable entries are omitted here (the
 * palette filters by query); the dedicated `V2PaletteSection` shows
 * reasons.
 */
export type V2PaletteBridgeCommand = {
  extensionId: string;
  extensionName: string;
  commandId: string;
  title: string;
};

export type V2PaletteDialogOpeners = {
  /** Open the janitor report dialog (library target). */
  onOpenJanitor?: () => void;
  /** Open the gather dialog (grant orchestration lives there). */
  onOpenGather?: () => void;
};

export function useV2PaletteBridge(
  selectedIds: string[],
  catalog: ExtensionV2Catalog | null,
  uiState: V2UiState,
  openers: V2PaletteDialogOpeners = {},
): {
  v2ToolCommands: V2PaletteBridgeCommand[];
  runV2Command: (extensionId: string, commandId: string) => void;
} {
  const selectionKey = selectedIds.join("\0");

  const items = useMemo(
    () =>
      resolveV2UiPoint(
        catalog,
        "palette",
        { fileIds: selectionKey.split("\0").filter(Boolean) },
        uiState,
      ).filter((item) => item.availability.available),
    [catalog, selectionKey, uiState],
  );

  const { onOpenJanitor, onOpenGather } = openers;
  const runV2Command = useCallback(
    (extensionId: string, commandId: string) => {
      // Dialog-owned tools (same routing as row/menu invocation):
      // janitor scans/deletes and gather need their dialogs; only
      // index removals run headless from here.
      if (
        extensionId === FOLDER_JANITOR_V2_ID &&
        (commandId === FOLDER_JANITOR_V2_SCAN_LIBRARY ||
          commandId === FOLDER_JANITOR_V2_SCAN_FOLDER ||
          commandId === FOLDER_JANITOR_V2_DELETE_FOLDERS) &&
        onOpenJanitor
      ) {
        onOpenJanitor();
        return;
      }
      if (extensionId === LIBRARY_GATHERER_V2_ID && onOpenGather) {
        onOpenGather();
        return;
      }
      const fileIds = selectionKey.split("\0").filter(Boolean);
      void invokeV2Command({ extensionId, commandId, fileIds }).then((result) => {
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        const body = result.body as {
          ok?: boolean;
          error?: { message?: string };
          outcome?: { kind?: string; jobId?: string; planId?: string };
        };
        if (!body?.ok) {
          toast.error(body?.error?.message ?? "Extension command failed.");
          return;
        }
        if (body.outcome?.kind === "job") {
          toast.success(`Job started${body.outcome.jobId ? ` (${body.outcome.jobId})` : ""}.`);
        } else if (body.outcome?.kind === "review") {
          toast.success("Review ready — confirm in the extension panel.");
        } else {
          toast.success("Extension command completed.");
        }
      });
    },
    [selectionKey, onOpenJanitor, onOpenGather],
  );

  return {
    v2ToolCommands: items.map((item) => ({
      extensionId: item.extensionId,
      extensionName: item.extensionName,
      commandId: item.commandId,
      title: item.title,
    })),
    runV2Command,
  };
}
