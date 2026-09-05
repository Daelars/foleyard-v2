import { useEffect, useRef } from "react";

const POLL_INTERVAL_MS = 2000;

import type { ScanStatusResponse } from "@/lib/scanner/types";

export function useScanPolling(
  scanStatus: { running: boolean },
  onProgress: (status: ScanStatusResponse) => void,
  onSettled: (status: ScanStatusResponse) => void,
) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    if (!scanStatus.running) {
      return;
    }

    intervalRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/scan");
        if (!res.ok) {
          return;
        }
        const data = (await res.json()) as ScanStatusResponse;
        onProgress(data);

        if (!data.running) {
          onSettled(data);
        }
      } catch {
        // polling errors are transient; ignore
      }
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(intervalRef.current);
    };
  }, [scanStatus.running, onProgress, onSettled]);
}
