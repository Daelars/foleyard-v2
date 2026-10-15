"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { v2PlanJobRoute, v2PlanRoute, type V2PlanReview } from "@yard-core";
import { getDesktopBridge, isDesktopApp } from "@/lib/desktop";
import { invokeV2Command } from "@/lib/extensions-v2/contributions";
import {
  pollV2JobUntilSettled,
  requestV2JobCancel,
} from "@/lib/extensions-v2/job-client";
import { pickV2Grant } from "@/lib/extensions-v2/picker-grant-client";

export type MakePackV2Source = "selection" | "shelf" | "recent";
export type MakePackV2Format = "folder" | "zip";
export type MakePackV2Phase = "form" | "preview" | "working" | "done";

export interface MakePackV2Result {
  packName: string;
  outputFormat: MakePackV2Format;
  outputPath: string;
  copied: number;
  skipped: string[];
  missing: string[];
  failedFiles: string[];
  failedReasons: string[];
  manifestIncluded: boolean;
  revealCapability: string;
}

export const MAKE_PACK_V2_ID = "make-pack-v2";

export function makePackV2CommandId(source: MakePackV2Source): string {
  return `make-pack-v2.from-${source}`;
}

export function defaultPackV2Name(source: MakePackV2Source): string {
  if (source === "selection") return "Selected Sounds Pack";
  if (source === "shelf") return "Shelf Pack";
  return "Recent Sounds Pack";
}

type OutcomeBody = {
  ok?: boolean;
  error?: { message?: string };
  outcome?: { kind?: string; jobId?: string; planId?: string };
};

/** Every field the review plan binds; changing any one invalidates it. */
type PlanBindingKey = {
  source: MakePackV2Source;
  fileIds: string[];
  packName: string;
  outputFormat: MakePackV2Format;
  includeManifest: boolean;
  grantId: string;
};

function bindingKey(binding: PlanBindingKey): string {
  return JSON.stringify(binding);
}

function outcomeError(body: unknown, fallback: string): string {
  const parsed = body as OutcomeBody | null;
  if (parsed?.ok === false || parsed?.error) {
    return parsed?.error?.message ?? fallback;
  }
  return fallback;
}

