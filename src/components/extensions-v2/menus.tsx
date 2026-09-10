import type { V2ResolvedContribution } from "@yard-core";

/**
 * Drop-offer data shared with the production drop zone (#246).
 *
 * The generic renderer components that used to live here (context-menu
 * items, dropdown items, selection actions, toolbar, drop menu) were
 * never mounted: the workspace renders its own hand-built surfaces
 * through the route-local adapters, and availability is resolved with
 * the shared evaluator. Only the drop screening helper and its types
 * remain, and `V3LibraryDropZone` owns the observable drop behavior.
 */

const AUDIO_DROP_EXTENSIONS = new Set([
  "wav",
  "aiff",
  "aif",
  "flac",
  "mp3",
  "ogg",
  "oga",
  "opus",
  "m4a",
  "aac",
  "wma",
]);

/** Screen dropped names to audio files the Library can index. */
export function screenV2DropAudio(names: readonly string[]): {
  audio: string[];
  skipped: number;
} {
  const audio: string[] = [];
  let skipped = 0;
  for (const name of names) {
    const extension = name.split(".").pop()?.toLowerCase() ?? "";
    if (AUDIO_DROP_EXTENSIONS.has(extension)) audio.push(name);
    else skipped += 1;
  }
  return { audio, skipped };
}

export type V2DropOffer = {
  item: V2ResolvedContribution;
  audioCount: number;
  skipped: number;
};
