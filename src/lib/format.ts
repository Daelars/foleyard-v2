export function formatDuration(seconds: number | null, empty = "-"): string {
  if (!seconds) return empty;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

export function formatTime(seconds: number) { return formatDuration(seconds, "0:00"); }
