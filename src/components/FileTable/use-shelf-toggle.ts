"use client";

import { useCallback } from "react";

import { SOUND_SHELF_CHANGED_EVENT } from "@/lib/extensions/sound-shelf-events";

/**
 * Batch shelf endpoint payload for one file. The add-selected and
 * remove-selected commands share the batch selection shape, so a single-file
 * toggle stays on the same endpoints as the bulk flows (#90).
 */
export function buildShelfToggleRequest(fileId: string, inShelf: boolean) {
  return {
    extensionId: "sound-shelf",
    commandId: inShelf
      ? "sound-shelf.remove-selected"
      : "sound-shelf.add-selected",
    selection: { fileIds: [fileId] },
  };
}

export function useShelfToggle(fileId: string, inShelf: boolean) {
  const toggleShelf = useCallback(async () => {
    const response = await fetch("/api/extensions/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildShelfToggleRequest(fileId, inShelf)),
    });
    if (response.ok) {
      const data = (await response.json()) as { ok?: boolean };
      if (data?.ok !== false) {
        window.dispatchEvent(new CustomEvent(SOUND_SHELF_CHANGED_EVENT));
      }
    }
  }, [fileId, inShelf]);

  return { toggleShelf };
}
