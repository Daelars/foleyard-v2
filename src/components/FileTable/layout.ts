export const FILE_TABLE_GRID_DEFAULT =
  "grid-cols-[32px_minmax(0,1fr)_140px_64px_28px]";
export const FILE_TABLE_GRID_DESKTOP =
  "grid-cols-[32px_minmax(0,1fr)_140px_64px_28px_28px]";

export function fileTableGridClass(desktop: boolean): string {
  return desktop ? FILE_TABLE_GRID_DESKTOP : FILE_TABLE_GRID_DEFAULT;
}
