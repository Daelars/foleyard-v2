"use client";

import type { ValidationResult } from "./types";
import { useState } from "react";
import { AlertCircle, CheckCircle2, FolderOpen, Loader2, RefreshCw, Save, Trash2, Activity, Layers, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { getDesktopBridge } from "@/lib/desktop";

import type { LibraryTabProps } from "./types";

export function LibraryTab({ settings, onSaveRoot, onRemoveRoot, scanStatus, onStartScan }: LibraryTabProps) {
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
          <TabsContent value="library" className="m-0 flex-1 p-8 outline-none">
            <div className="mx-auto w-full max-w-4xl space-y-8">
              <div>
                <h3 className="text-3xl font-bold tracking-tight text-zinc-50">Library location</h3>
                <p className="mt-1 text-[13px] text-zinc-500">
                  The primary folder where your audio samples are stored.
                </p>
              </div>

              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="size-4 text-accent-text" />
                    <span className="text-sm font-medium text-zinc-200">Library folders</span>
                  </div>
                  {settings.libraryRoots.length > 0 ? (
                    <Badge variant="secondary" className="rounded-full bg-accent-fill/15 font-mono text-accent-text">Configured</Badge>
                  ) : (
                    <Badge variant="outline" className="rounded-full border-accent-fill/50 font-mono text-accent-text">Required</Badge>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      value={rootDraft}
                      onChange={(event) => {
                        setRootDraft(event.target.value);
                        setValidationResult(null);
                      }}
                      placeholder="e.g. C:\Samples or /Volumes/Audio"
                      className="h-10 flex-1 rounded-xl border-white/10 bg-black/30 font-mono text-sm shadow-none"
                    />
                    {desktop ? (
                      <Button
                        variant="outline"
                        onClick={handleBrowse}
                        disabled={isValidating}
                        className="h-10 rounded-xl border-white/10 bg-white/5 px-4 text-zinc-200 shadow-none backdrop-blur-none hover:border-accent-fill/50 hover:bg-white/[0.08] hover:text-zinc-100"
                      >
                        {isValidating ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <FolderOpen className="size-4" />
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

                  <div className="divide-y divide-white/5 border-y border-white/10">
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
                                variant="ghost"
                                size="sm"
                                className="h-7 shrink-0 rounded-lg bg-destructive/15 px-3 text-xs font-semibold text-destructive transition-all hover:bg-destructive/25 active:scale-95"
                                onClick={() => void handleConfirmRemoveRoot()}
                              >
                                Sure?
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="shrink-0 text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
                                onClick={() => setConfirmRemoveRoot(null)}
                                aria-label="Cancel remove folder"
                              >
                                <X className="size-4" />
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-zinc-500 hover:bg-destructive/15 hover:text-destructive"
                              onClick={() => setConfirmRemoveRoot(root)}
                              aria-label={`Remove library folder ${root}`}
                            >
                              <Trash2 className="size-4" />
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
                    <p className="text-xs text-zinc-500 leading-relaxed">
                      Add every folder you want included in scans.
                    </p>
                    <Button
                      onClick={handleSave}
                      disabled={
                        isSaving ||
                        isValidating ||
                        !rootDraft.trim() ||
                        settings.libraryRoots.includes(rootDraft.trim())
                      }
                      className="gap-2 rounded-lg"
                    >
                      {isSaving ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Save className="size-4" />
                      )}
                      Add Folder
                    </Button>
                  </div>
                </div>
              </section>

              <Separator className="opacity-50" />

              <div>
                <h3 className="text-3xl font-bold tracking-tight text-zinc-50">Scan & index</h3>
                <p className="mt-1 text-[13px] text-zinc-500">
                  Synchronize your database with the local filesystem.
                </p>
              </div>

              <section className="space-y-6">
                <div className="flex items-center justify-between">
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
                    disabled={scanStatus.running || isStartingScan || settings.libraryRoots.length === 0}
                    variant={scanStatus.running ? "outline" : "default"}
                    className={cn(
                      "gap-2 rounded-lg h-10 px-6",
                    )}
                  >
                    {scanStatus.running || isStartingScan ? (
                      <RefreshCw className="size-4 animate-spin" />
                    ) : (
                      <Activity className="size-4" />
                    )}
                    {scanStatus.running ? "Scanning..." : "Start Full Scan"}
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <ScanStat label="Phase" value={scanStatus.phase} icon={<Layers className="size-3" />} />
                  <ScanStat label="Discovered" value={scanStatus.discovered} />
                  <ScanStat label="Indexed" value={scanStatus.indexed} />
                  <ScanStat label="Metadata" value={scanStatus.metadataProcessed} />
                  <ScanStat label="Added" value={scanStatus.added} variant="success" />
                  <ScanStat label="Removed" value={scanStatus.removed} variant="error" />
                </div>
              </section>
            </div>
          </TabsContent>
  );
}
function ValidationMessage({ result }: { result: ValidationResult }) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-xl border p-4 transition-all animate-in fade-in slide-in-from-top-2",
        result.valid
          ? "border-accent-fill/30 bg-accent-fill/10 text-zinc-100"
          : "border-destructive/30 bg-destructive/10 text-destructive",
      )}
    >
      {result.valid ? (
        <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-fill/20 text-accent-text">
          <CheckCircle2 className="size-4" />
        </div>
      ) : (
        <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-destructive/20 text-destructive">
          <AlertCircle className="size-4" />
        </div>
      )}
      <div className="min-w-0">
        <p className="font-semibold text-sm">
              {result.valid ? "Path verified" : "Invalid folder"}
        </p>
        <p className="mt-0.5 text-xs opacity-80">
          {result.valid
            ? `Found ${result.audioFileCount} supported audio files.`
            : result.error}
        </p>
        {result.valid && result.normalizedPath ? (
          <div className="mt-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 font-mono text-[10px] text-zinc-400">
            {result.normalizedPath}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ScanStat({
  label,
  value,
  icon,
  variant = "default"
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  variant?: "default" | "success" | "error";
}) {
  return (
    <div className="group rounded-xl border border-white/10 bg-white/[0.02] p-3 transition-colors hover:bg-white/5">
      <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 group-hover:text-accent-text transition-colors">
        {icon}
        {label}
      </div>
      <p className={cn(
        "mt-1 truncate font-mono text-lg font-bold tabular-nums",
        variant === "success" && "text-accent-text",
        variant === "error" && "text-destructive",
        variant === "default" && "text-zinc-100"
      )}>
        {value}
      </p>
    </div>
  );
}
