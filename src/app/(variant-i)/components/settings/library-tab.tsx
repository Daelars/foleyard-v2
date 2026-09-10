"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, FolderOpen, Loader2, RefreshCw, Save, Trash2, Activity, X } from "lucide-react";
import { toast } from "sonner";

import { Button, Field, ScanStat, StatusBadge } from "@/components/variant-i";

import { cn } from "@/lib/utils";
import { getDesktopBridge } from "@/lib/desktop";

import type { LibraryTabProps, ValidationResult } from "@/components/settings/types";

export function V3SettingsLibraryTab({ settings, onSaveRoot, onRemoveRoot, scanStatus, onStartScan }: LibraryTabProps) {
  const [rootDraft, setRootDraft] = useState("");
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isStartingScan, setIsStartingScan] = useState(false);
  const [confirmRemoveRoot, setConfirmRemoveRoot] = useState<string | null>(null);
  const desktop = getDesktopBridge() !== null;
  const handleBrowse = async () => {
    const bridge = getDesktopBridge();
    if (bridge) {
      const result = await bridge.pickFolder();
      if (!result.ok || !result.path) return;

      setRootDraft(result.path);
      setValidationResult(null);

      const validation = await validatePathWith(result.path);
      if (validation?.valid && validation.normalizedPath) {
        setRootDraft(validation.normalizedPath);
      }
    }
  };

  const validatePathWith = async (path: string) => {
    if (!path) {
      setValidationResult({
        valid: false,
        normalizedPath: null,
        readable: false,
        audioFileCount: 0,
        samples: [],
        error: "Enter a folder path first.",
      });
      return null;
    }

    setIsValidating(true);

    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "validate", path }),
      });
      const result = (await response.json()) as ValidationResult;

      setValidationResult(result);

      if (!response.ok || !result.valid) {
        return result;
      }

      return result;
    } catch (error) {
      const result: ValidationResult = {
        valid: false,
        normalizedPath: null,
        readable: false,
        audioFileCount: 0,
        samples: [],
        error: error instanceof Error ? error.message : "Validation failed.",
      };
      setValidationResult(result);
      return result;
    } finally {
      setIsValidating(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);

    try {
      const validation = await validatePathWith(rootDraft.trim());
      if (!validation?.valid || !validation.normalizedPath) {
        toast.error(validation?.error ?? "Choose a valid library folder");
        return;
      }

      await onSaveRoot(validation.normalizedPath);
      setRootDraft("");
      setValidationResult(validation);
      toast.success("Library folder added");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveRoot = async (path: string) => {
    await onRemoveRoot(path);
  };

  const handleConfirmRemoveRoot = async () => {
    const path = confirmRemoveRoot;
    setConfirmRemoveRoot(null);
    if (path) {
      await handleRemoveRoot(path);
    }
  };

  const handleStartScan = async () => {
    setIsStartingScan(true);

    try {
      await onStartScan();
    } finally {
      setIsStartingScan(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8">
      <div>
        <h3 className="text-2xl font-bold tracking-tight text-zinc-50">Library location</h3>
        <p className="mt-1 text-[13px] text-zinc-500">
          The primary folder where your audio samples are stored.
        </p>
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FolderOpen className="size-4 text-accent-text" />
            <span className="text-sm font-medium text-zinc-200">Library folders</span>
          </div>
          {settings.libraryRoots.length > 0 ? (
            <StatusBadge status="Configured" tone="ready" />
          ) : (
            <StatusBadge status="Required" tone="unavailable" />
          )}
        </div>

        <div className="space-y-4">
          <div className="flex gap-2">
            <Field
              value={rootDraft}
              onChange={(event) => {
                setRootDraft(event.target.value);
                setValidationResult(null);
              }}
              placeholder="e.g. C:\Samples or /Volumes/Audio"
              className="flex-1 font-mono"
            />
            {desktop ? (
              <Button
                tone="secondary"
                onClick={handleBrowse}
                disabled={isValidating}
              >
                {isValidating ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <FolderOpen />
                )}
                Browse
              </Button>
            ) : null}
          </div>

          {!desktop ? (
            <p className="text-xs leading-5 text-zinc-500">
              Enter an absolute folder path that the Foleyard server can read.
            </p>
          ) : null}

          <div className="divide-y divide-white/[0.06] border-y border-[var(--vi-edge)]">
            {settings.libraryRoots.length === 0 ? (
              <div className="py-4 text-sm text-zinc-500">
                No library folders added.
              </div>
            ) : (
              settings.libraryRoots.map((root) => (
                <div key={root} className="flex items-center gap-3 py-2.5">
                  <FolderOpen className="size-4 shrink-0 text-zinc-500" />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-200">
                    {root}
                  </span>
                  {confirmRemoveRoot === root ? (
                    <>
                      <Button
                        tone="danger"
                        size="sm"
                        onClick={() => void handleConfirmRemoveRoot()}
                      >
                        Sure?
                      </Button>
                      <Button
                        tone="ghost"
                        size="icon"
                        onClick={() => setConfirmRemoveRoot(null)}
                        aria-label="Cancel remove folder"
                      >
                        <X />
                      </Button>
                    </>
                  ) : (
                    <Button
                      tone="danger"
                      size="icon"
                      onClick={() => setConfirmRemoveRoot(root)}
                      aria-label={`Remove library folder ${root}`}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>

          {validationResult ? (
            <ValidationMessage result={validationResult} />
          ) : null}

          <div className="flex items-center justify-between gap-4 pt-2">
            <p className="text-xs leading-relaxed text-zinc-500">
              Add every folder you want included in scans.
            </p>
            <Button
              tone="primary"
              onClick={handleSave}
              loading={isSaving}
              disabled={
                isSaving ||
                isValidating ||
                !rootDraft.trim() ||
                settings.libraryRoots.includes(rootDraft.trim())
              }
            >
              {isSaving ? null : <Save />}
              Add Folder
            </Button>
          </div>
        </div>
      </section>

      <div aria-hidden className="my-8 h-px bg-[var(--vi-edge)]" />

      <div>
        <h3 className="text-2xl font-bold tracking-tight text-zinc-50">Scan & index</h3>
        <p className="mt-1 text-[13px] text-zinc-500">
          Synchronize your database with the local filesystem.
        </p>
      </div>

      <section className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <RefreshCw className={cn("size-4 text-accent-text", scanStatus.running && "animate-spin")} />
              <span className="text-sm font-medium text-zinc-200">Library sync</span>
            </div>
            <p className="text-xs text-zinc-500">
              Refreshes metadata and discovers new files.
            </p>
          </div>
          <Button
            onClick={handleStartScan}
            loading={scanStatus.running || isStartingScan}
            disabled={scanStatus.running || isStartingScan || settings.libraryRoots.length === 0}
            tone={scanStatus.running ? "secondary" : "primary"}
          >
            <Activity />
            {scanStatus.running ? "Scanning..." : "Start Full Scan"}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ScanStat label="Phase" value={scanStatus.phase} />
          <ScanStat label="Discovered" value={scanStatus.discovered} />
          <ScanStat label="Indexed" value={scanStatus.indexed} />
          <ScanStat label="Metadata" value={scanStatus.metadataProcessed} />
          <ScanStat label="Added" value={scanStatus.added} tone="success" />
          <ScanStat label="Removed" value={scanStatus.removed} tone="error" />
        </div>
      </section>
    </div>
  );
}
function ValidationMessage({ result }: { result: ValidationResult }) {
  return (
    <div
      role={result.valid ? "status" : "alert"}
      className={cn(
        "flex gap-3 rounded-lg border p-3.5",
        result.valid
          ? "border-[color-mix(in_oklab,var(--accent-fill)_35%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_7%,transparent)]"
          : "border-[color-mix(in_oklab,var(--accent-fill)_45%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_8%,transparent)]",
      )}
    >
      <span
        aria-hidden
        className="grid size-6 shrink-0 place-items-center rounded-full bg-[color-mix(in_oklab,var(--accent-fill)_20%,transparent)] text-accent-text [&_svg]:size-4"
      >
        {result.valid ? <CheckCircle2 /> : <AlertCircle />}
      </span>
      <span className="min-w-0">
        <span className={cn("block text-[13px] font-semibold", result.valid ? "text-zinc-100" : "text-accent-text")}>
          {result.valid ? "Path verified" : "Invalid folder"}
        </span>
        <span className="mt-0.5 block text-xs text-zinc-400">
          {result.valid
            ? `Found ${result.audioFileCount} supported audio files.`
            : result.error}
        </span>
        {result.valid && result.normalizedPath ? (
          <span className="mt-2 block truncate rounded-md border border-[var(--vi-edge)] bg-black/30 px-2 py-1.5 font-mono text-[10px] text-zinc-400">
            {result.normalizedPath}
          </span>
        ) : null}
      </span>
    </div>
  );
}