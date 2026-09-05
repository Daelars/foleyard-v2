export interface SelectionScrollInput {
  files: { id: string }[];
  directoryCount: number;
  selectedFileId: string | null;
  prevSelectedFileId: string | null;
}

/**
 * Decides whether a selection change should move the viewport, returning the
 * virtual-list index to scroll to or null to leave the viewport alone.
 *
 * List mutations that keep the same selection (favourite toggles, optimistic
 * updates, page appends) return null so favouriting a row while scrolled
 * elsewhere never jumps the viewport. Genuine selection changes (click,
 * keyboard move, palette, transport) return the row index so the newly
 * selected row still scrolls into view.
 */
export function resolveSelectionScrollIndex({
  files,
  directoryCount,
  selectedFileId,
  prevSelectedFileId,
}: SelectionScrollInput): number | null {
  if (!selectedFileId) {
    return null;
  }

  if (prevSelectedFileId !== null && prevSelectedFileId === selectedFileId) {
    return null;
  }

  const index = files.findIndex((file) => file.id === selectedFileId);
  if (index < 0) {
    return null;
  }

  return directoryCount + index;
}
