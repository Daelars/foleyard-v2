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
 */
export function V2LibraryDropZone({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<V2ResolvedContribution[]>([]);

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
      setItems(
        resolveV2UiPoint(
          catalogResult.catalog,
          "drop-menu",
          { fileIds: [] },
          { enabled, capabilities: {} },
        ),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
