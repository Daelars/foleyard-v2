/** Both list rows and the player read the server's persistent peak cache. */
export async function computeAndCachePeaks(
  fileId: string,
  sourceVersion: string,
  signal?: AbortSignal,
): Promise<number[]> {
  const response = await fetch(`/api/waveform?id=${encodeURIComponent(fileId)}&version=${encodeURIComponent(sourceVersion)}`, { signal, cache: "no-store" });
  if (!response.ok) throw new Error(`Waveform request failed with ${response.status}`);
  const data: unknown = await response.json();
  const peaks = (data as { peaks?: unknown } | null)?.peaks;
  if (!Array.isArray(peaks) || !peaks.every((peak) => typeof peak === "number" && Number.isFinite(peak))) {
    throw new Error("Invalid waveform response");
  }
  return peaks;
}
