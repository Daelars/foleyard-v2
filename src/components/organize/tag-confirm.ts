/**
 * Per-id tag-delete confirmation state.
 *
 * The armed "Sure?" state belongs to one tag id, mirroring the
 * collections per-id pattern. Arming tag A never leaks into tag B, and
 * Escape disarms first (keeping the editor open) before closing it.
 */

export function isTagDeleteArmed(
  confirmTagDeleteId: string | null,
  tagId: string,
): boolean {
  return confirmTagDeleteId === tagId;
}

export interface TagEscapeResult {
  confirmTagDeleteId: string | null;
  editingTagId: string | null;
}

/**
 * Resolve an Escape keypress inside the tag editor for one tag: when the
 * delete confirmation is armed for this tag, disarm it and keep editing;
 * otherwise close the editor.
 */
export function resolveTagEscape(
  confirmTagDeleteId: string | null,
  editingTagId: string | null,
  tagId: string,
): TagEscapeResult {
  if (confirmTagDeleteId === tagId) {
    return { confirmTagDeleteId: null, editingTagId };
  }
  return { confirmTagDeleteId: null, editingTagId: null };
}

/** Switching the edited tag always clears the armed confirmation. */
export function switchEditingTag(): null {
  return null;
}
