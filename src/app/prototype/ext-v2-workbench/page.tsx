"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { v2PanelClass } from "@/components/extensions-v2/shared";
import {
  resolveV2UiPoint,
  type V2ExtensionState,
} from "@/lib/extensions-v2/contributions";
import {
  fetchV2JobStatus,
  requestV2JobCancel,
} from "@/lib/extensions-v2/job-client";
import {
  V2_CONTRIBUTION_POINTS,
  type ExtensionV2Catalog,
  type V2ContributionPoint,
} from "@yard-core";

import { useV2InspectorLog, V2ExecutionInspector } from "./inspector";

/**
 * v2 development workbench (prototype route, dev-only, R9).
 *
 * Previews contributions through the production adapters, inspects
 * the sanitized catalog, invokes commands against the disposable dev
 * Library, and follows job outcomes — with an explicit reload action
 * (Next dev HMR stays the underlying reload mechanism; the button
 * re-runs fixture registration and proves a second reload attaches
 * nothing twice). Fixture commands are read-only plus isolated
 * fixture state; nothing here mutates the user's Library.
 *
 * Dev-only: the prototype layout resolves this page to not-found in
 * production builds, and packaged builds exclude the compiled
 * prototype routes via electron-builder.yml.
 */

type ReloadResult = {
  attachedHandlers: string[];
  entryCount: number;
  fixtureIds: string[];
};

type HistoryJob = {
  jobId: string;
  invocationId: string;
  extensionId: string;
  commandId: string;
  state: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  progress?: { succeeded: number; failed: number; incomplete: boolean };
  error?: { code: string; message: string };
};

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

async function loadCatalog(): Promise<{
  catalog: ExtensionV2Catalog;
  states: V2ExtensionState[];
} | null> {
  try {
    const [catalogResponse, statesResponse] = await Promise.all([
      fetch("/api/extensions-v2"),
      fetch("/api/extensions-v2/extensions"),
    ]);
    const catalogBody = (await readJson(catalogResponse)) as {
      ok?: boolean;
      catalog?: ExtensionV2Catalog;
    } | null;
    const statesBody = (await readJson(statesResponse)) as {
      ok?: boolean;
      extensions?: V2ExtensionState[];
    } | null;
    if (!catalogBody?.ok || !catalogBody.catalog) return null;
    return {
      catalog: catalogBody.catalog,
      states: statesBody?.ok && statesBody.extensions ? statesBody.extensions : [],
    };
  } catch {
    return null;
  }
}

function deniedFromText(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(/denied=([\w:.,-]+)/g)) {
    for (const name of (match[1] ?? "").split(",")) {
      if (name && !found.includes(name) && name !== "none") found.push(name);
    }
  }
  return found;
}

