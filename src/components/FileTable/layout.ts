export const FILE_TABLE_GRID_DEFAULT =
  "grid-cols-[32px_minmax(0,1fr)_140px_64px_28px]";
export const FILE_TABLE_GRID_DESKTOP =
  "grid-cols-[32px_minmax(0,1fr)_140px_64px_28px_28px]";

/** Columns in the default grid: play, name, wave, time, favorite. */
export const FILE_TABLE_COLUMN_COUNT = 5;
/** The desktop grid adds the drag handle column. */
export const FILE_TABLE_COLUMN_COUNT_DESKTOP = 6;

export function fileTableGridClass(desktop: boolean): string {
  return desktop ? FILE_TABLE_GRID_DESKTOP : FILE_TABLE_GRID_DEFAULT;
}

/**
 * Column count for the grid's `aria-colcount`. The small-screen `hidden`
 * classes only hide a column's content; the grid track (and so the column
 * index) stays, which is why `aria-colindex` is on every cell.
 */
export function fileTableColumnCount(desktop: boolean): number {
  return desktop ? FILE_TABLE_COLUMN_COUNT_DESKTOP : FILE_TABLE_COLUMN_COUNT;
}
