"use client";

import { useEffect, useState } from "react";

import { Waveform } from "@/components/ui/waveform";

const peakTasks = new Map<string, Promise<number[]>>();

function loadPeaks(fileId: string, filePath: string): Promise<number[]> {
  const hit = peakTasks.get(fileId);
  if (hit) {
    return hit;
  }

  const task = fetch(
    `/api/waveform?path=${encodeURIComponent(filePath)}&peaks=64`,
  )
    .then((response) => (response.ok ? response.json() : null))
    .then((data: unknown) => {
      const peaks = (data as { peaks?: unknown } | null)?.peaks;
      return Array.isArray(peaks)
        ? peaks.filter((peak): peak is number => typeof peak === "number")
        : [];
    })
    .catch(() => [] as number[]);
  peakTasks.set(fileId, task);
  return task;
}

export function RowWaveform({
  fileId,
  filePath,
  active,
}: {
  fileId: string;
  filePath: string;
  active: boolean;
}) {
  const [peaks, setPeaks] = useState<number[]>([]);

  useEffect(() => {
    let live = true;
    loadPeaks(fileId, filePath).then((next) => {
      if (live) {
        setPeaks(next);
      }
    });
    return () => {
      live = false;
    };
  }, [fileId, filePath]);

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
