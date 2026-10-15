/**
 * Human-readable playback failures (#291). `MediaError.code` follows the
 * HTML spec: 1 ABORTED, 2 NETWORK, 3 DECODE, 4 SRC_NOT_SUPPORTED. The player
 * shows one of these instead of stalling silently, so a missing file,
 * incompatible codec or dropped connection is recoverable.
 */
export function describeMediaError(
  error: { code?: number } | null | undefined,
): string {
  switch (error?.code) {
    case 1:
      return "Playback was interrupted before this sound started.";
    case 2:
      return "A network error stopped this sound from loading. Check the connection and retry.";
    case 3:
      return "This file could not be decoded. It may use an unsupported codec or be damaged.";
    case 4:
      return "This file could not be loaded. It may be missing or in a format this player does not support.";
    default:
      return "This sound could not be played.";
  }
}
