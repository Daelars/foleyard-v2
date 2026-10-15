/**
 * True when a create composer's draft name is already a persisted entry. A
 * refresh after a failed submit resynchronizes the local draft with server
 * truth instead of letting the user resubmit a duplicate.
 */
export function draftNamePersisted(
  draftName: string,
  names: ReadonlyArray<string | null | undefined>,
): boolean {
  const target = draftName.trim().toLowerCase();
  if (!target) {
    return false;
  }
  return names.some((name) => (name ?? "").trim().toLowerCase() === target);
}
