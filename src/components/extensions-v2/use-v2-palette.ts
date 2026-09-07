"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import type { V2ResolvedContribution } from "@yard-core";

import {
  fetchV2Catalog,
  fetchV2ExtensionStates,
  invokeV2Command,
  resolveV2UiPoint,
} from "@/lib/extensions-v2/contributions";

/**
 * Bridge between the v2 catalog and the existing command palette
 * (Application context, R6).
 *
 * Resolves `palette`-point contributions for the current selection
 * and invokes them through the single v2 execution path. Entries keep
 * v1 palette IDs untouched — v2 entries use the `v2tool:` prefix and
 * dispatch through `runV2Command`, so v1 entries and shortcuts keep
 * working. Unavailable entries are omitted here (the palette filters
 * by query); the dedicated `V2PaletteSection` shows reasons.
 */
export type V2PaletteBridgeCommand = {
  extensionId: string;
  extensionName: string;
  commandId: string;
  title: string;
};

export function useV2PaletteBridge(selectedIds: string[]): {
  v2ToolCommands: V2PaletteBridgeCommand[];
  runV2Command: (extensionId: string, commandId: string) => void;
} {
  const [items, setItems] = useState<V2ResolvedContribution[]>([]);
  const selectionKey = selectedIds.join("\0");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [catalogResult, statesResult] = await Promise.all([
        fetchV2Catalog(),
        fetchV2ExtensionStates(),
      ]);
      if (cancelled || !catalogResult.ok) return;
      const enabled = new Set(
        (statesResult.ok ? statesResult.extensions : [])
          .filter((entry) => entry.enabled)
          .map((entry) => entry.id),
      );
      const fileIds = selectionKey.split("\0").filter(Boolean);
      setItems(
        resolveV2UiPoint(
          catalogResult.catalog,
          "palette",
          { fileIds },
          { enabled, capabilities: {} },
        ).filter((item) => item.availability.available),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [selectionKey]);

  const runV2Command = useCallback(
    (extensionId: string, commandId: string) => {
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
    [selectionKey],
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
