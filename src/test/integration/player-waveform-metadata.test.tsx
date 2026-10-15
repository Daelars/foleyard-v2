// @vitest-environment jsdom
import { render, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

// The player must hand its file size to the waveform pipeline, or a long file
// streams its whole body through the renderer instead of reading the server's
// generated peaks (#292).
const calls = vi.hoisted(() => ({ computeAndCachePeaks: vi.fn(async () => [0.5, 1]) }));
vi.mock("@/lib/client-waveform", () => calls);

import { useWaveformPeaks } from "@/components/AudioPlayer/use-waveform-peaks";
import type { AudioPlayerFileRecord } from "@/components/AudioPlayer/types";

function Harness({ file }: { file: AudioPlayerFileRecord }) {
  useWaveformPeaks(file);
  return null;
}

const longFile: AudioPlayerFileRecord = {
  id: "file-long",
  filename: "hour.wav",
  path: "C:/library/hour.wav",
  format: ".wav",
  duration: 3600,
  fileSize: 64 * 1024 * 1024,
  mtimeMs: 12345,
  isFavorite: false,
  tags: [],
};

beforeEach(() => {
  calls.computeAndCachePeaks.mockClear();
});

it("hands the player's file size to the peak pipeline (#292)", async () => {
  render(<Harness file={longFile} />);

  await waitFor(() => expect(calls.computeAndCachePeaks).toHaveBeenCalledTimes(1));
  expect(calls.computeAndCachePeaks).toHaveBeenCalledWith(
    "file-long",
    "12345:67108864",
    expect.any(AbortSignal),
    { sizeBytes: 64 * 1024 * 1024 },
  );
});
