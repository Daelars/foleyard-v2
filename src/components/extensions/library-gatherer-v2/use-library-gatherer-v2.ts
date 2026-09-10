"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  LIBRARY_GATHERER_V2_GATHER,
  LIBRARY_GATHERER_V2_ID,
  LIBRARY_GATHERER_V2_PREVIEW,
  type LibraryGathererV2GatherResult,
  type LibraryGathererV2PreviewResult,
} from "@foleyard/library-gatherer-v2";
import { getDesktopBridge, isDesktopApp } from "@/lib/desktop";
import { invokeV2Command } from "@/lib/extensions-v2/contributions";
import {
  pollV2JobUntilSettled,
  requestV2JobCancel,
} from "@/lib/extensions-v2/job-client";

export type LibraryGathererV2Phase = "form" | "preview" | "working" | "done";

export interface GatherSource {
  path: string;
  grantId: string;
}

type OutcomeBody = {
  ok?: boolean;
  error?: { message?: string };
  outcome?: { kind?: string; jobId?: string; planId?: string };
};

function outcomeError(body: unknown, fallback: string): string {
  const parsed = body as OutcomeBody | null;
  if (parsed?.ok === false || parsed?.error) {
    return parsed?.error?.message ?? fallback;
  }
  return fallback;
}

async function issueSourceGrant(
  directoryPath: string,
): Promise<{ grantId: string; path: string } | null> {
  const response = await fetch("/api/extensions-v2/source-grants", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ extensionId: LIBRARY_GATHERER_V2_ID, directoryPath }),
  });
  const body = (await response.json().catch(() => null)) as {
    ok?: boolean;
    grantId?: string;
    path?: string;
    error?: { message?: string };
  } | null;
  if (!response.ok || !body?.ok || !body.grantId) {
    toast.error(body?.error?.message ?? "Source grant failed");
    return null;
  }
  return { grantId: body.grantId, path: body.path ?? directoryPath };
}

