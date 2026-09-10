"use client";

// app-v3 adapter for OnboardingDialog: same props, steps, path validation
// and callbacks, I-styled dialog with the library OnboardingStepper.
import { useId, useState } from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  FolderOpen,
  Loader2,
  Music2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import {
  Button,
  Dialog,
  DialogDescription,
  DialogDivider,
  DialogTitle,
  Field,
  OnboardingStepper,
} from "@/components/variant-i";
import { getDesktopBridge } from "@/lib/desktop";
import type { ValidationResult } from "@/components/settings/types";

type OnboardingStep = "welcome" | "folder" | "scan";

const ONBOARDING_STEPS = ["Welcome", "Folder", "Scan"] as const;

export function V3OnboardingDialog({
  open,
  onOpenChange,
  onSaveRoot,
  onStartScan,
  onComplete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaveRoot: (path: string) => Promise<boolean>;
  onStartScan: () => Promise<boolean>;
  onComplete: () => Promise<boolean>;
}) {
  const titleId = useId();
  const descId = useId();
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [rootDraft, setRootDraft] = useState("");
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isStartingScan, setIsStartingScan] = useState(false);
  const desktop = getDesktopBridge() !== null;

  const stepIndex = step === "welcome" ? 0 : step === "folder" ? 1 : 2;

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

  const handleStepSelect = (index: number) => {
    if (step === "folder" && index === 0) {
      setStep("welcome");
    }
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
    <Dialog
      open={open}
      onClose={() => handleOpenChange(false)}
      labelledBy={titleId}
      describedBy={descId}
      maxWidth="max-w-xl"
    >
      <div className="relative">
        <span
          aria-hidden
          className="pointer-events-none absolute -left-10 -top-10 size-48 rounded-full bg-[color-mix(in_oklab,var(--accent-fill)_10%,transparent)] blur-3xl"
        />
        <div className="relative">
          <OnboardingStepper
            steps={ONBOARDING_STEPS}
            stepIndex={stepIndex}
            onSelect={handleStepSelect}
          />
          <DialogTitle id={titleId}>
            <span className="mt-3 flex items-center gap-2">
              <Sparkles className="size-5 text-accent-text" />
              {step === "welcome" ? "Welcome to Foleyard" : null}
              {step === "folder" ? "Add your first audio folder" : null}
              {step === "scan" ? "Your library is ready" : null}
            </span>
          </DialogTitle>
          <DialogDescription id={descId}>
            {step === "welcome"
              ? "Foleyard keeps your local sounds indexed and searchable. Setup takes a minute."
              : null}
            {step === "folder"
              ? "Choose the folder where your sounds live."
              : null}
            {step === "scan"
              ? "Start a scan now, or skip it and scan from Settings later."
              : null}
          </DialogDescription>
        </div>
      </div>

      <DialogDivider />

      <div className="space-y-5">
        {step === "welcome" ? (
          <div className="space-y-5">
            <div className="rounded-lg border border-[var(--vi-edge)] bg-black/25 p-5">
              <div className="flex items-start gap-4">
                <span
                  aria-hidden
                  className="grid size-12 shrink-0 place-items-center rounded-xl border border-[color-mix(in_oklab,var(--accent-fill)_35%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_12%,transparent)] text-accent-text [&_svg]:size-6"
                >
                  <Music2 />
                </span>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-zinc-100">
                    Build a searchable sound library.
                  </p>
                  <p className="text-[13px] leading-6 text-zinc-400">
                    Foleyard starts by indexing one local folder. You can add
                    more folders later from Settings.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <Button tone="primary" onClick={() => setStep("folder")}>
                Get Started
              </Button>
            </div>
          </div>
        ) : null}

        {step === "folder" ? (
          <div className="space-y-5">
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
                  disabled={isValidating || isSaving}
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
                Enter an absolute folder path that the Foleyard server can
                read, then choose Add Folder.
              </p>
            ) : null}

            {validationResult ? (
              <V3OnboardingValidationMessage result={validationResult} />
            ) : null}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <Button
                tone="ghost"
                onClick={() => setStep("welcome")}
              >
                Back
              </Button>
              <Button
                tone="primary"
                onClick={handleAddFolder}
                disabled={isSaving || isValidating || !rootDraft.trim()}
                loading={isSaving}
              >
                {isSaving ? null : <CheckCircle2 />}
                Add Folder
              </Button>
            </div>
          </div>
        ) : null}

        {step === "scan" ? (
          <div className="space-y-5">
            <div className="rounded-lg border border-[color-mix(in_oklab,var(--accent-fill)_30%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_10%,transparent)] p-5">
              <div className="flex items-start gap-4">
                <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-accent-text" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-zinc-100">
                    Folder added.
                  </p>
                  <p className="text-[13px] leading-6 text-zinc-400">
                    Scanning discovers audio files and writes their metadata
                    into the local database.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                tone="secondary"
                onClick={() => handleOpenChange(false)}
              >
                Skip for Now
              </Button>
              <Button
                tone="primary"
                onClick={handleStartScan}
                disabled={isStartingScan}
                loading={isStartingScan}
              >
                {isStartingScan ? null : <Activity />}
                Scan Now
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}

function V3OnboardingValidationMessage({ result }: { result: ValidationResult }) {
  if (result.valid) {
    return (
      <div
        role="status"
        className="flex gap-3 rounded-lg border border-[color-mix(in_oklab,var(--accent-fill)_35%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_7%,transparent)] p-3.5"
      >
        <span
          aria-hidden
          className="grid size-6 shrink-0 place-items-center rounded-full bg-[color-mix(in_oklab,var(--accent-fill)_18%,transparent)] text-accent-text [&_svg]:size-4"
        >
          <CheckCircle2 />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-zinc-100">
            {result.audioFileCount} audio{" "}
            {result.audioFileCount === 1 ? "file" : "files"} found
          </p>
          {result.normalizedPath ? (
            <p className="mt-1 truncate font-mono text-xs text-zinc-400">
              {result.normalizedPath}
            </p>
          ) : null}
          {result.samples.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {result.samples.slice(0, 4).map((sample) => (
                <span
                  key={sample}
                  className="inline-flex h-7 max-w-40 items-center truncate whitespace-nowrap rounded-md border border-[var(--vi-edge)] bg-white/[0.03] px-2.5 font-mono text-xs text-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                >
                  {sample}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="flex gap-3 rounded-lg border border-[color-mix(in_oklab,var(--accent-fill)_45%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_8%,transparent)] p-3.5"
    >
      <span
        aria-hidden
        className="grid size-6 shrink-0 place-items-center rounded-full bg-[color-mix(in_oklab,var(--accent-fill)_20%,transparent)] text-accent-text [&_svg]:size-4"
      >
        <AlertCircle />
      </span>
      <p className="text-[13px] font-semibold text-accent-text">
        {result.error ?? "This folder could not be used."}
      </p>
    </div>
  );
}