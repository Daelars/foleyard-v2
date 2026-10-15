"use client";

import { useCallback, useMemo } from "react";
import { toast } from "sonner";

import type { ExtensionV2Catalog } from "@yard-core";

import {
  invokeV2Command,
  resolveV2UiPoint,
  type V2UiState,
} from "@/lib/extensions-v2/contributions";
import {
  routeV2Command,
  surfaceUnavailableReason,
  workflowForCommand,
  type V2Workflow,
} from "@/lib/extensions-v2/command-surfaces";

/**
 * Bridge between the v2 catalog and the existing command palette
 * (Application context, R6 + #294).
 *
 * Pure resolution over the already-loaded catalog: the caller passes
 * the `useV2Catalog` snapshot, so selection changes re-resolve locally
 * instead of refetching the catalog and states on every selection.
 * Entries keep v1 palette IDs untouched — v2 entries use the `v2tool:`
 * prefix and dispatch through `runV2Command`.
 *
 * Dispatch is driven by each command's declared UI intent, never by a
 * hardcoded extension branch: `direct` commands run headless with the
 * current selection; `form`, `review`, and `confirm` commands open the
 * dedicated workflow that owns them; a review outcome is handed to the
 * review surface instead of a misleading toast. A surface-bearing
 * command with no workspace is omitted from the palette and refused
 * with a reason if invoked anyway.
 */
export type V2PaletteBridgeCommand = {
  extensionId: string;
  extensionName: string;
  commandId: string;
  title: string;
};

export type V2PaletteDialogOpeners = {
  /**
   * Open the dedicated workspace for a form/review/confirm command,
   * carrying the current selection so the workspace opens with context.
   */
  onOpenWorkflow?: (workflow: V2Workflow, fileIds: string[]) => void;
  /** Show the review + apply flow for a prepared plan. */
  onOpenReview?: (planId: string, title: string) => void;
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
  const { onOpenWorkflow, onOpenReview } = openers;

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

  const runV2Command = useCallback(
    (extensionId: string, commandId: string) => {
      const item = items.find(
        (candidate) =>
          candidate.extensionId === extensionId &&
          candidate.commandId === commandId,
      );
      const ui =
        item?.ui ?? (workflowForCommand(extensionId, commandId) ? "form" : "direct");
      const label = item?.title ?? commandId;
      const route = routeV2Command({ extensionId, commandId, ui, title: label });

      if (route.kind === "needs-surface") {
        toast.error(route.reason);
        return;
      }

      if (route.kind === "workflow") {
        if (onOpenWorkflow) {
          onOpenWorkflow(
            route.workflow,
            selectionKey.split("\0").filter(Boolean),
          );
        } else if (ui !== "direct") {
          toast.error(surfaceUnavailableReason(ui, label));
        }
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
        const outcome = body.outcome;
        if (outcome?.kind === "job") {
          toast.success(
            `Job started${outcome.jobId ? ` (${outcome.jobId})` : ""}.`,
          );
          return;
        }
        if (outcome?.kind === "review-required" && outcome.planId) {
          // Never strand a prepared plan: hand it to the review surface.
          if (onOpenReview) {
            onOpenReview(outcome.planId, label);
          } else {
            toast.error(
              `“${label}” prepared a review that this surface cannot show; open it from its extension workspace.`,
            );
          }
          return;
        }
        toast.success("Extension command completed.");
      });
    },
    [items, selectionKey, onOpenWorkflow, onOpenReview],
  );

  const v2ToolCommands = useMemo(
    () =>
      items
        .filter(
          (item) =>
            routeV2Command({
              extensionId: item.extensionId,
              commandId: item.commandId,
              ui: item.ui,
              title: item.title,
            }).kind !== "needs-surface",
        )
        .map((item) => ({
          extensionId: item.extensionId,
          extensionName: item.extensionName,
          commandId: item.commandId,
          title: item.title,
        })),
    [items],
  );

  return { v2ToolCommands, runV2Command };
}