export default function ExtV2WorkbenchPage() {
  const inspector = useV2InspectorLog();
  const [catalog, setCatalog] = useState<ExtensionV2Catalog | null>(null);
  const [states, setStates] = useState<V2ExtensionState[]>([]);
  const [status, setStatus] = useState("Loading catalog…");
  const [reload, setReload] = useState<ReloadResult | null>(null);

  const [point, setPoint] = useState<V2ContributionPoint>("palette");
  const [fileIds, setFileIds] = useState("");
  const [folderPath, setFolderPath] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const [nativeCap, setNativeCap] = useState(false);

  const [extensionId, setExtensionId] = useState("fixture-surface");
  const [commandId, setCommandId] = useState("fixture-surface.ping");
  const [inputJson, setInputJson] = useState('{"note": "hello"}');
  const [mode, setMode] = useState<"direct" | "job">("direct");
  const [running, setRunning] = useState(false);
  const [activeJob, setActiveJob] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState("");

  const [history, setHistory] = useState<HistoryJob[]>([]);

  const refresh = useCallback(async () => {
    setStatus("Loading catalog…");
    const loaded = await loadCatalog();
    if (!loaded) {
      setStatus("Catalog request failed.");
      return;
    }
    setCatalog(loaded.catalog);
    setStates(loaded.states);
    setStatus(`Catalog loaded (${loaded.catalog.entries.length} entries).`);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const loaded = await loadCatalog();
      if (cancelled) return;
      if (!loaded) {
        setStatus("Catalog request failed.");
        return;
      }
      setCatalog(loaded.catalog);
      setStates(loaded.states);
      setStatus(`Catalog loaded (${loaded.catalog.entries.length} entries).`);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const uiState = useMemo(() => {
    const capabilities: Record<string, boolean> = {};
    if (nativeCap) capabilities["desktop.native"] = true;
    return {
      enabled: states.filter((entry) => entry.enabled).map((entry) => entry.id),
      capabilities,
    };
  }, [states, nativeCap]);

  const preview = useMemo(
    () =>
      resolveV2UiPoint(
        catalog,
        point,
        {
          fileIds: fileIds.split(",").map((id) => id.trim()).filter(Boolean),
          ...(folderPath ? { folderPath } : {}),
          ...(collectionId ? { collectionId } : {}),
        },
        uiState,
      ),
    [catalog, point, fileIds, folderPath, collectionId, uiState],
  );

  const reloadFixtures = useCallback(async () => {
    setStatus("Reloading fixtures…");
    const response = await fetch("/prototype/ext-v2-workbench/reload", { method: "POST" });
    const body = (await readJson(response)) as (ReloadResult & { ok?: boolean }) | null;
    if (response.ok && body?.ok !== false) {
      setReload({
        attachedHandlers: body?.attachedHandlers ?? [],
        entryCount: body?.entryCount ?? 0,
        fixtureIds: body?.fixtureIds ?? [],
      });
      setStatus("Reload complete — second reloads attach nothing twice.");
      await refresh();
    } else {
      setStatus(`Reload failed with ${response.status}.`);
    }
  }, [refresh]);

  const checkAvailability = useCallback(async () => {
    const params = new URLSearchParams({ extensionId, commandId });
    const ids = fileIds.split(",").map((id) => id.trim()).filter(Boolean);
    if (ids.length > 0) params.set("fileIds", ids.join(","));
    if (folderPath) params.set("folderPath", folderPath);
    if (collectionId) params.set("collectionId", collectionId);
    if (inputJson.trim()) params.set("input", inputJson);
    const response = await fetch(`/api/extensions-v2/availability?${params.toString()}`);
    const body = (await readJson(response)) as {
      ok?: boolean;
      available?: boolean;
      reason?: string;
      error?: { code?: string; message?: string };
    } | null;
    const available = body?.available === true;
    const reason = body?.reason ?? body?.error?.message ?? `status ${response.status}`;
    inspector.record({
      kind: "availability",
      extensionId,
      commandId,
      available,
      reason,
      runMode: "direct",
    });
    setLastResult(`availability: ${available ? "available" : `unavailable — ${reason}`}`);
  }, [extensionId, commandId, fileIds, folderPath, collectionId, inputJson, inspector]);

  const invoke = useCallback(async () => {
    let parsedInput: unknown;
    try {
      parsedInput = inputJson.trim() ? (JSON.parse(inputJson) as unknown) : undefined;
    } catch {
      setLastResult("input is not valid JSON.");
      return;
    }
    const ids = fileIds.split(",").map((id) => id.trim()).filter(Boolean);
    setRunning(true);
    try {
      if (mode === "job") {
        const response = await fetch("/api/extensions-v2/jobs", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            extensionId,
            commandId,
            selection: {
              fileIds: ids,
              ...(folderPath ? { folderPath } : {}),
              ...(collectionId ? { collectionId } : {}),
            },
            ...(parsedInput !== undefined ? { input: parsedInput } : {}),
          }),
        });
        const body = (await readJson(response)) as {
          ok?: boolean;
          job?: { jobId: string; invocationId: string; state: string };
          error?: { code?: string; message?: string };
        } | null;
        if (!response.ok || !body?.ok || !body.job) {
          const message = body?.error?.message ?? `submit failed with ${response.status}`;
          inspector.record({
            kind: "error",
            extensionId,
            commandId,
            runMode: "job",
            code: body?.error?.code,
            reason: message,
            detail: message,
          });
          setLastResult(message);
          return;
        }
        setActiveJob(body.job.jobId);
        inspector.record({
          kind: "job",
          extensionId,
          commandId,
          invocationId: body.job.invocationId,
          jobId: body.job.jobId,
          runMode: "job",
          reason: `submitted (${body.job.state})`,
          transitions: [`submitted:${body.job.state}`],
        });
        for (let attempt = 0; attempt < 60; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          const current = await fetchV2JobStatus(body.job.jobId);
          if (!current.ok) {
            inspector.record({
              kind: "error",
              extensionId,
              commandId,
              jobId: body.job.jobId,
              runMode: "job",
              code: current.code,
              reason: current.message,
              detail: current.message,
            });
            setLastResult(current.message);
            return;
          }
          inspector.appendTransition(body.job.jobId, current.job.state);
          if (["succeeded", "failed", "cancelled", "interrupted"].includes(current.job.state)) {
            const summary = JSON.stringify(current.job.partial ?? current.job.error ?? current.job.state);
            inspector.record({
              kind: "invocation",
              extensionId,
              commandId,
              invocationId: current.job.invocationId,
              jobId: current.job.jobId,
              runMode: "job",
              reason: `settled as ${current.job.state}`,
              deniedPermissions: deniedFromText(summary),
              detail: summary.slice(0, 2000),
            });
            setLastResult(`job ${current.job.state}: ${summary.slice(0, 500)}`);
            setActiveJob(null);
            return;
          }
        }
        setLastResult("job did not settle within 30s; keep its ID and poll again.");
      } else {
        const response = await fetch("/api/extensions-v2/execute", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            extensionId,
            commandId,
            selection: {
              fileIds: ids,
              ...(folderPath ? { folderPath } : {}),
              ...(collectionId ? { collectionId } : {}),
            },
            ...(parsedInput !== undefined ? { input: parsedInput } : {}),
          }),
        });
        const body = (await readJson(response)) as {
          ok?: boolean;
          outcome?: { kind: string; invocationId?: string; value?: unknown };
          error?: { code?: string; message?: string; invocationId?: string };
        } | null;
        const text = JSON.stringify(body);
        if (response.ok && body?.ok) {
          inspector.record({
            kind: "invocation",
            extensionId,
            commandId,
            invocationId: body.outcome?.invocationId,
            runMode: "direct",
            reason: `outcome ${body.outcome?.kind}`,
            deniedPermissions: deniedFromText(text),
            detail: text.slice(0, 2000),
          });
          setLastResult(text.slice(0, 1000));
        } else {
          inspector.record({
            kind: "error",
            extensionId,
            commandId,
            invocationId: body?.error?.invocationId,
            runMode: "direct",
            code: body?.error?.code,
            reason: body?.error?.message ?? `failed with ${response.status}`,
            detail: text.slice(0, 2000),
          });
          setLastResult(body?.error?.message ?? `failed with ${response.status}`);
        }
      }
    } finally {
      setRunning(false);
    }
  }, [extensionId, commandId, fileIds, folderPath, collectionId, inputJson, mode, inspector]);

  const cancelJob = useCallback(async () => {
    if (!activeJob) return;
    const result = await requestV2JobCancel(activeJob);
    if (result.ok) {
      inspector.appendTransition(activeJob, `cancel-requested:${result.job.state}`);
      setLastResult(`cancel requested; job is ${result.job.state}.`);
    } else {
      setLastResult(result.message);
    }
  }, [activeJob, inspector]);

  const loadHistory = useCallback(async () => {
    const response = await fetch("/prototype/ext-v2-workbench/history?limit=20");
    const body = (await readJson(response)) as { ok?: boolean; jobs?: HistoryJob[] } | null;
    if (response.ok && body?.ok) setHistory(body.jobs ?? []);
  }, []);

  const commands = useMemo(() => {
    const entry = catalog?.entries.find((candidate) => candidate.id === extensionId);
    return entry?.commands ?? [];
  }, [catalog, extensionId]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
      <header className={`${v2PanelClass} p-4`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-base font-semibold">Extension v2 workbench</h1>
            <p className="text-xs text-zinc-500">
              Dev-only fixture page: contributions preview, sanitized catalog,
              invocation against the disposable dev Library, job outcomes.
            </p>
          </div>
          <Button type="button" onClick={() => void reloadFixtures}>
            Reload fixtures
          </Button>
        </div>
        <p className="mt-2 text-xs text-zinc-400" role="status">{status}</p>
        {reload ? (
          <p className="mt-1 text-xs text-zinc-400">
            {reload.entryCount} catalog entries; fixtures {reload.fixtureIds.join(", ") || "none"};
            attached this reload: {reload.attachedHandlers.join(", ") || "none (no duplicates)"}.
          </p>
        ) : null}
      </header>

      <section aria-label="Catalog" className={`${v2PanelClass} p-4`}>
        <h2 className="mb-2 text-sm font-semibold">Sanitized catalog</h2>
        {catalog ? (
          <ul className="flex flex-col gap-1 text-xs">
            {catalog.entries.map((entry) => (
              <li key={entry.id} className="flex flex-wrap gap-x-2">
                <span className="font-medium">{entry.id}</span>
                <span className="text-zinc-400">{entry.name} v{entry.version}</span>
                <span className="font-mono text-[11px] text-zinc-500">
                  [{entry.permissions.join(", ") || "no permissions"}]
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-zinc-500">No catalog yet.</p>
        )}
        {catalog ? (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-zinc-400">Raw catalog JSON</summary>
            <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px]">
              {JSON.stringify(catalog, null, 2)}
            </pre>
          </details>
        ) : null}
      </section>

      <section aria-label="Contributions preview" className={`${v2PanelClass} p-4`}>
        <h2 className="mb-2 text-sm font-semibold">Contributions preview</h2>
        <div className="mb-2 flex flex-wrap gap-2 text-xs">
          <label className="flex items-center gap-1">
            Point
            <select
              className="rounded border border-white/10 bg-transparent px-1 py-1"
              value={point}
              onChange={(event) => setPoint(event.target.value as V2ContributionPoint)}
            >
              {V2_CONTRIBUTION_POINTS.map((candidate) => (
                <option key={candidate} value={candidate}>{candidate}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1">
            File IDs
            <Input
              className="w-40"
              value={fileIds}
              onChange={(event) => setFileIds(event.target.value)}
              placeholder="a, b"
            />
          </label>
          <label className="flex items-center gap-1">
            Folder
            <Input
              className="w-32"
              value={folderPath}
              onChange={(event) => setFolderPath(event.target.value)}
            />
          </label>
          <label className="flex items-center gap-1">
            Collection
            <Input
              className="w-32"
              value={collectionId}
              onChange={(event) => setCollectionId(event.target.value)}
            />
          </label>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={nativeCap}
              onChange={(event) => setNativeCap(event.target.checked)}
            />
            desktop.native
          </label>
        </div>
        {preview.length === 0 ? (
          <p className="text-xs text-zinc-500">No contributions resolve for this point and context.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-xs">
            {preview.map((item) => (
              <li key={item.key} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{item.title}</span>
                <span className="font-mono text-[11px] text-zinc-500">{item.key}</span>
                {item.availability.available ? (
                  <span className="text-emerald-400">available</span>
                ) : (
                  <span className="text-zinc-500">unavailable — {item.availability.reason}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Invoke" className={`${v2PanelClass} p-4`}>
        <h2 className="mb-2 text-sm font-semibold">Invoke against the dev Library</h2>
        <div className="mb-2 flex flex-wrap gap-2 text-xs">
          <label className="flex items-center gap-1">
            Extension
            <select
              className="rounded border border-white/10 bg-transparent px-1 py-1"
              value={extensionId}
              onChange={(event) => {
                setExtensionId(event.target.value);
                const first = catalog?.entries.find((entry) => entry.id === event.target.value)
                  ?.commands[0]?.id;
                if (first) setCommandId(first);
              }}
            >
              {(catalog?.entries ?? []).map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.id}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1">
            Command
            <select
              className="rounded border border-white/10 bg-transparent px-1 py-1"
              value={commandId}
              onChange={(event) => setCommandId(event.target.value)}
            >
              {commands.map((command) => (
                <option key={command.id} value={command.id}>{command.id}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1">
            Input JSON
            <Input
              className="w-56 font-mono"
              value={inputJson}
              onChange={(event) => setInputJson(event.target.value)}
            />
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="v2-run-mode"
              checked={mode === "direct"}
              onChange={() => setMode("direct")}
            />
            direct
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="v2-run-mode"
              checked={mode === "job"}
              onChange={() => setMode("job")}
            />
            job
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => void checkAvailability()}>
            Check availability
          </Button>
          <Button type="button" size="sm" onClick={() => void invoke()} disabled={running}>
            {running ? "Running…" : mode === "job" ? "Submit job" : "Execute"}
          </Button>
          {activeJob ? (
            <Button type="button" size="sm" variant="outline" onClick={() => void cancelJob()}>
              Cancel {activeJob}
            </Button>
          ) : null}
        </div>
        {lastResult ? (
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px]">
            {lastResult}
          </pre>
        ) : null}
      </section>

      <V2ExecutionInspector log={inspector} />

      <section aria-label="Host job history" className={`${v2PanelClass} p-4`}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Host job history (sanitized)</h2>
          <Button type="button" size="sm" variant="outline" onClick={() => void loadHistory()}>
            Load history
          </Button>
        </div>
        {history.length === 0 ? (
          <p className="text-xs text-zinc-500">No history loaded.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-xs">
            {history.map((job) => (
              <li key={job.jobId} className="flex flex-wrap gap-x-2 font-mono text-[11px]">
                <span>{job.jobId}</span>
                <span className="text-zinc-400">{job.extensionId} · {job.commandId}</span>
                <span>{job.state}</span>
                {job.error ? <span className="text-zinc-400">{job.error.code}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