/** Full library-gatherer v2 dialog flow: sources → preview → destination → job. */
export function useLibraryGathererV2({ open }: { open: boolean }) {
  const [sources, setSources] = useState<GatherSource[]>([]);
  const [destPath, setDestPath] = useState("");
  const [grantId, setGrantId] = useState("");
  const [phase, setPhase] = useState<LibraryGathererV2Phase>("form");
  const [preview, setPreview] = useState<LibraryGathererV2PreviewResult | null>(null);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [jobId, setJobId] = useState<string | null>(null);
  const [result, setResult] = useState<LibraryGathererV2GatherResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSources([]);
      setDestPath("");
      setGrantId("");
      setPhase("form");
      setPreview(null);
      setProgress({ completed: 0, total: 0 });
      setJobId(null);
      setResult(null);
      setError(null);
      setBusy(false);
    }
  }, [open ]);

  const sourceGrantIds = sources.map((source) => source.grantId);

  const handleAddFolder = useCallback(
    async (folderPath: string) => {
      const trimmed = folderPath.trim();
      if (!trimmed) return;
      if (sources.some((source) => source.path === trimmed)) {
        toast.error("Folder already added");
        return;
      }
      if (!isDesktopApp()) {
        toast.error("Source folders need the desktop app to grant access");
        return;
      }
      setBusy(true);
      try {
        const issued = await issueSourceGrant(trimmed);
        if (!issued) return;
        setSources((prev) => [...prev, { path: issued.path, grantId: issued.grantId }]);
      } finally {
        setBusy(false);
      }
    },
    [sources],
  );

  const handlePickFolder = useCallback(async () => {
    if (!isDesktopApp()) {
      toast.error("Folder picker requires the desktop app");
      return;
    }
    const picked = await getDesktopBridge()?.pickFolder();
    if (picked?.ok && picked.path) {
      await handleAddFolder(picked.path);
    } else if (picked && !picked.ok) {
      toast.error(picked.error ?? "Folder picker failed");
    }
  }, [handleAddFolder]);

  const handleRemoveFolder = useCallback((folderPath: string) => {
    setSources((prev) => prev.filter((source) => source.path !== folderPath));
  }, []);

  const handlePickDest = useCallback(async () => {
    if (!isDesktopApp()) {
      toast.error("Folder picker requires the desktop app");
      return;
    }
    const picked = await getDesktopBridge()?.pickFolder();
    if (!picked?.ok || !picked.path) {
      if (picked && !picked.ok) toast.error(picked.error ?? "Folder picker failed");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/extensions-v2/grants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ extensionId: LIBRARY_GATHERER_V2_ID, directoryPath: picked.path }),
      });
      const body = (await response.json().catch(() => null)) as {
        ok?: boolean;
        grantId?: string;
        path?: string;
        error?: { message?: string };
      } | null;
      if (!response.ok || !body?.ok || !body.grantId) {
        toast.error(body?.error?.message ?? "Destination grant failed");
        return;
      }
      setDestPath(body.path ?? picked.path);
      setGrantId(body.grantId);
    } finally {
      setBusy(false);
    }
  }, []);

  const handlePreview = useCallback(async () => {
    if (sourceGrantIds.length === 0) {
      toast.error("Add at least one source folder");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const invoked = await invokeV2Command({
        extensionId: LIBRARY_GATHERER_V2_ID,
        commandId: LIBRARY_GATHERER_V2_PREVIEW,
        commandInput: { sourceGrantIds },
      });
      if (!invoked.ok) {
        setError(invoked.message);
        return;
      }
      const body = invoked.body as OutcomeBody & { outcome?: { value?: LibraryGathererV2PreviewResult } };
      if (!body?.ok) {
        setError(outcomeError(body, "Preview failed."));
        return;
      }
      const value = body.outcome?.kind === "immediate" ? body.outcome.value : undefined;
      if (!value) {
        setError("Preview did not return a plan.");
        return;
      }
      setPreview(value);
      setPhase("preview");
    } finally {
      setBusy(false);
    }
  }, [sourceGrantIds]);

  const handleGather = useCallback(async () => {
    if (sourceGrantIds.length === 0) {
      toast.error("Add at least one source folder");
      return;
    }
    if (!grantId) {
      setError("Choose a destination folder first.");
      return;
    }
    setBusy(true);
    setError(null);
    setPhase("working");
    try {
      const response = await fetch("/api/extensions-v2/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          extensionId: LIBRARY_GATHERER_V2_ID,
          commandId: LIBRARY_GATHERER_V2_GATHER,
          selection: { fileIds: [] },
          input: { sourceGrantIds, destGrantId: grantId },
        }),
      });
      const body = (await response.json().catch(() => null)) as OutcomeBody;
      if (!response.ok || !body?.ok) {
        setError(outcomeError(body, "Could not start the gather job."));
        setPhase("preview");
        return;
      }
      if (body.outcome?.kind !== "job" || !body.outcome.jobId) {
        setError("Gather did not start as a background job.");
        setPhase("preview");
        return;
      }
      const started = body.outcome.jobId;
      setJobId(started);
      const settled = await pollV2JobUntilSettled(started, { intervalMs: 500 });
      if (!settled.ok) {
        setError(settled.message);
        setPhase("preview");
        return;
      }
      const job = settled.job;
      setProgress({
        completed: job.progress.completed,
        total: job.progress.total ?? job.progress.completed,
      });
      if (job.state === "cancelled") {
        setError("Gather cancelled. Unfinished job output was removed; nothing else was touched.");
        setPhase("preview");
        return;
      }
      if (job.state !== "succeeded" || job.value === undefined) {
        setError(job.error?.message ?? `Gather ${job.state}.`);
        setPhase("preview");
        return;
      }
      const value = job.value as LibraryGathererV2GatherResult;
      setResult(value);
      setPhase("done");
      toast.success(`Gathered ${value.copied} file${value.copied === 1 ? "" : "s"} (${value.skipped} skipped)`);
    } finally {
      setBusy(false);
    }
  }, [sourceGrantIds, grantId]);

  const handleCancelJob = useCallback(async () => {
    if (!jobId) return;
    await requestV2JobCancel(jobId);
  }, [jobId]);

  const handleReveal = useCallback(
    async (target: string) => {
      if (!isDesktopApp()) {
        toast.error("Reveal requires the desktop app.");
        return;
      }
      const revealed = await getDesktopBridge()?.revealPath(target);
      if (revealed && !revealed.ok) {
        toast.error(revealed.error ?? "Reveal failed");
      }
    },
    [],
  );

  return {
    sources,
    destPath,
    grantId,
    phase,
    preview,
    progress,
    result,
    error,
    busy,
    jobId,
    handleAddFolder,
    handlePickFolder,
    handleRemoveFolder,
    handlePickDest,
    handlePreview,
    handleGather,
    handleCancelJob,
    handleReveal,
  };
}