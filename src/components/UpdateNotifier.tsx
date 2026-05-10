"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { getDesktopBridge, isDesktopApp } from "@/lib/desktop";

export function UpdateNotifier() {
  const progressToastRef = useRef<string | number | null>(null);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) {
      return;
    }

    const unsubAvailable = bridge.onUpdateAvailable((info) => {
      progressToastRef.current = toast.loading(
        `Update v${info.version} available — downloading...`,
      );
    });

    const unsubProgress = bridge.onUpdateDownloadProgress((progress) => {
      const id = progressToastRef.current;
      if (id != null) {
        toast.loading(`Downloading update (${Math.round(progress.percent)}%)...`, { id });
      }
    });

    const unsubReady = bridge.onUpdateReady((info) => {
      const id = progressToastRef.current;
      if (id != null) {
        toast.dismiss(id);
        progressToastRef.current = null;
      }
      toast(`Update v${info.version} ready`, {
        description: "Restart to apply the update",
        action: {
          label: "Restart",
          onClick: () => {
            bridge.installUpdate();
          },
        },
        duration: Infinity,
      });
    });

    const unsubError = bridge.onUpdateError((info) => {
      const id = progressToastRef.current;
      if (id != null) {
        toast.dismiss(id);
        progressToastRef.current = null;
      }
      toast.error(`Update failed: ${info.message}`);
    });

    const unsubNotAvailable = bridge.onUpdateNotAvailable(() => {});

    return () => {
      unsubAvailable();
      unsubProgress();
      unsubReady();
      unsubError();
      unsubNotAvailable();
    };
  }, []);

  return null;
}
