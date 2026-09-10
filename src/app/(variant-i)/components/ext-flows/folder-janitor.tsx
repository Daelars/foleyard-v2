"use client";

import { useState } from "react";
import { Bug, ChevronDown, Eye, Info, Search } from "lucide-react";

import {
  Button,
  Dialog,
  DialogDescription,
  DialogDivider,
  DialogFooter,
  DialogTitle,
  ScanStat,
  Switch,
} from "@/components/variant-i";
import { cn } from "@/lib/utils";
import { isDesktopApp } from "@/lib/desktop";

import {
  useFolderJanitorV2 as useFolderJanitor,
  type JanitorIssueKind,
  type JanitorTarget,
} from "@/components/extensions/folder-janitor-v2/use-folder-janitor-v2";

interface FolderJanitorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTarget?: JanitorTarget;
  initialFolderPath?: string;
}

const ISSUE_GROUPS: { kind: JanitorIssueKind; label: string }[] = [
  { kind: "duplicate", label: "Duplicates" },
  { kind: "missing-file", label: "Missing files" },
  { kind: "broken", label: "Broken files" },
  { kind: "tiny-file", label: "Tiny files" },
  { kind: "weird-format", label: "Unusual formats" },
  { kind: "empty-folder", label: "Empty folders" },
];

const TITLE_ID = "v3-folder-janitor-title";
const DESC_ID = "v3-folder-janitor-desc";
const CONFIRM_TITLE_ID = "v3-janitor-confirm-title";
const CONFIRM_DESC_ID = "v3-janitor-confirm-desc";

