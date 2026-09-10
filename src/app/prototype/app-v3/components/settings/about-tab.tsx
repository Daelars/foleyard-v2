"use client";

import { useEffect, useRef, useState } from "react";
import {
  Database,
  Download,
  ExternalLink,
  FileJson,
  Monitor,
} from "lucide-react";
import { toast } from "sonner";

import { Button, TagChip } from "@/components/variant-i";

import { getDesktopBridge } from "@/lib/desktop";

import packageJson from "../../../../../../package.json";
export const APP_VERSION = packageJson.version;

export function V3SettingsAboutTab() {
  const [isCheckingForUpdates, setIsCheckingForUpdates] = useState(false);
  const manualUpdateToastRef = useRef<string | number | null>(null);

  useEffect(() => {
    const bridge = getDesktopBridge();

    if (!bridge) {
      return;
    }

    const finishManualCheck = () => {
      setIsCheckingForUpdates(false);
      manualUpdateToastRef.current = null;
    };

    const unsubAvailable = bridge.onUpdateAvailable((info) => {
      const id = manualUpdateToastRef.current;
      if (id != null) {
        toast.loading(`Update v${info.version} available. Downloading...`, { id });
        finishManualCheck();
      }
    });

    const unsubReady = bridge.onUpdateReady((info) => {
      const id = manualUpdateToastRef.current;
      if (id != null) {
        toast.success(`Update v${info.version} is ready`, { id });
        finishManualCheck();
      }
    });

    const unsubNotAvailable = bridge.onUpdateNotAvailable(() => {
      const id = manualUpdateToastRef.current;
      if (id != null) {
        toast.success("Foleyard is up to date", { id });
        finishManualCheck();
      }
    });

    const unsubError = bridge.onUpdateError((info) => {
      const id = manualUpdateToastRef.current;
      if (id != null) {
        toast.error(`Update check failed: ${info.message}`, { id });
        finishManualCheck();
      }
    });

    return () => {
      unsubAvailable();
      unsubReady();
      unsubNotAvailable();
      unsubError();
    };
  }, []);
  const handleCheckForUpdates = async () => {
    const bridge = getDesktopBridge();

    if (!bridge) {
      toast.error("Update checks are only available in the desktop app");
      return;
    }

    setIsCheckingForUpdates(true);
    manualUpdateToastRef.current = toast.loading("Checking for updates...");

    try {
      const result = await bridge.checkForUpdates();

      if (!result.ok) {
        toast.error("Update check failed", { id: manualUpdateToastRef.current ?? undefined });
        setIsCheckingForUpdates(false);
        manualUpdateToastRef.current = null;
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Update check failed",
        { id: manualUpdateToastRef.current ?? undefined },
      );
      setIsCheckingForUpdates(false);
      manualUpdateToastRef.current = null;
    }
  };

  const handleExportRuntimeInfo = async () => {
    try {
      const res = await fetch("/api/runtime");
      const snapshot = await res.json();
      let desktop = null;
      try {
        desktop = await getDesktopBridge()?.getRuntimeInfo?.() ?? null;
      } catch {
        desktop = { error: "desktop info unavailable" };
      }
      const payload = { exportedAt: new Date().toISOString(), snapshot, desktop };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "foleyard-runtime-info.json";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Runtime info exported. See docs/runtime.md for docs IDs.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed");
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h3 className="text-2xl font-bold tracking-tight text-zinc-50">About</h3>
        <p className="mt-1 text-[13px] text-zinc-500">
          Version info, updates, and help.
        </p>
      </div>
      <div className="flex items-center gap-3 border-y border-[var(--vi-edge)] py-4">
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-lg border border-[color-mix(in_oklab,var(--accent-fill)_35%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_12%,transparent)] text-accent-text [&_svg]:size-5"
        >
          <Database />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-100">Foleyard</p>
          <p className="text-xs text-zinc-500">Local-first sound library</p>
        </div>
        <TagChip>v{APP_VERSION}</TagChip>
        <TagChip>Desktop Core</TagChip>
      </div>

      <p className="max-w-2xl text-sm leading-6 text-zinc-400">
        Foleyard is an open-source sound library. It indexes local audio so you can search and organize it.
      </p>

      <div className="flex flex-wrap gap-2 border-t border-[var(--vi-edge)] pt-4">
        <Button
          tone="secondary"
          onClick={handleCheckForUpdates}
          loading={isCheckingForUpdates}
          disabled={isCheckingForUpdates}
        >
          {isCheckingForUpdates ? null : <Download />}
          Check for Updates
        </Button>
        <Button
          tone="secondary"
          onClick={() => window.open("https://github.com/Daelars/foleyard-v2#readme", "_blank", "noopener,noreferrer")}
        >
          <ExternalLink /> Documentation
        </Button>
        <Button
          tone="secondary"
          onClick={handleExportRuntimeInfo}
        >
          <FileJson /> Export runtime info
        </Button>
        <Button
          tone="secondary"
          onClick={() => window.open("https://github.com/Daelars/foleyard-v2", "_blank", "noopener,noreferrer")}
        >
          <Monitor /> GitHub
        </Button>
      </div>

      <div className="space-y-1 border-t border-[var(--vi-edge)] pt-4 font-mono text-[10px] text-zinc-600">
        <p>© 2026 Foleyard Contributors</p>
        <p>MIT Licensed · Built with Next.js, Electron & SQLite</p>
      </div>
    </div>
  );
}