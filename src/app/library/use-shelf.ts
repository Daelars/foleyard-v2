"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { SOUND_SHELF_CHANGED_EVENT } from "@/lib/extensions/sound-shelf-events";

/** Derive the shelf file-id list from a sound-shelf list payload. */
export function toShelfFileIds(items: Array<{ id: string }>): string[] {
  return items.map((item) => item.id);
}

/**
 * Sound-shelf slice: shelf membership owns its remote state here. The files
 * data layer reports loaded shelf items through `setShelfItems`; the count
 * badge refreshes through `loadShelfCount`. This hook never writes another
 * hook's state — shelf changes broadcast through the shared shelf event.
 */
export function useShelf() {
  const [soundShelfItemCount, setSoundShelfItemCount] = useState(0);
  const [soundShelfFileIds, setSoundShelfFileIds] = useState<string[]>([]);
  const [confirmClearShelf, setConfirmClearShelf] = useState(false);

  useEffect(() => {
    if (!confirmClearShelf) {
      return;
    }
    const timer = window.setTimeout(() => setConfirmClearShelf(false), 4000);
    return () => window.clearTimeout(timer);
  }, [confirmClearShelf]);

  const setShelfItems = useCallback(
    (items: Array<{ id: string }>) => {
      setSoundShelfItemCount(items.length);
      setSoundShelfFileIds(toShelfFileIds(items));
    },
    [],
  );

  const clearShelfState = useCallback(() => {
    setSoundShelfItemCount(0);
    setSoundShelfFileIds([]);
  }, []);

  const loadShelfCount = useCallback(async () => {
    try {
      const res = await fetch("/api/extensions/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extensionId: "sound-shelf",
          commandId: "sound-shelf.list",
        }),
      });
      if (!res.ok) {
        clearShelfState();
        return;
      }
      const data = (await res.json()) as {
        ok?: boolean;
        value?: { items?: Array<{ id: string }> };
      };
      if (data?.ok === false) {
        clearShelfState();
        return;
      }
      const items = data.value?.items ?? [];
      setSoundShelfItemCount(items.length);
      setSoundShelfFileIds(toShelfFileIds(items));
    } catch {
      clearShelfState();
    }
  }, [clearShelfState]);

  const addToShelf = useCallback(
    async (fileIds: string[]) => {
      if (fileIds.length === 0) {
        return;
      }
      try {
        const res = await fetch("/api/extensions/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            extensionId: "sound-shelf",
            commandId: "sound-shelf.add-selected",
            selection: { fileIds },
          }),
        });
        if (!res.ok) {
          throw new Error();
        }
        const data = (await res.json()) as { ok?: boolean };
        if (data?.ok === false) {
          throw new Error();
        }
        window.dispatchEvent(new CustomEvent(SOUND_SHELF_CHANGED_EVENT));
        void loadShelfCount();
        toast.success(
          fileIds.length === 1 ? "Added to Shelf" : `Added ${fileIds.length} sound(s) to Shelf`,
        );
      } catch {
        toast.error(
          fileIds.length === 1 ? "Failed to add to Shelf" : "Failed to add sounds to Shelf",
        );
      }
    },
    [loadShelfCount],
  );

  const clearShelf = useCallback(async () => {
    try {
      const res = await fetch("/api/extensions/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extensionId: "sound-shelf",
          commandId: "sound-shelf.clear",
        }),
      });
      if (!res.ok) {
        throw new Error();
      }
      const data = (await res.json()) as { ok?: boolean };
      if (data?.ok === false) {
        throw new Error();
      }
      window.dispatchEvent(new CustomEvent(SOUND_SHELF_CHANGED_EVENT));
    } catch {
      toast.error("Failed to clear Shelf");
    }
  }, []);

  const requestClearShelf = useCallback(() => {
    setConfirmClearShelf(true);
  }, []);

  const cancelClearShelf = useCallback(() => {
    setConfirmClearShelf(false);
  }, []);

  return {
    soundShelfItemCount,
    soundShelfFileIds,
    confirmClearShelf,
    setShelfItems,
    clearShelfState,
    loadShelfCount,
    addToShelf,
    clearShelf,
    requestClearShelf,
    cancelClearShelf,
  };
}
