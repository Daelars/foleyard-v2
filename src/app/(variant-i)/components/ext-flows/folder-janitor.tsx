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
const DELETE_TITLE_ID = "v3-janitor-delete-title";
const DELETE_DESC_ID = "v3-janitor-delete-desc";

export function V3FolderJanitorDialog({
  open,
  onOpenChange,
  initialTarget = "library",
  initialFolderPath,
}: FolderJanitorDialogProps) {
  const {
    progress,
    isScanning,
    scanJobId,
    result,
    issueCounts,
    allowCleanup,
    isRemoving,
    confirmingCleanup,
    setConfirmingCleanup,
    pendingDelete,
    scanLabel,
    scanDescription,
    handleScan,
    handleCancelScan,
    handleReveal,
    handleRemove,
    handleDeleteFolders,
    handleConfirmDelete,
    handleCancelDelete,
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

            <div className="flex items-center gap-2 sm:justify-end">
              <Button
                tone="primary"
                size="md"
                className="h-10 sm:min-w-36"
                onClick={handleScan}
                disabled={isScanning}
                loading={isScanning}
              >
                {isScanning ? (
                  `Scanning ${progress.completed.toLocaleString()}${progress.total > progress.completed ? ` / ${progress.total.toLocaleString()}` : ""}...`
                ) : (
                  <>
                    <Bug />
                    Scan for issues
                  </>
                )}
              </Button>

              {isScanning && scanJobId ? (
                <Button tone="secondary" size="md" className="h-10" onClick={handleCancelScan}>
                  Cancel
                </Button>
              ) : null}
            </div>
          </div>
        </section>

        {result ? (
          <section className="space-y-4 rounded-xl border border-[var(--vi-edge)] bg-white/[0.02] p-4">
            <div className="flex items-center gap-2">
              <Bug className="size-4 text-accent-text" />
              <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
                Reviewed scope
              </span>
              <span className="text-sm text-zinc-400">
                Scanned {result.scannedFiles.toLocaleString()} file
                {result.scannedFiles !== 1 ? "s" : ""} across{" "}
                {result.scannedRoots.length} root
                {result.scannedRoots.length !== 1 ? "s" : ""}. Found{" "}
                {result.issueTotal.toLocaleString()} issue
                {result.issueTotal !== 1 ? "s" : ""}.
              </span>
            </div>

            {result.scannedRoots.length > 0 ? (
              <div className="space-y-1">
                {result.scannedRoots.map((root) => (
                  <p
                    key={root}
                    className="truncate font-mono text-[11px] text-zinc-500"
                    title={root}
                  >
                    {root}
                  </p>
                ))}
              </div>
            ) : null}

            {result.truncated ? (
              <div
                role="alert"
                className="rounded-lg border border-amber-300/30 bg-amber-300/[0.06] px-3.5 py-3"
              >
                <p className="text-xs font-medium text-amber-200">
                  Scan incomplete — this report is only part of the library.
                </p>
                <ul className="mt-1.5 space-y-1">
                  {result.truncationReasons.map((reason, index) => (
                    <li key={index} className="text-xs leading-relaxed text-amber-100/80">
                      {reason}
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-xs leading-relaxed text-amber-100/60">
                  A partial scan is never treated as a clean library. Narrow the scope
                  and scan again for a complete report.
                </p>
              </div>
            ) : null}

            {result.issues.length === 0 ? (
              <div
                className={
                  result.truncated
                    ? "rounded-lg border border-amber-300/25 bg-amber-300/[0.05] px-3.5 py-3"
                    : "rounded-lg border border-teal-300/25 bg-teal-300/[0.05] px-3.5 py-3"
                }
              >
                <p className="text-xs leading-relaxed text-zinc-400">
                  {result.truncated
                    ? "No issues found in the part of the library that was reviewed, but the scan was incomplete — the rest is unverified."
                    : "No issues found. Your library is clean."}
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {ISSUE_GROUPS.map((group) => {
                    const count = issueCounts?.[group.kind] ?? 0;
                    return (
                      <ScanStat key={group.kind} label={group.label} value={count} />
                    );
                  })}
                </div>

                {result.issues.length < result.issueTotal ? (
                  <p className="text-xs leading-relaxed text-zinc-500">
                    Counts are complete; the list below shows the first{" "}
                    {result.issues.length.toLocaleString()} of{" "}
                    {result.issueTotal.toLocaleString()} issues.
                  </p>
                ) : null}

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
                    const kindTotal = issueCounts?.[group.kind] ?? issues.length;

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
                            {kindTotal}
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
              </>
            )}
          </section>
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

      <Dialog
        open={Boolean(pendingDelete)}
        onClose={handleCancelDelete}
        labelledBy={DELETE_TITLE_ID}
        describedBy={DELETE_DESC_ID}
        maxWidth="max-w-xl"
      >
        <DialogTitle id={DELETE_TITLE_ID}>Review deletion</DialogTitle>
        <DialogDescription id={DELETE_DESC_ID}>
          {pendingDelete?.summary ??
            "Review the exact folders that will be deleted before applying."}
        </DialogDescription>
        <DialogDivider />

        {pendingDelete ? (
          <div className="vi-scroll max-h-[55vh] space-y-4 overflow-y-auto">
            {pendingDelete.tables.map((table) => (
              <div key={table.id} className="vi-scroll overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left font-mono uppercase tracking-wider text-zinc-500">
                      {table.columns.map((column) => (
                        <th key={column} className="px-2 py-1">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((row, rowIndex) => (
                      <tr
                        key={rowIndex}
                        className="border-t border-white/5 text-zinc-300"
                      >
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex} className="break-all px-2 py-1 font-mono">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

            {pendingDelete.notices.map((notice, index) => (
              <p
                key={index}
                role={notice.tone === "error" ? "alert" : undefined}
                className={
                  notice.tone === "warning"
                    ? "text-xs leading-relaxed text-amber-300"
                    : notice.tone === "error"
                      ? "text-xs leading-relaxed text-accent-text"
                      : "text-xs leading-relaxed text-zinc-400"
                }
              >
                {notice.message}
              </p>
            ))}

            <p className="text-xs leading-relaxed text-zinc-500">
              {pendingDelete.reversibilityNote}
            </p>
          </div>
        ) : null}

        <DialogFooter>
          <Button tone="secondary" size="sm" onClick={handleCancelDelete}>
            Cancel
          </Button>
          <Button
            tone="danger"
            size="sm"
            onClick={handleConfirmDelete}
            disabled={isRemoving}
            loading={isRemoving}
          >
            Delete {pendingDelete?.tables[0]?.rows.length ?? 0} folder
            {(pendingDelete?.tables[0]?.rows.length ?? 0) !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </Dialog>
    </Dialog>
  );
}
