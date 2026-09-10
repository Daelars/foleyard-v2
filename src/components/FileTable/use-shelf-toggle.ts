"use client";

import { useCallback } from "react";

import {
  SOUND_SHELF_V2_ADD,
  SOUND_SHELF_V2_ID,
  SOUND_SHELF_V2_REMOVE,
} from "@foleyard/sound-shelf-v2";
import { SOUND_SHELF_CHANGED_EVENT } from "@/lib/shelf-events";
import { invokeV2Command } from "@/lib/extensions-v2/contributions";

/**
 * Batch shelf endpoint payload for one file. The add-selected and
 * remove-selected commands share the batch selection shape, so a single-file
 * toggle stays on the same endpoints as the bulk flows (#90).
 */
export function buildShelfToggleRequest(fileId: string, inShelf: boolean) {
  return {
    extensionId: SOUND_SHELF_V2_ID,
    commandId: inShelf ? SOUND_SHELF_V2_REMOVE : SOUND_SHELF_V2_ADD,
    selection: { fileIds: [fileId] },
  };
}

export function useShelfToggle(fileId: string, inShelf: boolean) {
  const toggleShelf = useCallback(async () => {
    const invoked = await invokeV2Command({
      extensionId: SOUND_SHELF_V2_ID,
      commandId: inShelf ? SOUND_SHELF_V2_REMOVE : SOUND_SHELF_V2_ADD,
      fileIds: [fileId],
    });
    if (invoked.ok) {
      window.dispatchEvent(new CustomEvent(SOUND_SHELF_CHANGED_EVENT));
    }
  }, [fileId, inShelf]);

  return { toggleShelf };
}
