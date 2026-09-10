"use client";

import { useCallback, useMemo } from "react";
import { toast } from "sonner";

import type { ExtensionV2Catalog } from "@yard-core";

import {
  invokeV2Command,
  resolveV2UiPoint,
  type V2UiState,
} from "@/lib/extensions-v2/contributions";
import { V2DropMenu, type V2DropOffer } from "./menus";

/**
 * Real application drop-zone bridge (Application context, R6).
 *
 * Wraps the Library workspace region with the generic `V2DropMenu`
 * adapter: genuine OS drop events on the FileTable area validate into
 * a drop context, drop-scope contributions resolve through the
 * production resolver with capability checks, and invocation runs the
 * single v2 execution path. No fixture imitation — the menu only
 * appears for validated drops on the real workspace.
 *
 * Pure resolution over the already-loaded catalog (same snapshot the
 * page holds for the palette and sidebar), so mounting the workspace
 * adds no extra catalog fetches.
 */
export function V2LibraryDropZone({
  children,
  catalog,
  uiState,
}: {
  children: React.ReactNode;
  catalog: ExtensionV2Catalog | null;
  uiState: V2UiState;
}) {
  const items = useMemo(
    () => resolveV2UiPoint(catalog, "drop-menu", { fileIds: [] }, uiState),
    [catalog, uiState],
  );

  const handleInvoke = useCallback((offer: V2DropOffer) => {
    void invokeV2Command({
      extensionId: offer.item.extensionId,
      commandId: offer.item.commandId,
      dropFileCount: offer.audioCount,
    }).then((result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      const body = result.body as { ok?: boolean; error?: { message?: string } };
      if (!body?.ok) toast.error(body?.error?.message ?? "Drop command failed.");
      else toast.success(`${offer.item.title} started for ${offer.audioCount} file(s).`);
    });
  }, []);

  if (items.length === 0) return <>{children}</>;
  return (
    <V2DropMenu items={items} onInvoke={handleInvoke} className="flex min-h-0 min-w-0 flex-1 flex-col">
      {children}
    </V2DropMenu>
  );
}
