/** Extract the trimmed search query from a smart-collection filter JSON. */
export function extractSmartQuery(filter?: string | null): string | null {
  if (!filter) {
    return null;
  }
  try {
    const parsed = JSON.parse(filter) as { q?: unknown };
    if (typeof parsed.q === "string" && parsed.q.trim()) {
      return parsed.q.trim();
    }
    return null;
  } catch {
    return null;
  }
}