export function V3FolderJanitorDialog({
  open,
  onOpenChange,
  initialTarget = "library",
  initialFolderPath,
}: FolderJanitorDialogProps) {
  const {
    progress,
    isScanning,
    result,
    issueCounts,
    allowCleanup,
    isRemoving,
    confirmingCleanup,
    setConfirmingCleanup,
    scanLabel,
    scanDescription,
    handleScan,
    handleReveal,
    handleRemove,
    handleDeleteFolders,
    handleAllowCleanupChange,
    handleConfirmCleanup,
  } = useFolderJanitor({ open, initialTarget, initialFolderPath });

  const [openGroup, setOpenGroup] = useState<JanitorIssueKind | null>(null);

  return (
    <Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      labelledBy={TITLE_ID}
      describedBy={DESC_ID}
      maxWidth="max-w-2xl"
    >
      <DialogTitle id={TITLE_ID}>
        <span className="inline-flex items-center gap-2">
          <Search className="size-4 text-accent-text" />
          Folder Janitor
        </span>
      </DialogTitle>
      <DialogDescription id={DESC_ID}>
        Find duplicates, broken files, empty folders, tiny files, and unusual
        formats.
      </DialogDescription>
      <DialogDivider />

      <div className="vi-scroll max-h-[60vh] space-y-4 overflow-y-auto">
        <section className="space-y-4 rounded-xl p-4">
          <div className="flex items-center gap-2">
            <Search className="size-4 text-accent-text" />
            <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
              Scan target
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="min-w-0 rounded-lg px-3 py-2.5">
              <p className="text-sm font-medium text-zinc-100">{scanLabel}</p>
              <p
                className="mt-0.5 truncate text-xs text-zinc-500"
                title={scanDescription}
              >
                {scanDescription}
              </p>
            </div>

            <Button
              tone="primary"
              size="md"
              className="h-10 sm:min-w-36"
              onClick={handleScan}
              disabled={isScanning}
              loading={isScanning}
            >
              {isScanning ? (
                `Scanning ${progress.completed.toLocaleString()} / ${progress.total.toLocaleString()}...`
              ) : (
                <>
                  <Bug />
                  Scan for issues
                </>
              )}
            </Button>
          </div>
        </section>

        {result ? (
          result.issues.length === 0 ? (
            <div className="rounded-lg border border-teal-300/25 bg-teal-300/[0.05] px-3.5 py-3">
              <p className="text-xs leading-relaxed text-zinc-400">
                No issues found. Your library is clean.
              </p>
            </div>
          ) : (
            <section className="space-y-4 rounded-xl border border-[var(--vi-edge)] bg-white/[0.02] p-4">
              <div className="flex items-center gap-2">
                <Bug className="size-4 text-accent-text" />
                <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
                  Issue breakdown
                </span>
                <span className="text-sm text-zinc-400">
                  Scanned {result.scannedFiles.toLocaleString()} files across{" "}
                  {result.scannedRoots.length} root
                  {result.scannedRoots.length !== 1 ? "s" : ""}. Found{" "}
                  {result.issues.length} issue
                  {result.issues.length !== 1 ? "s" : ""}.
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {ISSUE_GROUPS.map((group) => {
                  const count = issueCounts?.[group.kind] ?? 0;
                  return (
                    <ScanStat key={group.kind} label={group.label} value={count} />
                  );
                })}
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Switch
                    label="Allow cleanup actions"
                    checked={allowCleanup}
                    onCheckedChange={handleAllowCleanupChange}
                  />
                  <span className="text-xs text-zinc-500">
                    Allow cleanup actions
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2 rounded-lg border border-[var(--vi-edge)] bg-white/[0.02] px-3 py-2">
                  <Info className="size-3.5 text-zinc-500" />
                  <p className="text-xs text-zinc-400">
                    Read-only report. Enable cleanup above to remove files.
                  </p>
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border border-[var(--vi-edge)]">
                {ISSUE_GROUPS.map((group) => {
                  const issues = result.issues.filter(
                    (i) => i.kind === group.kind,
                  );
                  if (issues.length === 0) return null;

                  const allFileIds = issues.flatMap((i) => i.fileIds);
                  const isFolderAction = group.kind === "empty-folder";
                  const isOpen = openGroup === group.kind;

                  return (
                    <div
                      key={group.kind}
                      className="border-b border-[var(--vi-edge)] last:border-b-0"
                    >
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => setOpenGroup(isOpen ? null : group.kind)}
                        className="flex h-11 w-full items-center gap-2.5 px-3 text-left outline-none transition-colors hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--vi-focus)]"
                      >
                        <ChevronDown
                          aria-hidden
                          className={cn(
                            "size-4 shrink-0 text-zinc-500 transition-transform duration-200 motion-reduce:transition-none",
                            isOpen && "rotate-180 text-accent-text",
                          )}
                        />
                        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-zinc-100">
                          {group.label}
                        </span>
                        <span className="shrink-0 font-mono text-[10.5px] text-zinc-500">
                          {issues.length}
                        </span>
                      </button>
                      <div
                        className={cn(
                          "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
                          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                        )}
                      >
                        <div className="overflow-hidden">
                          <div className="space-y-1.5 px-3 pb-3 pl-[38px]">
                            {issues.map((issue, idx) => (
                              <div
                                key={idx}
                                className="flex items-center gap-2 rounded-lg border border-[var(--vi-edge)] bg-black/25 px-3 py-1.5"
                              >
                                <p
                                  className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-400"
                                  title={issue.path}
                                >
                                  {issue.message}
                                </p>

                                {isDesktopApp() && (
                                  <Button
                                    tone="ghost"
                                    size="sm"
                                    onClick={() =>
                                      handleReveal(issue.fileIds[0], issue.path)
                                    }
                                    title="Reveal in Explorer"
                                  >
                                    <Eye />
                                    Reveal
                                  </Button>
                                )}

                                {allowCleanup && isFolderAction && (
                                  <Button
                                    tone="danger"
                                    size="sm"
                                    onClick={() =>
                                      handleDeleteFolders([issue.path])
                                    }
                                    disabled={isRemoving}
                                  >
                                    Delete folder
                                  </Button>
                                )}

                                {allowCleanup &&
                                  !isFolderAction &&
                                  issue.fileIds.length > 0 && (
                                    <Button
                                      tone="danger"
                                      size="sm"
                                      onClick={() =>
                                        handleRemove(issue.fileIds)
                                      }
                                      disabled={isRemoving}
                                    >
                                      Remove
                                    </Button>
                                  )}
                              </div>
                            ))}

                            {allowCleanup &&
                              isFolderAction &&
                              issues.length > 0 && (
                                <div className="mt-2.5 flex justify-end">
                                  <Button
                                    tone="danger"
                                    size="sm"
                                    onClick={() =>
                                      handleDeleteFolders(
                                        issues.map((i) => i.path),
                                      )
                                    }
                                    disabled={isRemoving}
                                  >
                                    Delete all ({issues.length})
                                  </Button>
                                </div>
                              )}

                            {allowCleanup &&
                              !isFolderAction &&
                              allFileIds.length > 0 && (
                                <div className="mt-2.5 flex justify-end">
                                  <Button
                                    tone="danger"
                                    size="sm"
                                    onClick={() => handleRemove(allFileIds)}
                                    disabled={isRemoving}
                                  >
                                    Remove {issues.length} from library
                                  </Button>
                                </div>
                              )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )
        ) : null}
      </div>

      <DialogFooter>
        <Button tone="secondary" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      </DialogFooter>

      <Dialog
        open={confirmingCleanup}
        onClose={() => setConfirmingCleanup(false)}
        labelledBy={CONFIRM_TITLE_ID}
        describedBy={CONFIRM_DESC_ID}
      >
        <DialogTitle id={CONFIRM_TITLE_ID}>Enable cleanup actions?</DialogTitle>
        <DialogDescription id={CONFIRM_DESC_ID}>
          This lets you permanently remove files from your library and delete
          empty folders from disk. These actions cannot be undone.
        </DialogDescription>
        <DialogDivider />
        <DialogFooter>
          <Button tone="secondary" size="sm" onClick={() => setConfirmingCleanup(false)}>
            Cancel
          </Button>
          <Button tone="primary" size="sm" onClick={handleConfirmCleanup}>
            Enable
          </Button>
        </DialogFooter>
      </Dialog>
    </Dialog>
  );
}