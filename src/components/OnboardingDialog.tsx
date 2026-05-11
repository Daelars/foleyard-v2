"use client";

import { type ChangeEvent, useRef, useState } from "react";
import {
  Activity,
  CheckCircle2,
  FolderOpen,
  Loader2,
  Music2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getDesktopBridge } from "@/lib/desktop";
import { cn } from "@/lib/utils";

type ValidationResult = {
  valid: boolean;
  normalizedPath: string | null;
  readable: boolean;
  audioFileCount: number;
  samples: string[];
  error: string | null;
};

type OnboardingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaveRoot: (path: string) => Promise<boolean>;
  onStartScan: () => Promise<boolean>;
  onComplete: () => Promise<boolean>;
};

type OnboardingStep = "welcome" | "folder" | "scan";

export function OnboardingDialog({
  open,
  onOpenChange,
  onSaveRoot,
  onStartScan,
  onComplete,
}: OnboardingDialogProps) {
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [rootDraft, setRootDraft] = useState("");
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isStartingScan, setIsStartingScan] = useState(false);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep("welcome");
    setRootDraft("");
    setValidationResult(null);
    setIsValidating(false);
    setIsSaving(false);
    setIsStartingScan(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      reset();
    }

    onOpenChange(nextOpen);
  };

  const validatePathWith = async (path: string) => {
    if (!path) {
      const result: ValidationResult = {
        valid: false,
        normalizedPath: null,
        readable: false,
        audioFileCount: 0,
        samples: [],
        error: "Choose a folder first.",
      };
      setValidationResult(result);
      return result;
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

  const handleBrowse = async () => {
    const bridge = getDesktopBridge();
    if (bridge) {
      const result = await bridge.pickFolder();
      if (!result.ok || !result.path) return;

      setRootDraft(result.path);
      setValidationResult(null);

      const validation = await validatePathWith(result.path);
      if (validation.valid && validation.normalizedPath) {
        setRootDraft(validation.normalizedPath);
      }
      return;
    }

    folderInputRef.current?.click();
  };

  const handleWebFolderPicked = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const audioFiles = Array.from(files).filter((file) =>
      /\.(wav|mp3|flac|ogg|aiff|aac|m4a|wma)$/i.test(file.name),
    );

    setValidationResult({
      valid: audioFiles.length > 0,
      normalizedPath: null,
      readable: true,
      audioFileCount: audioFiles.length,
      samples: audioFiles.slice(0, 6).map((file) => file.name),
      error: audioFiles.length === 0 ? "No supported audio files found in the selected folder." : null,
    });
    event.target.value = "";
  };

  const handleAddFolder = async () => {
    setIsSaving(true);

    try {
      const validation = await validatePathWith(rootDraft.trim());
      if (!validation.valid || !validation.normalizedPath) {
        toast.error(validation.error ?? "Choose a valid library folder");
        return;
      }

      const saved = await onSaveRoot(validation.normalizedPath);
      if (!saved) {
        return;
      }

      const completed = await onComplete();
      if (!completed) {
        return;
      }

      setStep("scan");
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartScan = async () => {
    setIsStartingScan(true);

    try {
      const started = await onStartScan();
      if (started) {
        handleOpenChange(false);
      }
    } finally {
      setIsStartingScan(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[calc(100%-2rem)] overflow-hidden p-0 sm:max-w-xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,color-mix(in_oklab,var(--primary)_18%,transparent),transparent_42%)]" />
        <DialogHeader className="relative border-b border-border/35 px-6 py-5 pr-12">
          <div className="mb-3 flex items-center gap-2">
            <StepDot active={step === "welcome"} completed={step !== "welcome"} />
            <StepLine active={step !== "welcome"} />
            <StepDot active={step === "folder"} completed={step === "scan"} />
            <StepLine active={step === "scan"} />
            <StepDot active={step === "scan"} completed={false} />
          </div>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="size-5 text-primary" />
            {step === "welcome" ? "Welcome to Foleyard" : null}
            {step === "folder" ? "Add your first audio folder" : null}
            {step === "scan" ? "Your library is ready" : null}
          </DialogTitle>
          <DialogDescription>
            {step === "welcome"
              ? "Set up your sound library so Foleyard can index, search, and organize your audio assets."
              : null}
            {step === "folder"
              ? "Choose the folder where your samples, recordings, or sound effects live."
              : null}
            {step === "scan"
              ? "Start a scan now, or skip it and scan from Settings later."
              : null}
          </DialogDescription>
        </DialogHeader>

        <div className="relative px-6 py-6">
          {step === "welcome" ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-border/40 bg-card/60 p-5 shadow-sm backdrop-blur-xl">
                <div className="flex items-start gap-4">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Music2 className="size-6" />
                  </div>
                  <div className="space-y-2">
                    <p className="font-medium">Build a searchable sound library.</p>
                    <p className="text-sm leading-6 text-muted-foreground">
                      Foleyard starts by indexing one local folder. You can add more folders later from Settings.
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex justify-end">
                <Button className="rounded-xl" onClick={() => setStep("folder")}>
                  Get Started
                </Button>
              </div>
            </div>
          ) : null}

          {step === "folder" ? (
            <div className="space-y-5">
              <div className="flex gap-2">
                <Input
                  value={rootDraft}
                  onChange={(event) => {
                    setRootDraft(event.target.value);
                    setValidationResult(null);
                  }}
                  placeholder="e.g. C:\\Samples or /Volumes/Audio"
                  className="h-10 flex-1 border-border/40 bg-background font-mono text-sm"
                />
                <Button
                  variant="outline"
                  onClick={handleBrowse}
                  disabled={isValidating || isSaving}
                  className="h-10 rounded-xl"
                >
                  {isValidating ? <Loader2 className="size-4 animate-spin" /> : <FolderOpen className="size-4" />}
                  Browse
                </Button>
                <input
                  ref={folderInputRef}
                  type="file"
                  className="hidden"
                  /* @ts-expect-error - webkitdirectory is a non-standard attribute */
                  webkitdirectory=""
                  onChange={handleWebFolderPicked}
                />
              </div>

              {validationResult ? <ValidationMessage result={validationResult} /> : null}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <Button variant="ghost" className="rounded-xl" onClick={() => setStep("welcome")}>
                  Back
                </Button>
                <Button
                  onClick={handleAddFolder}
                  disabled={isSaving || isValidating || !rootDraft.trim()}
                  className="rounded-xl"
                >
                  {isSaving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                  Add Folder
                </Button>
              </div>
            </div>
          ) : null}

          {step === "scan" ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-primary/30 bg-primary/10 p-5">
                <div className="flex items-start gap-4">
                  <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-primary" />
                  <div className="space-y-1">
                    <p className="font-medium">Folder added.</p>
                    <p className="text-sm leading-6 text-muted-foreground">
                      Scanning discovers audio files and writes their metadata into the local database.
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" className="rounded-xl" onClick={() => handleOpenChange(false)}>
                  Skip for Now
                </Button>
                <Button onClick={handleStartScan} disabled={isStartingScan} className="rounded-xl">
                  {isStartingScan ? <Loader2 className="size-4 animate-spin" /> : <Activity className="size-4" />}
                  Scan Now
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StepDot({ active, completed }: { active: boolean; completed: boolean }) {
  return (
    <span
      className={cn(
        "flex size-2.5 rounded-full border border-border/50 bg-muted",
        active && "border-primary bg-primary",
        completed && "border-primary/70 bg-primary/70",
      )}
    />
  );
}

function StepLine({ active }: { active: boolean }) {
  return <span className={cn("h-px w-8 bg-border", active && "bg-primary/70")} />;
}

function ValidationMessage({ result }: { result: ValidationResult }) {
  if (result.valid) {
    return (
      <div className="rounded-xl border border-primary/25 bg-primary/10 p-3 text-sm">
        <div className="flex items-center gap-2 font-medium text-primary">
          <CheckCircle2 className="size-4" />
          {result.audioFileCount} audio {result.audioFileCount === 1 ? "file" : "files"} found
        </div>
        {result.normalizedPath ? (
          <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
            {result.normalizedPath}
          </p>
        ) : null}
        {result.samples.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {result.samples.slice(0, 4).map((sample) => (
              <Badge key={sample} variant="secondary" className="max-w-40 truncate">
                {sample}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
      {result.error ?? "This folder could not be used."}
    </div>
  );
}
