"use client";

import { Bug, Eye, Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ExtensionDialogShell } from "@/components/extensions/ExtensionDialogShell";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { isDesktopApp } from "@/lib/desktop";
import { ExtensionStatusBanner } from "@/components/extensions/dialog-fields";

import {
  useFolderJanitor,
  type JanitorIssueKind,
  type JanitorTarget,
} from "./use-folder-janitor";

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

export function FolderJanitorDialog({
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

  return (
    <ExtensionDialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="Folder Janitor"
      description="Find duplicates, broken files, empty folders, tiny files, and unusual formats."
      icon={<Search className="size-4" />}
      maxWidth="2xl"
    >
      <section className="space-y-4 rounded-xl p-4">
        <div className="flex items-center gap-2">
          <Search className="size-4 text-accent-text" />
          <span className="text-sm font-medium">Scan target</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="min-w-0 rounded-lg px-3 py-2.5">
            <p className="text-sm font-medium">{scanLabel}</p>
            <p
              className="mt-0.5 truncate text-xs text-zinc-500"
              title={scanDescription}
            >
              {scanDescription}
            </p>
          </div>

          <Button
            onClick={handleScan}
            disabled={isScanning}
            className="h-10 sm:min-w-36"
          >
            {isScanning ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Bug className="mr-2 size-4" />
            )}
            {isScanning ? `Scanning ${progress.completed.toLocaleString()} / ${progress.total.toLocaleString()}...` : "Scan for issues"}
          </Button>
        </div>
      </section>

      {result && (
        <>
          {result.issues.length === 0 ? (
            <ExtensionStatusBanner>
              No issues found. Your library is clean.
            </ExtensionStatusBanner>
          ) : (
            <>
              <section className="space-y-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <div className="flex items-center gap-2">
                  <Bug className="size-4 text-accent-text" />
                  <span className="text-sm font-medium">Issue breakdown </span>
                  <p className="text-sm text-zinc-400">
                    Scanned {result.scannedFiles.toLocaleString()} files across{" "}
                    {result.scannedRoots.length} root
                    {result.scannedRoots.length !== 1 ? "s" : ""}. Found{" "}
                    {result.issues.length} issue
                    {result.issues.length !== 1 ? "s" : ""}.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-3">
                  {ISSUE_GROUPS.map((group) => {
                    const count = issueCounts?.[group.kind] ?? 0;
                    return (
                      <Card key={group.kind} size="sm">
                        <CardContent className="flex flex-col gap-0.5">
                          <p className="font-mono text-xs uppercase tracking-widest text-zinc-500">
                            {group.label}
                          </p>
                          <p className="text-xl font-semibold">{count}</p>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Switch
                      id="allow-cleanup"
                      checked={allowCleanup}
                      onCheckedChange={handleAllowCleanupChange}
                    />
                    <Label
                      htmlFor="allow-cleanup"
                      className="text-xs text-zinc-500"
                    >
                      Allow cleanup actions
                    </Label>
                  </div>
                  <Alert className="shrink-0 py-2">
                    <AlertDescription className="text-xs">
                      Read-only report. Enable cleanup above to remove files.
                    </AlertDescription>
                  </Alert>
                </div>

                <Accordion>
                  {ISSUE_GROUPS.map((group) => {
                    const issues = result.issues.filter(
                      (i) => i.kind === group.kind,
                    );
                    if (issues.length === 0) return null;

                    const allFileIds = issues.flatMap((i) => i.fileIds);
                    const isFolderAction = group.kind === "empty-folder";

                    return (
                      <AccordionItem key={group.kind} value={group.kind}>
                        <AccordionTrigger>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{group.label}</span>
                            <Badge variant="secondary">{issues.length}</Badge>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-1.5">
                            {issues.map((issue, idx) => (
                              <div
                                key={idx}
                                className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5"
                              >
                                <p
                                  className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-400"
                                  title={issue.path}
                                >
                                  {issue.message}
                                </p>

                                {isDesktopApp() && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      handleReveal(issue.fileIds[0], issue.path)
                                    }
                                    title="Reveal in Explorer"
                                  >
                                    <Eye className="mr-1 size-3" />
                                    Reveal
                                  </Button>
                                )}

                                {allowCleanup && isFolderAction && (
                                  <Button
                                    variant="destructive"
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
                                      variant="destructive"
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
                          </div>

                          {allowCleanup &&
                            isFolderAction &&
                            issues.length > 0 && (
                              <div className="mt-2.5 flex justify-end">
                                <Button
                                  variant="destructive"
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
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => handleRemove(allFileIds)}
                                  disabled={isRemoving}
                                >
                                  Remove {issues.length} from library
                                </Button>
                              </div>
                            )}
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </section>

              <AlertDialog
                open={confirmingCleanup}
                onOpenChange={(open) => {
                  if (!open) setConfirmingCleanup(false);
                }}
              >
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Enable cleanup actions?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This lets you permanently remove files from your library
                      and delete empty folders from disk. These actions cannot
                      be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleConfirmCleanup}>
                      Enable
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </>
      )}
    </ExtensionDialogShell>
  );
}