/** Full Make Pack v2 dialog flow: preview → destination → job → results. */
export function useMakePackV2({
  open,
  initialSource = "selection",
  initialFileIds = [],
}: {
  open: boolean;
  initialSource?: MakePackV2Source;
  initialFileIds?: string[];
}) {
  const [source, setSource] = useState<MakePackV2Source>(initialSource);
  const [packName, setPackName] = useState(() => defaultPackV2Name(initialSource));
  const [outputFormat, setOutputFormat] = useState<MakePackV2Format>("folder");
  const [includeManifest, setIncludeManifest] = useState(true);
  const [destPath, setDestPath] = useState("");
  const [grantId, setGrantId] = useState("");
  const [phase, setPhase] = useState<MakePackV2Phase>("form");
  const [preview, setPreview] = useState<V2PlanReview | null>(null);
  const [reviewedKey, setReviewedKey] = useState<string | null>(null);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [jobId, setJobId] = useState<string | null>(null);
  const [result, setResult] = useState<MakePackV2Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSource(initialSource);
      setPackName(defaultPackV2Name(initialSource));
      setDestPath("");
      setGrantId("");
      setPhase("form");
      setPreview(null);
      setReviewedKey(null);
      setProgress({ completed: 0, total: 0 });
      setJobId(null);
      setResult(null);
      setError(null);
      setBusy(false);
    }
  }, [open, initialSource]);

  const fileIds = useMemo(
    () => (source === "selection" ? [...initialFileIds] : []),
    [source, initialFileIds],
  );

  // The binding the current form would review. Any change after review
  // makes it differ from the reviewed key, which invalidates the preview.
  const currentKey = useMemo(
    () =>
      bindingKey({
        source,
        fileIds,
        packName: packName.trim() || defaultPackV2Name(source),
        outputFormat,
        includeManifest,
        grantId,
      }),
    [source, fileIds, packName, outputFormat, includeManifest, grantId],
  );

  useEffect(() => {
    if (phase !== "preview" || reviewedKey === null || currentKey === reviewedKey) return;
    // Editing any reviewed field invalidates the host-stamped review; the
    // user must preview again before the job can run.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreview(null);
    setReviewedKey(null);
    setJobId(null);
    setError(null);
    setPhase("form");
  }, [phase, reviewedKey, currentKey]);

  const handlePickDest = useCallback(async () => {
    if (!isDesktopApp()) {
      toast.error("Folder picker requires the desktop app");
      return;
    }
    setBusy(true);
    try {
      // The picker mints a single-use proof; the grant route spends it.
      const picked = await pickV2Grant(getDesktopBridge(), MAKE_PACK_V2_ID, "destination");
      if (!picked.ok) {
        toast.error(picked.error);
        return;
      }
      setDestPath(picked.path);
      setGrantId(picked.grantId);
    } finally {
      setBusy(false);
    }
  }, []);

  const handlePreview = useCallback(async () => {
    setBusy(true);
    setError(null);
    const effectiveName = packName.trim() || defaultPackV2Name(source);
    try {
      const invoked = await invokeV2Command({
        extensionId: MAKE_PACK_V2_ID,
        commandId: makePackV2CommandId(source),
        fileIds,
        commandInput: {
          packName: effectiveName,
          outputFormat,
          includeManifest,
          ...(grantId ? { grantId } : {}),
        },
      });
      if (!invoked.ok) {
        setError(invoked.message);
        return;
      }
      const body = invoked.body as OutcomeBody;
      if (!body?.ok) {
        setError(outcomeError(body, "Preview failed."));
        return;
      }
      if (body.outcome?.kind !== "review-required" || !body.outcome.planId) {
        setError("Preview did not return a review plan.");
        return;
      }
      const reviewResponse = await fetch(v2PlanRoute(body.outcome.planId));
      const reviewBody = (await reviewResponse.json().catch(() => null)) as {
        ok?: boolean;
        review?: V2PlanReview;
        error?: { message?: string };
      } | null;
      if (!reviewResponse.ok || !reviewBody?.ok || !reviewBody.review) {
        setError(reviewBody?.error?.message ?? "Could not load the pack preview.");
        return;
      }
      setPreview(reviewBody.review);
      setReviewedKey(
        bindingKey({
          source,
          fileIds,
          packName: effectiveName,
          outputFormat,
          includeManifest,
          grantId,
        }),
      );
      setPhase("preview");
    } finally {
      setBusy(false);
    }
  }, [source, fileIds, packName, outputFormat, includeManifest, grantId]);

  const handleStartJob = useCallback(async () => {
    if (!preview || reviewedKey === null) {
      setError("Preview the pack before starting the job.");
      return;
    }
    if (currentKey !== reviewedKey) {
      // Defensive: the effect above normally resets first. Either way, a
      // plan whose binding changed is never submitted.
      setPreview(null);
      setReviewedKey(null);
      setError("The pack changed after preview; review it again.");
      setPhase("form");
      return;
    }
    if (!grantId) {
      setError("Choose a destination folder and preview the pack again.");
      return;
    }
    setBusy(true);
    setError(null);
    setPhase("working");
    try {
      // The job runs the exact reviewed plan: the reviewed targets and
      // options echo byte-identically, so a stale plan is rejected rather
      // than executed.
      const response = await fetch(v2PlanJobRoute(preview.planId), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targets: preview.targets, options: preview.options }),
      });
      const body = (await response.json().catch(() => null)) as OutcomeBody;
      if (!response.ok || !body?.ok) {
        setError(outcomeError(body, "Could not start the pack job."));
        setPhase("preview");
        return;
      }
      if (body.outcome?.kind !== "job" || !body.outcome.jobId) {
        setError("Pack did not start as a background job.");
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
        setError("Pack cancelled. Unfinished job output was removed; nothing else was touched.");
        setPhase("preview");
        return;
      }
      if (job.state !== "succeeded") {
        setError(job.error?.message ?? job.result?.diagnostic?.message ?? `Pack ${job.state}.`);
        setPhase("preview");
        return;
      }
      // The raw handler value is memory-only; the bounded terminal
      // projection is the contract the renderer reads.
      const value = job.result?.value as MakePackV2Result | undefined;
      if (!value) {
        setError("The pack finished without a bounded result to display.");
        setPhase("preview");
        return;
      }
      setResult(value);
      setPhase("done");
      toast.success(`Packed ${value.copied} sound${value.copied === 1 ? "" : "s"}`);
    } finally {
      setBusy(false);
    }
  }, [preview, reviewedKey, currentKey, grantId]);

  const handleCancelJob = useCallback(async () => {
    if (!jobId) return;
    await requestV2JobCancel(jobId);
  }, [jobId]);

  const handleReveal = useCallback(async () => {
    if (!result) return;
    if (!isDesktopApp()) {
      toast.error("Reveal requires the desktop app (capability desktop:reveal).");
      return;
    }
    const revealed = await getDesktopBridge()?.revealPath(result.outputPath);
    if (revealed && !revealed.ok) {
      toast.error(revealed.error ?? "Reveal failed");
    }
  }, [result]);

  return {
    source,
    setSource,
    packName,
    setPackName,
    outputFormat,
    setOutputFormat,
    includeManifest,
    setIncludeManifest,
    destPath,
    grantId,
    phase,
    preview,
    progress,
    result,
    error,
    busy,
    fileIds,
    handlePickDest,
    handlePreview,
    handleStartJob,
    handleCancelJob,
    handleReveal,
  };
}
