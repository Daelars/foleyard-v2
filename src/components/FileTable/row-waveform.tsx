"use client";

import { useEffect, useState } from "react";

import { Waveform } from "@/components/ui/waveform";

import { computeAndCachePeaks } from "@/lib/client-waveform";

export function RowWaveform({
  fileId,
  sourceVersion,
  active,
  sizeBytes,
}: {
  fileId: string;
  sourceVersion: string;
  active: boolean;
  sizeBytes?: number | null;
}) {
  const [peaks, setPeaks] = useState<number[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    computeAndCachePeaks(fileId, sourceVersion, controller.signal, { sizeBytes }).then((next) => {
      if (!controller.signal.aborted) setPeaks(next);
    }).catch(() => {});
    return () => controller.abort();
  }, [fileId, sourceVersion, sizeBytes]);

  return (
    <Waveform
      data={peaks}
      height={34}
      barWidth={3}
      barGap={1}
      barRadius={999}
      barColor={active ? "var(--accent-fill)" : "rgba(255,255,255,0.25)"}
      fadeEdges={false}
      className="w-full"
      aria-hidden="true"
    />
  );
}
