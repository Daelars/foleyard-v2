"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { fetchV2ExtensionStatesCached, invalidateV2ClientCaches, setV2ExtensionEnabledRemote } from "@/lib/extensions-v2/contributions";
import type { V2ExtensionSettingsEntry } from "./settings";

/**
 * Live v2 extension entries shared by the Tools grid cards and the
 * Settings dialog section. Registration stays server-side; this hook
 * only sequences endpoints and refreshes after every write.
 *
 * Load-once: the loaded entries live in a process-wide cache, so the
 * second mount (settings dialog after the Tools grid, view switches,
 * StrictMode remounts) renders instantly with zero HTTP. Every write
 * path below (toggle, setting update, reset, approve) invalidates and
 * reloads, which is the only way the data can change.
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

export function invalidateV2EntriesCache(): void {
  cachedEntries = null;
}

function loadEntriesShared(): Promise<EntriesLoadResult> {
  if (cachedEntries) {
    return Promise.resolve({ entries: cachedEntries, error: null });
  }
  if (!entriesInflight) {
    entriesInflight = (async (): Promise<EntriesLoadResult> => {
      const states = await fetchV2ExtensionStatesCached();
      if (!states.ok) {
        return { entries: [], error: states.message };
      }
      // One round trip per extension, all in parallel: the previous
      // sequential for-await loop made load time the sum of every
      // settings response instead of the slowest one.
      const settled = await Promise.all(
        states.extensions.map(async (extension) => {
          try {
            const response = await fetch(
              `/api/extensions-v2/settings/${encodeURIComponent(extension.id)}`,
            );
            const body = (await response.json().catch(() => null)) as {
              ok?: boolean;
              declaredPermissions?: string[];
              effectivePermissions?: string[];
              settings?: Array<{ declaration: V2ExtensionSettingsEntry["rows"][number]["declaration"]; value: unknown }>;
              error?: { message?: string };
            } | null;
            if (!response.ok || !body?.ok) {
              return null;
            }
            return {
              id: extension.id,
              name: extension.name,
              version: extension.version,
              description: extension.description,
              enabled: extension.enabled,
              declaredPermissions: body.declaredPermissions ?? [],
              effectivePermissions: body.effectivePermissions ?? [],
              rows: (body.settings ?? []).map((row) => ({
                declaration: row.declaration,
                value: row.value,
              })),
            } satisfies V2ExtensionSettingsEntry;
          } catch {
            return null;
          }
        }),
      );
      return {
        entries: settled.filter(
          (entry): entry is V2ExtensionSettingsEntry => entry !== null,
        ),
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
    async (extensionId: string, enabled: boolean) => {
      const result = await setV2ExtensionEnabledRemote(extensionId, enabled);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      await refresh();
    },
    [refresh],
  );

  const updateSetting = useCallback(
    async (extensionId: string, settingId: string, value: unknown) => {
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
          toast.error(body?.error?.message ?? "Setting update failed.");
          return;
        }
        await refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Setting update failed.");
      }
    },
    [refresh],
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
