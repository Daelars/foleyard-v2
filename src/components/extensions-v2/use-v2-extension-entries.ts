"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  fetchV2SettingsCatalog,
  invalidateV2ClientCaches,
  setV2ExtensionEnabledRemote,
} from "@/lib/extensions-v2/contributions";
import type { V2ExtensionSettingsEntry } from "./settings";

/**
 * Live v2 extension entries shared by the Tools grid cards and the
 * Settings dialog section. Registration stays server-side; this hook
 * only sequences endpoints and refreshes after every write.
 *
 * One batched read (#295): a single request loads every extension's
 * enablement, permissions and settings. The Settings dialog used to
 * mount every panel at once and fan out one `/settings/:id` request per
 * extension; that is gone. A per-extension failure now stays in the list
 * as a `degraded` entry with a reason instead of being filtered out.
 *
 * Load-once: the loaded entries live in a process-wide cache, so the
 * second mount (settings dialog after the Tools grid, view switches,
 * StrictMode remounts) renders instantly with zero HTTP. Enable and
 * setting toggles update that cache optimistically and roll back on a
 * failed write, so the switch moves immediately and persists one request
 * instead of reloading every extension.
 */
type EntriesLoadResult = {
  entries: V2ExtensionSettingsEntry[];
  error: string | null;
};

let cachedEntries: V2ExtensionSettingsEntry[] | null = null;
let entriesInflight: Promise<EntriesLoadResult> | null = null;

function readEntriesSnapshot(): V2ExtensionSettingsEntry[] | null {
  return cachedEntries;
}

/** Drop the snapshot and any load populating it; the next read refetches. */
export function invalidateV2EntriesCache(): void {
  cachedEntries = null;
  entriesInflight = null;
}

function patchEntry(
  extensionId: string,
  patch: (entry: V2ExtensionSettingsEntry) => V2ExtensionSettingsEntry,
): V2ExtensionSettingsEntry[] {
  const current = cachedEntries ?? [];
  const next = current.map((entry) =>
    entry.id === extensionId ? patch(entry) : entry,
  );
  cachedEntries = next;
  return next;
}

function loadEntriesShared(): Promise<EntriesLoadResult> {
  if (cachedEntries) {
    return Promise.resolve({ entries: cachedEntries, error: null });
  }
  if (!entriesInflight) {
    entriesInflight = (async (): Promise<EntriesLoadResult> => {
      const result = await fetchV2SettingsCatalog();
      if (!result.ok) {
        // Total catalog failure: surfaced by the caller, never cached, so
        // the next mount or retry refetches.
        return { entries: [], error: result.message };
      }
      return {
        entries: result.extensions.map((entry) => ({
          id: entry.id,
          name: entry.name,
          version: entry.version,
          description: entry.description,
          enabled: entry.enabled,
          declaredPermissions: entry.declaredPermissions,
          effectivePermissions: entry.effectivePermissions,
          rows: entry.settings.map((row) => ({
            declaration: row.declaration,
            value: row.value,
          })),
          status: entry.status,
          error: entry.error,
        })),
        error: null,
      };
    })().then((result) => {
      entriesInflight = null;
      if (!result.error) cachedEntries = result.entries;
      return result;
    });
  }
  return entriesInflight;
}
export function useV2ExtensionEntries() {
  const [entries, setEntries] = useState<V2ExtensionSettingsEntry[]>(
    () => readEntriesSnapshot() ?? [],
  );
  const [loading, setLoading] = useState(() => readEntriesSnapshot() === null);
  const [error, setError] = useState<string | null>(null);
  const inFlightWritesRef = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    invalidateV2EntriesCache();
    invalidateV2ClientCaches();
    setLoading(true);
    const result = await loadEntriesShared();
    setEntries(result.entries);
    setError(result.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    // Mount-time load: served from the cache when a previous mount
    // already loaded — no refetch for data that cannot have changed.
    if (readEntriesSnapshot() !== null) return;
    let cancelled = false;
    void loadEntriesShared().then((result) => {
      if (cancelled) return;
      setEntries(result.entries);
      setError(result.error);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback(
    async (extensionId: string, enabled: boolean): Promise<boolean> => {
      const key = `toggle:${extensionId}`;
      if (inFlightWritesRef.current.has(key)) return false;
      inFlightWritesRef.current.add(key);
      const original = cachedEntries?.find((entry) => entry.id === extensionId);
      setEntries(patchEntry(extensionId, (entry) => ({ ...entry, enabled })));
      try {
        const result = await setV2ExtensionEnabledRemote(extensionId, enabled);
        if (!result.ok) {
          if (original) setEntries(patchEntry(extensionId, () => original));
          toast.error(result.message);
          return false;
        }
        return true;
      } finally {
        inFlightWritesRef.current.delete(key);
      }
    },
    [],
  );

  const updateSetting = useCallback(
    async (extensionId: string, settingId: string, value: unknown) => {
      const key = `setting:${extensionId}:${settingId}`;
      if (inFlightWritesRef.current.has(key)) return;
      inFlightWritesRef.current.add(key);
      const original = cachedEntries?.find((entry) => entry.id === extensionId);
      setEntries(
        patchEntry(extensionId, (entry) => ({
          ...entry,
          rows: entry.rows.map((row) =>
            row.declaration.id === settingId ? { ...row, value } : row,
          ),
        })),
      );
      try {
        const response = await fetch(
          `/api/extensions-v2/settings/${encodeURIComponent(extensionId)}/${encodeURIComponent(settingId)}`,
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ value }),
          },
        );
        const body = (await response.json().catch(() => null)) as {
          ok?: boolean;
          error?: { message?: string };
        } | null;
        if (!response.ok || !body?.ok) {
          if (original) setEntries(patchEntry(extensionId, () => original));
          toast.error(body?.error?.message ?? "Setting update failed.");
        }
      } catch (error) {
        if (original) setEntries(patchEntry(extensionId, () => original));
        toast.error(error instanceof Error ? error.message : "Setting update failed.");
      } finally {
        inFlightWritesRef.current.delete(key);
      }
    },
    [],
  );

  const reset = useCallback(
    async (extensionId: string) => {
      try {
        const response = await fetch(
          `/api/extensions-v2/settings/${encodeURIComponent(extensionId)}/reset`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({}),
          },
        );
        if (!response.ok) {
          toast.error("Settings reset failed.");
          return;
        }
        await refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Settings reset failed.");
      }
    },
    [refresh],
  );

  const approve = useCallback(
    async (extensionId: string, permissions: string[]) => {
      try {
        const response = await fetch(
          `/api/extensions-v2/extensions/${encodeURIComponent(extensionId)}/approvals`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ permissions }),
          },
        );
        const body = (await response.json().catch(() => null)) as {
          ok?: boolean;
          error?: { message?: string };
        } | null;
        if (!response.ok || !body?.ok) {
          toast.error(body?.error?.message ?? "Approval failed.");
          return;
        }
        toast.success("Permissions approved.");
        await refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Approval failed.");
      }
    },
    [refresh],
  );

  return { entries, loading, error, refresh, toggle, updateSetting, reset, approve };
}
