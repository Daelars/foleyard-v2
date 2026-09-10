"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  SOUND_SHELF_V2_ADD,
  SOUND_SHELF_V2_CLEAR,
  SOUND_SHELF_V2_ID,
  SOUND_SHELF_V2_LIST,
} from "@foleyard/sound-shelf-v2";
import { SOUND_SHELF_CHANGED_EVENT } from "@/lib/extensions/sound-shelf-events";
import { invokeV2Command } from "@/lib/extensions-v2/contributions";

/** Derive the shelf file-id list from a sound-shelf list payload. */
export function toShelfFileIds(items: Array<{ id: string }>): string[] {
  return items.map((item) => item.id);
}

type ListValue = { ids?: string[] };
type OutcomeBody = {
  ok?: boolean;
  error?: { message?: string };
  outcome?: { kind?: string; value?: unknown };
};

function outcomeError(body: unknown, fallback: string): string {
  const parsed = body as OutcomeBody | null;
  if (parsed?.ok === false || parsed?.error) {
    return parsed?.error?.message ?? fallback;
  }
  return fallback;
}

async function invokeShelfV2(commandId: string, fileIds: string[] = []): Promise<OutcomeBody> {
  const invoked = await invokeV2Command({
    extensionId: SOUND_SHELF_V2_ID,
    commandId,
    fileIds,
  });
  if (!invoked.ok) {
    throw new Error(invoked.message);
  }
  return invoked.body as OutcomeBody;
}

/**
 * Sound-shelf v2 slice: shelf membership owns its remote state here.
 * Same renderer contract as the retired v1 `use-shelf`: the files data
 * layer reports loaded shelf items through `setShelfItems`, the count
 * badge refreshes through `loadShelfCount`, and shelf changes broadcast
 * through the shared shelf event. Only the transport changed — every
 * command runs through the v2 engine against `sound-shelf-v2`.
 */
export function useShelfV2() {
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
      const body = await invokeShelfV2(SOUND_SHELF_V2_LIST);
      if (!body?.ok) {
        clearShelfState();
        return;
      }
      const value = (body.outcome as { value?: ListValue } | undefined)?.value;
      const ids = Array.isArray(value?.ids) ? value.ids : [];
      setSoundShelfItemCount(ids.length);
      setSoundShelfFileIds([...ids]);
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
        const body = await invokeShelfV2(SOUND_SHELF_V2_ADD, fileIds);
        if (!body?.ok) {
          throw new Error(outcomeError(body, "Failed to add to Shelf"));
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
      const body = await invokeShelfV2(SOUND_SHELF_V2_CLEAR);
      if (!body?.ok) {
        throw new Error(outcomeError(body, "Failed to clear Shelf"));
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
