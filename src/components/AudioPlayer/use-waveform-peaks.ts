"use client";

import { useEffect, useState } from "react";
import { computeAndCachePeaks } from "@/lib/client-waveform";
import type { AudioPlayerFileRecord } from "./types";

export function useWaveformPeaks(selectedFile: AudioPlayerFileRecord) {
  const [waveform, setWaveform] = useState<{
    fileId: string;
    data: number[];
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();

    const sourceVersion = `${selectedFile.mtimeMs ?? "unknown"}:${selectedFile.fileSize ?? "unknown"}`;
    computeAndCachePeaks(selectedFile.id, sourceVersion, controller.signal)
      .then((peaks) => {
        if (!controller.signal.aborted) {
          setWaveform({ fileId: selectedFile.id, data: peaks });
        }
      })
      .catch(() => {});

    return () => {
      controller.abort();
    };
  }, [selectedFile.id, selectedFile.fileSize, selectedFile.mtimeMs]);

  return waveform?.fileId === selectedFile.id ? waveform.data : [];
}
