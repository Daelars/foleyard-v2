"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  resolveV2PointContributions,
  sanitizeV2SelectionIds,
  type ExtensionV2Catalog,
  type ExtensionV2CatalogEntry,
  type V2AvailabilityContext,
  type V2ContributionPoint,
  type V2ResolvedContribution,
} from "@yard-core";

/**
 * Application v2 contribution adapters (Application context, R6).
 *
 * Generic, data-only resolution for all eight contribution points.
 * Definitions describe data; these adapters turn the serializable
 * catalog plus the shared availability evaluator into per-point item
 * lists that renderer components consume without extension-specific
 * branches. No v1 extension modules are imported here
 * (`src/lib/extensions/*`, v1 UI-intent dispatch, v1 transport).
 *
 * Selection/context updates: callers pass a fresh `V2UiContext` on
 * every selection change; keys are stable (`v2:{ext}:{contrib}`) so
 * React lists keep identity while availability reasons refresh.
 * Disable/unregister: disabled extensions resolve to nothing, and
 * `useV2Catalog` refetches after the enabled PATCH so removals
 * propagate; every subscription returns an idempotent dispose that
 * adapters must call on unmount.
 */

export type V2UiContext = {
  fileIds: string[];
  folderPath?: string;
  collectionId?: string;
  dropFileCount?: number;
  input?: unknown;
};

export type V2UiState = {
  /** Enabled extension IDs. Missing entries count as disabled. */
  enabled: ReadonlySet<string> | readonly string[];
  capabilities: Record<string, boolean>;
};

export function emptyV2UiState(): V2UiState {
  return { enabled: [], capabilities: {} };
}

function isEnabledIn(state: V2UiState, extensionId: string): boolean {
  const enabled = state.enabled;
  if (typeof (enabled as ReadonlySet<string>).has === "function") {
    return (enabled as ReadonlySet<string>).has(extensionId);
  }
  return (enabled as readonly string[]).includes(extensionId);
}

/**
 * Resolve one point for the current UI context. The effective
 * (declared ∩ approved) permissions travel in the catalog entries
 * themselves, so renderer availability matches execution preflight.
 */
export function resolveV2UiPoint(
  catalog: ExtensionV2Catalog | null | undefined,
  point: V2ContributionPoint,
  uiContext: V2UiContext,
  uiState: V2UiState,
): V2ResolvedContribution[] {
  if (!catalog) return [];
  const context: V2AvailabilityContext = {
    fileIds: sanitizeV2SelectionIds(uiContext.fileIds),
    ...(uiContext.folderPath ? { folderPath: uiContext.folderPath } : {}),
    ...(uiContext.collectionId ? { collectionId: uiContext.collectionId } : {}),
    ...(uiContext.dropFileCount !== undefined
      ? { dropFileCount: uiContext.dropFileCount }
      : {}),
    ...(uiContext.input !== undefined ? { input: uiContext.input } : {}),
  };
  return resolveV2PointContributions(catalog.entries, point, context, {
    isEnabled: (id) => isEnabledIn(uiState, id),
    capabilities: uiState.capabilities,
    grantedPermissions: (id) =>
      catalog.entries.find((entry) => entry.id === id)?.permissions ?? [],
  });
}

/** Non-point-specific entry lookup for settings/enablement panels. */
export function listV2CatalogEntries(
  catalog: ExtensionV2Catalog | null | undefined,
): ExtensionV2CatalogEntry[] {
  return catalog?.entries ?? [];
}

export type V2ExtensionState = {
  id: string;
  name: string;
  version: string;
  description: string;
  enabled: boolean;
  effectivePermissions: string[];
};

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

