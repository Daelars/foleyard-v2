export function toggleInSelection(
  selectedIds: string[],
  id: string,
): string[] {
  if (selectedIds.includes(id)) {
    return selectedIds.filter((selectedId) => selectedId !== id);
  }

  return [...selectedIds, id];
}

export function rangeSelect(
  orderedIds: string[],
  anchorId: string | null,
  targetId: string,
): string[] {
  const anchorIndex = anchorId === null ? -1 : orderedIds.indexOf(anchorId);
  const targetIndex = orderedIds.indexOf(targetId);

  if (anchorIndex === -1 || targetIndex === -1) {
    return [targetId];
  }

  const [from, to] =
    anchorIndex <= targetIndex
      ? [anchorIndex, targetIndex]
      : [targetIndex, anchorIndex];

  return orderedIds.slice(from, to + 1);
}

export function clearSelection(): string[] {
  return [];
}
