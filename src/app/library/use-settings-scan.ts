"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useZoom } from "@/hooks/use-zoom";
import { useScanPolling } from "@/hooks/use-scan-polling";
import { emptyScanStatus, type ScanStatusResponse } from "@/lib/scanner/types";
import {
  loadRemoveDefault,
  persistRemoveDefault,
  type RemoveDefault,
} from "@/components/Shortcuts/shortcuts";
import { CURRENT_ONBOARDING_VERSION } from "./types";

export interface LibrarySettings {
  libraryRoot: string | null;
  libraryRoots: string[];
  onboardingVersion: number;
  stats: { activeFiles: number; removedFiles: number };
}

export type ScanToast =
  | { kind: "error"; message: string }
  | { kind: "warning"; message: string }
  | { kind: "success"; message: string };

/** Pure settle toast: errors win, then skipped items, then success. */
export function resolveScanToast(status: ScanStatusResponse): ScanToast {
  if (status.phase === "error" || status.error) {
    return { kind: "error", message: status.error ?? "Scan failed" };
  }
  if (status.errors > 0) {
    return {
      kind: "warning",
      message: `Scan complete with ${status.errors} skipped item${status.errors === 1 ? "" : "s"}`,
    };
  }
  return { kind: "success", message: "Scan complete" };
}

export interface SettingsScanCallbacks {
  /** Targeted post-scan refetch owned by the route composition. */
  onScanSettled: () => void;
}

/**
 * Settings and scan slice: library roots, scan status, onboarding, zoom, and
 * the remove default own their remote state here. Scan polling and its settle
 * toast live here too; the actual post-scan refetch arrives through the
 * explicit `onScanSettled` callback so this hook never writes another hook's
 * state.
 */
export function useSettingsScan(callbacks: SettingsScanCallbacks) {
  const [settings, setSettings] = useState<LibrarySettings>({
    libraryRoot: null,
    libraryRoots: [],
    onboardingVersion: 0,
    stats: { activeFiles: 0, removedFiles: 0 },
  });
  const [scanStatus, setScanStatus] = useState<ScanStatusResponse>(emptyScanStatus);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [removeDefault, setRemoveDefault] =
    useState<RemoveDefault>(loadRemoveDefault);
  const { zoom, setZoom: handleUpdateZoom } = useZoom();

  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  });

  const loadSettingsScan = useCallback(async () => {
    try {
      const [settingsRes, scanRes] = await Promise.all([
        fetch("/api/settings"),
        fetch("/api/scan"),
      ]);
      if (!settingsRes.ok) {
        throw new Error(`Failed to load settings (${settingsRes.status})`);
      }
      if (!scanRes.ok) {
        throw new Error(`Failed to load scan (${scanRes.status})`);
      }
      const [settingsData, scanData] = await Promise.all([
        settingsRes.json(),
        scanRes.json(),
      ]);
      const nextLibraryRoots =
        settingsData.libraryRoots ??
        (settingsData.libraryRoot ? [settingsData.libraryRoot] : []);
      const nextOnboardingVersion = settingsData.onboardingVersion ?? 0;
      setSettings({
        ...settingsData,
        libraryRoots: nextLibraryRoots,
        onboardingVersion: nextOnboardingVersion,
      });
      setShowOnboarding(
        nextOnboardingVersion < CURRENT_ONBOARDING_VERSION &&
          nextLibraryRoots.length === 0,
      );
      setScanStatus(scanData);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to sync with server",
      );
    }
  }, []);

  const saveLibraryRoot = useCallback(async (path: string) => {
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", path }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to save settings");
      }
      setSettings((current) => ({
        libraryRoot: data.libraryRoot,
        libraryRoots: data.libraryRoots ?? (data.libraryRoot ? [data.libraryRoot] : []),
        onboardingVersion: data.onboardingVersion ?? current.onboardingVersion,
        stats: data.stats,
      }));
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save settings",
      );
      return false;
    }
  }, []);

  const handleSaveRoot = useCallback(
    async (path: string) => {
      await saveLibraryRoot(path);
    },
    [saveLibraryRoot],
  );

  const handleRemoveRoot = useCallback(async (path: string) => {
    const previous = settings;
    const nextRoots = previous.libraryRoots.filter((root) => root !== path);
    setSettings({
      ...previous,
      libraryRoot: nextRoots[0] ?? null,
      libraryRoots: nextRoots,
    });
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", path }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to remove library folder");
      }
      setSettings((current) => ({
        libraryRoot: data.libraryRoot,
        libraryRoots: data.libraryRoots ?? (data.libraryRoot ? [data.libraryRoot] : []),
        onboardingVersion: data.onboardingVersion ?? current.onboardingVersion,
        stats: data.stats,
      }));
    } catch (error) {
      setSettings(previous);
      toast.error(
        error instanceof Error ? error.message : "Failed to remove library folder",
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  });

  const handleCompleteOnboarding = useCallback(async () => {
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "onboarding_complete" }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to complete onboarding");
      }
      setSettings((current) => ({
        ...current,
        onboardingVersion: data.onboardingVersion ?? CURRENT_ONBOARDING_VERSION,
      }));
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to complete onboarding",
      );
      return false;
    }
  }, []);

  const startLibraryScan = useCallback(async () => {
    try {
      const res = await fetch("/api/scan", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to start scan");
      }
      setScanStatus(data.status);
      toast.info("Scan started");
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start scan");
      return false;
    }
  }, []);

  const handleStartScan = useCallback(async () => {
    await startLibraryScan();
  }, [startLibraryScan]);

  const handleRemoveDefaultChange = useCallback((value: RemoveDefault) => {
    setRemoveDefault(value);
    persistRemoveDefault(value);
  }, []);

  const openSettings = useCallback(() => setShowSettings(true), []);

  useScanPolling(
    scanStatus,
    setScanStatus,
    useCallback((status: ScanStatusResponse) => {
      callbacksRef.current.onScanSettled();
      const settled = resolveScanToast(status);
      if (settled.kind === "error") {
        toast.error(settled.message);
      } else if (settled.kind === "warning") {
        toast.warning(settled.message);
      } else {
        toast.success(settled.message);
      }
    }, []),
  );

  return {
    settings,
    scanStatus,
    showOnboarding,
    setShowOnboarding,
    showSettings,
    setShowSettings,
    openSettings,
    removeDefault,
    zoom,
    handleUpdateZoom,
    loadSettingsScan,
    saveLibraryRoot,
    handleSaveRoot,
    handleRemoveRoot,
    handleCompleteOnboarding,
    startLibraryScan,
    handleStartScan,
    handleRemoveDefaultChange,
  };
}
