/**
 * Per-extension Tools-grid run actions (Application context).
 *
 * Every card gets the Make Pack treatment — a run button opening its
 * dialog or view — unless its package README prescribes otherwise.
 * Drop Rules v2 is deliberately absent: its UI is the drop zone plus
 * the palette and settings surface, with no single run action.
 */

export const V2_RUN_LABELS: Record<string, string> = {
  "make-pack-v2": "Make pack",
  "sound-shelf-v2": "Show shelf",
  "smart-collections-v2": "Save search",
  "folder-janitor-v2": "Scan & clean",
  "library-gatherer-v2": "Gather",
  "auto-tag-v2": "Auto tag",
};