/** Fetch the serializable v2 catalog (data only; never executes). */
export async function fetchV2Catalog(): Promise<{
  ok: true;
  catalog: ExtensionV2Catalog;
} | { ok: false; message: string }> {
  let response: Response;
  try {
    response = await fetch("/api/extensions-v2");
  } catch (error) {
    return {
      ok: false,
      message: `Catalog request failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  const body = (await readJson(response)) as {
    ok?: boolean;
    catalog?: ExtensionV2Catalog;
    error?: { message?: string };
  } | null;
  if (!response.ok || !body?.ok || !body.catalog) {
    return {
      ok: false,
      message: body?.error?.message ?? `Catalog request failed with ${response.status}.`,
    };
  }
  return { ok: true, catalog: body.catalog };
}

/** Fetch enablement + effective permissions for the settings adapter. */
export async function fetchV2ExtensionStates(): Promise<{
  ok: true;
  extensions: V2ExtensionState[];
} | { ok: false; message: string }> {
  let response: Response;
  try {
    response = await fetch("/api/extensions-v2/extensions");
  } catch (error) {
    return {
      ok: false,
      message: `Extension states request failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  const body = (await readJson(response)) as {
    ok?: boolean;
    extensions?: V2ExtensionState[];
    error?: { message?: string };
  } | null;
  if (!response.ok || !body?.ok || !body.extensions) {
    return {
      ok: false,
      message: body?.error?.message ?? `Extension states request failed with ${response.status}.`,
    };
  }
  return { ok: true, extensions: body.extensions };
}

/** Enable or disable a v2 extension; the server emits `contributions-changed`. */
export async function setV2ExtensionEnabledRemote(
  extensionId: string,
  enabled: boolean,
): Promise<{ ok: true } | { ok: false; message: string }> {
  let response: Response;
  try {
    response = await fetch(
      `/api/extensions-v2/extensions/${encodeURIComponent(extensionId)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled }),
      },
    );
  } catch (error) {
    return {
      ok: false,
      message: `Enablement request failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (!response.ok) {
    const body = (await readJson(response)) as {
      error?: { message?: string };
    } | null;
    return {
      ok: false,
      message: body?.error?.message ?? `Enablement request failed with ${response.status}.`,
    };
  }
  return { ok: true };
}

export type V2ExecuteResponse =
  | { ok: true; status: number; body: unknown }
  | { ok: false; message: string };

/** Invoke a v2 command through the single execution path. */
export async function invokeV2Command(input: {
  extensionId: string;
  commandId: string;
  fileIds?: string[];
  folderPath?: string;
  collectionId?: string;
  dropFileCount?: number;
  commandInput?: unknown;
}): Promise<V2ExecuteResponse> {
  let response: Response;
  try {
    response = await fetch("/api/extensions-v2/execute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        extensionId: input.extensionId,
        commandId: input.commandId,
        selection: {
          fileIds: sanitizeV2SelectionIds(input.fileIds ?? []),
          ...(input.folderPath ? { folderPath: input.folderPath } : {}),
          ...(input.collectionId ? { collectionId: input.collectionId } : {}),
          ...(input.dropFileCount !== undefined
            ? { dropFileCount: input.dropFileCount }
            : {}),
        },
        ...(input.commandInput !== undefined ? { input: input.commandInput } : {}),
      }),
    });
  } catch (error) {
    return {
      ok: false,
      message: `Invocation failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  return { ok: true, status: response.status, body: await readJson(response) };
}

export type V2CatalogSnapshot = {
  catalog: ExtensionV2Catalog | null;
  extensions: V2ExtensionState[];
  error: string | null;
  loading: boolean;
  refresh: () => void;
};

/**
 * Client catalog subscription. Fetches once on mount, refetches on
 * demand (after enable/disable writes) and when the tab becomes
 * visible again, and disposes in-flight requests on unmount — so dev
 * reloads never stack duplicate fetches or listeners.
 */
export function useV2Catalog(): V2CatalogSnapshot {
  const [catalog, setCatalog] = useState<ExtensionV2Catalog | null>(null);
  const [extensions, setExtensions] = useState<V2ExtensionState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setNonce((value) => value + 1);
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    abortRef.current?.abort();
    abortRef.current = abort;
    void (async () => {
      const [catalogResult, statesResult] = await Promise.all([
        fetchV2Catalog(),
        fetchV2ExtensionStates(),
      ]);
      if (abort.signal.aborted) return;
      if (!catalogResult.ok) {
        setError(catalogResult.message);
      } else {
        setError(null);
        setCatalog(catalogResult.catalog);
      }
      if (statesResult.ok) setExtensions(statesResult.extensions);
      setLoading(false);
    })();
    return () => {
      abort.abort();
    };
  }, [nonce]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  return { catalog, extensions, error, loading, refresh };
}

/** Memoized per-point resolution that refreshes on selection/context updates. */
export function useV2UiPoint(
  catalog: ExtensionV2Catalog | null,
  point: V2ContributionPoint,
  uiContext: V2UiContext,
  uiState: V2UiState,
): V2ResolvedContribution[] {
  const fileIdsKey = uiContext.fileIds.join("\0");
  return useMemo(
    () =>
      resolveV2UiPoint(
        catalog,
        point,
        {
          fileIds: fileIdsKey.split("\0").filter(Boolean),
          ...(uiContext.folderPath ? { folderPath: uiContext.folderPath } : {}),
          ...(uiContext.collectionId ? { collectionId: uiContext.collectionId } : {}),
          ...(uiContext.dropFileCount !== undefined
            ? { dropFileCount: uiContext.dropFileCount }
            : {}),
        },
        uiState,
      ),
    [
      catalog,
      point,
      fileIdsKey,
      uiContext.folderPath,
      uiContext.collectionId,
      uiContext.dropFileCount,
      uiState,
    ],
  );
}
