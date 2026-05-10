import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { getDesktopBridge } from "@/lib/desktop";

const ZOOM_STORAGE_KEY = "foleyard-zoom";
const ZOOM_MIN = 50;
const ZOOM_MAX = 200;
const ZOOM_STEP = 10;

export function useZoom() {
  const [zoom, setZoom] = useState(100);

  const handleUpdateZoom = useCallback((level: number) => {
    setZoom(level);
    localStorage.setItem(ZOOM_STORAGE_KEY, String(level));
  }, []);

  const hardResetZoom = useCallback(() => {
    localStorage.removeItem(ZOOM_STORAGE_KEY);
    window.location.reload();
  }, []);

  useEffect(() => {
    const savedZoom = localStorage.getItem(ZOOM_STORAGE_KEY);
    if (savedZoom) {
      const level = Number.parseInt(savedZoom, 10);
      if (!Number.isNaN(level)) {
        setZoom(level);
      }
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const factor = zoom / 100;

    const bridge = getDesktopBridge();
    if (bridge && typeof bridge.setZoomFactor === "function") {
      bridge.setZoomFactor(factor);
    } else if (zoom === 100) {
      root.style.zoom = "";
    } else {
      root.style.zoom = String(factor);
    }
  }, [zoom]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;

      if (e.key === "0" || e.code === "Digit0" || e.code === "Numpad0") {
        e.preventDefault();
        handleUpdateZoom(100);
        toast.info("Zoom reset to 100%", {
          action: {
            label: "Hard Reset",
            onClick: hardResetZoom,
          },
        });
      } else if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        handleUpdateZoom(Math.min(zoom + ZOOM_STEP, ZOOM_MAX));
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        handleUpdateZoom(Math.max(zoom - ZOOM_STEP, ZOOM_MIN));
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [zoom, handleUpdateZoom, hardResetZoom]);

  return { zoom, setZoom: handleUpdateZoom, hardResetZoom };
}
