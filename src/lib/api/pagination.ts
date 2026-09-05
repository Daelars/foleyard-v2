export const DEFAULT_PAGE_SIZE = 500;
export const MAX_PAGE_SIZE = 500;

export function parsePageInteger(value: string | null, fallback: number, minimum: number, maximum?: number) {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || (maximum !== undefined && parsed > maximum)) {
    return null;
  }
  return parsed;
}

