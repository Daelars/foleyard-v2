"use client";

import { useEffect, useState } from "react";

import { Waveform } from "@/components/ui/waveform";

const MAX_PEAK_TASKS = 256;
const peakTasks = new Map<string, Promise<number[]>>();

function loadPeaks(fileId: string, sourceVersion: string): Promise<number[]> {
  const cacheKey = `${fileId}:${sourceVersion}`;
  const hit = peakTasks.get(cacheKey);
  if (hit) {
    return hit;
  }

  const task = fetch(
    `/api/waveform?id=${encodeURIComponent(fileId)}&peaks=64`,
  )
    .then((response) => (response.ok ? response.json() : null))
    .then((data: unknown) => {
      const peaks = (data as { peaks?: unknown } | null)?.peaks;
      return Array.isArray(peaks)
        ? peaks.filter((peak): peak is number => typeof peak === "number")
        : [];
    })
    .then((peaks) => {
      if (peaks.length === 0) peakTasks.delete(cacheKey);
      return peaks;
    })
    .catch(() => {
      peakTasks.delete(cacheKey);
      return [] as number[];
    });
  peakTasks.set(cacheKey, task);
  while (peakTasks.size > MAX_PEAK_TASKS) {
    const oldest = peakTasks.keys().next().value as string | undefined;
    if (!oldest) break;
    peakTasks.delete(oldest);
  }
  return task;
}

export function RowWaveform({
  fileId,
  sourceVersion,
  active,
}: {
  fileId: string;
  sourceVersion: string;
  active: boolean;
}) {
  const [peaks, setPeaks] = useState<number[]>([]);

  useEffect(() => {
    let live = true;
    loadPeaks(fileId, sourceVersion).then((next) => {
      if (live) {
        setPeaks(next);
      }
    });
    return () => {
      live = false;
    };
  }, [fileId, sourceVersion]);

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
