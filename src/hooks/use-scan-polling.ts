import { useEffect, useRef } from "react";

const POLL_INTERVAL_MS = 2000;

type ScanStatusResponse = {
  running: boolean;
  phase: string;
  discovered: number;
  indexed: number;
  skippedUnchanged: number;
  metadataProcessed: number;
  added: number;
  updated: number;
  removed: number;
  failed: number;
  errors: number;
  total: number;
  error: string | null;
};

export function useScanPolling(
  scanStatus: { running: boolean },
  onProgress: (status: ScanStatusResponse) => void,
  onComplete: () => void,
) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    if (!scanStatus.running) {
      return;
    }

    intervalRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/scan");
        const data = (await res.json()) as ScanStatusResponse;
        onProgress(data);

        if (!data.running) {
          onComplete();
        }
      } catch {
        // polling errors are transient; ignore
      }
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(intervalRef.current);
    };
  }, [scanStatus.running, onProgress, onComplete]);
}
