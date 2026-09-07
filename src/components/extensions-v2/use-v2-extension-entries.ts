"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { fetchV2ExtensionStates, setV2ExtensionEnabledRemote } from "@/lib/extensions-v2/contributions";
import type { V2ExtensionSettingsEntry } from "./settings";

/**
 * Live v2 extension entries shared by the Tools grid cards and the
 * Settings dialog section. Registration stays server-side; this hook
 * only sequences endpoints and refreshes after every write.
 */
export function useV2ExtensionEntries() {
  const [entries, setEntries] = useState<V2ExtensionSettingsEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const states = await fetchV2ExtensionStates();
    if (!states.ok) {
      setError(states.message);
      setLoading(false);
      return;
    }
    const loaded: V2ExtensionSettingsEntry[] = [];
    for (const extension of states.extensions) {
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
          continue;
        }
        loaded.push({
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
        });
      } catch {
        continue;
      }
    }
    setEntries(loaded);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    // Mount-time catalog fetch: the effect synchronizes server state
    // into local state once.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

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
