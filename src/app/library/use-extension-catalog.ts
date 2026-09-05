"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { ExtensionGridItem } from "@/lib/extensions/types";

export interface ExtensionCatalogCallbacks {
  /** The route wires the sound-shelf slice; the catalog never writes it. */
  onSoundShelfToggled: (enabled: boolean) => void;
}

/**
 * Extension catalog slice: the tools grid owns its remote state here.
 * Settings, scan, onboarding, and shelf live in their own hooks; the
 * sound-shelf side effect travels through the explicit `onSoundShelfToggled`
 * callback.
 */
export function useExtensionCatalog(callbacks: ExtensionCatalogCallbacks) {
  const [extensions, setExtensions] = useState<ExtensionGridItem[]>([]);
  const [isLoadingExtensions, setIsLoadingExtensions] = useState(true);
  const [pendingExtensionId, setPendingExtensionId] = useState<string | null>(null);

  const extensionsRef = useRef(extensions);
  useEffect(() => {
    extensionsRef.current = extensions;
  }, [extensions]);

  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  });

  const loadExtensions = useCallback(async () => {
    setIsLoadingExtensions(true);
    try {
      const res = await fetch("/api/extensions");
      if (!res.ok) {
        throw new Error(`Failed to load extensions (${res.status})`);
      }
      const data = await res.json();
      const next = (data.extensions ?? []) as ExtensionGridItem[];
      setExtensions(next);
      return next;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to sync with server",
      );
      return null;
    } finally {
      setIsLoadingExtensions(false);
    }
  }, []);

  const handleToggleExtensionEnabled = useCallback(
    async (extensionId: string, enabled: boolean) => {
      setPendingExtensionId(extensionId);
      const previousExtensions = extensionsRef.current;
      setExtensions((current) =>
        current.map((extension) =>
          extension.id === extensionId ? { ...extension, enabled } : extension,
        ),
      );
      try {
        const res = await fetch("/api/extensions", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ extensionId, enabled }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "Failed to update extension");
        }
        setExtensions((current) =>
          current.map((extension) =>
            extension.id === extensionId ? data.extension : extension,
          ),
        );
        if (extensionId === "sound-shelf") {
          callbacksRef.current.onSoundShelfToggled(enabled);
        }
        toast.success(enabled ? "Extension enabled" : "Extension disabled");
      } catch (error) {
        setExtensions(previousExtensions);
        toast.error(
          error instanceof Error ? error.message : "Failed to update extension",
        );
      } finally {
        setPendingExtensionId(null);
      }
    },
    [],
  );

  const handleUpdateExtensionSetting = useCallback(
    async (extensionId: string, settingId: string, value: unknown) => {
      const previousExtensions = extensionsRef.current;
      setExtensions((current) =>
        current.map((extension) =>
          extension.id === extensionId
            ? {
                ...extension,
                settings: extension.settings?.map((setting) =>
                  setting.id === settingId ? { ...setting, value } : setting,
                ),
              }
            : extension,
        ),
      );
      try {
        const res = await fetch("/api/extensions", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ extensionId, settingId, value }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "Failed to update extension setting");
        }
        setExtensions((current) =>
          current.map((extension) =>
            extension.id === extensionId ? data.extension : extension,
          ),
        );
        toast.success("Extension setting saved");
      } catch (error) {
        setExtensions(previousExtensions);
        toast.error(
          error instanceof Error ? error.message : "Failed to update extension setting",
        );
      }
    },
    [],
  );

  return {
    extensions,
    isLoadingExtensions,
    pendingExtensionId,
    loadExtensions,
    handleToggleExtensionEnabled,
    handleUpdateExtensionSetting,
  };
}
