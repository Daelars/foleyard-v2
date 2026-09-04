export const MATRIX_SIZE = 5;
export const CENTER = Math.floor(MATRIX_SIZE / 2);
const MAX_RADIUS = Math.hypot(CENTER, CENTER);

export function rowMajorIndex(row: number, col: number): number {
  return row * MATRIX_SIZE + col;
}

export function indexToCoord(index: number): { row: number; col: number } {
  return {
    row: Math.floor(index / MATRIX_SIZE),
    col: index % MATRIX_SIZE
  };
}

export function distanceFromCenter(index: number): number {
  const { row, col } = indexToCoord(index);
  return Math.hypot(row - CENTER, col - CENTER);
}

export function rowDistance(index: number): number {
  const { row } = indexToCoord(index);
  return Math.abs(row - CENTER);
}

export function polarAngle(index: number): number {
  const { row, col } = indexToCoord(index);
  return Math.atan2(row - CENTER, col - CENTER);
}

export function normalizedRadius(index: number): number {
  const { row, col } = indexToCoord(index);
  return Math.hypot(row - CENTER, col - CENTER) / MAX_RADIUS;
}

export function manhattanDistance(index: number): number {
  const { row, col } = indexToCoord(index);
  return Math.abs(row - CENTER) + Math.abs(col - CENTER);
}

