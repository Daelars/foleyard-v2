"use client";

import { useState, useCallback, useEffect } from "react";
import { Bug, Eye, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectItem,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getDesktopBridge, isDesktopApp } from "@/lib/desktop";

type IssueKind =
  | "duplicate"
  | "missing-file"
  | "broken"
  | "tiny-file"
  | "weird-format"
  | "empty-folder";

interface Issue {
  kind: IssueKind;
  path: string;
  fileIds: string[];
  message: string;
}

interface ScanResult {
  scannedFiles: number;
  scannedRoots: string[];
  issues: Issue[];
}

interface FolderJanitorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTarget?: "library" | "folder" | "selection";
  initialFolderPath?: string;
}

const ISSUE_GROUPS: { kind: IssueKind; label: string }[] = [
  { kind: "duplicate", label: "Duplicates" },
  { kind: "missing-file", label: "Missing Files" },
  { kind: "broken", label: "Broken Files" },
  { kind: "tiny-file", label: "Tiny Files" },
  { kind: "weird-format", label: "Unusual Formats" },
  { kind: "empty-folder", label: "Empty Folders" },
];

export function FolderJanitorDialog({
  open,
  onOpenChange,
  initialTarget = "library",
  initialFolderPath,
}: FolderJanitorDialogProps) {
  const [scanTarget, setScanTarget] = useState<
    "library" | "folder" | "selection"
  >(initialTarget);
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [allowCleanup, setAllowCleanup] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  useEffect(() => {
    if (open) {
      setScanTarget(initialTarget);
      setResult(null);
      setAllowCleanup(false);
    }
  }, [open, initialTarget]);

  const handleScan = useCallback(async () => {
    setIsScanning(true);
    setResult(null);

    try {
      let res: Response;

      if (scanTarget === "library") {
        res = await fetch("/api/extensions/folder-janitor/scan-library", {
          method: "POST",
        });
      } else if (scanTarget === "folder") {
        res = await fetch("/api/extensions/folder-janitor/scan-folder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderPath: initialFolderPath ?? "" }),
        });
      } else {
        res = await fetch("/api/extensions/folder-janitor/scan-folder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderPath: "" }),
        });
      }

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Scan failed");
      }

      setResult(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Scan failed");
    } finally {
      setIsScanning(false);
    }
  }, [scanTarget, initialFolderPath]);

  const handleReveal = useCallback(async (fileId?: string, path?: string) => {
    const bridge = getDesktopBridge();
    if (bridge) {
      if (fileId) {
        await bridge.revealInExplorer(fileId);
      } else if (path) {
        await bridge.revealPath(path);
      }
    }
  }, []);

  const handleRemove = useCallback(async (fileIds: string[]) => {
    setIsRemoving(true);
    try {
      const res = await fetch("/api/extensions/folder-janitor/remove-files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileIds }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to remove files");
      }

      toast.success(
        `Removed ${data.removed} file${data.removed !== 1 ? "s" : ""}`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to remove files",
      );
    } finally {
      setIsRemoving(false);
    }
  }, []);

  const handleDeleteFolders = useCallback(async (paths: string[]) => {
    setIsRemoving(true);
    try {
      const res = await fetch("/api/extensions/folder-janitor/delete-folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to delete folders");
      }

      const deleted = data.results.filter((r: { ok: boolean }) => r.ok).length;
      toast.success(
        `Deleted ${deleted} empty folder${deleted !== 1 ? "s" : ""}`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete folders",
      );
    } finally {
      setIsRemoving(false);
    }
  }, []);

  const issueCounts: Record<string, number> = result
    ? result.issues.reduce(
        (acc, issue) => {
          acc[issue.kind] = (acc[issue.kind] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      )
    : {};

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Folder Janitor</DialogTitle>
          <DialogDescription>
            Find duplicates, broken files, empty folders, tiny junk files, and
            weird formats.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-6 space-y-6">
          <section className="space-y-4 rounded-xl border border-border/40 bg-muted/30 p-4">
            <div className="flex items-center gap-2">
              <Search className="size-4 text-primary" />
              <span className="text-sm font-medium">Scan target</span>
            </div>

            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Label>Scope</Label>
                <Select
                  value={scanTarget}
                  onValueChange={(v: unknown) =>
                    setScanTarget(v as "library" | "folder" | "selection")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup>
                    <SelectItem value="library">Entire library</SelectItem>
                    <SelectItem value="folder">Current folder</SelectItem>
                    <SelectItem value="selection">Selected files</SelectItem>
                  </SelectPopup>
                </Select>
              </div>

              <Button onClick={handleScan} disabled={isScanning}>
                {isScanning ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Bug className="mr-2 size-4" />
                )}
                {isScanning ? "Scanning..." : "Scan for mess"}
              </Button>
            </div>
          </section>

          {result && (
            <>
              {result.issues.length === 0 ? (
                <Alert>
                  <AlertDescription>
                    No issues found. Your library is clean.
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Scanned {result.scannedFiles.toLocaleString()} files across{" "}
                    {result.scannedRoots.length} root
                    {result.scannedRoots.length !== 1 ? "s" : ""}. Found{" "}
                    {result.issues.length} issue
                    {result.issues.length !== 1 ? "s" : ""}.
                  </p>

                  <section className="space-y-4 rounded-xl border border-border/40 bg-muted/30 p-4">
                    <div className="flex items-center gap-2">
                      <Bug className="size-4 text-primary" />
                      <span className="text-sm font-medium">
                        Issue breakdown
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                      {ISSUE_GROUPS.map((group) => {
                        const count = issueCounts?.[group.kind] ?? 0;
                        return (
                          <Card key={group.kind} size="sm">
                            <CardContent className="flex flex-col gap-0.5">
                              <p className="text-xs text-muted-foreground">
                                {group.label}
                              </p>
                              <p className="text-xl font-semibold">{count}</p>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                      <Switch
                        id="allow-cleanup"
                        checked={allowCleanup}
                        onCheckedChange={setAllowCleanup}
                      />
                      <Label
                        htmlFor="allow-cleanup"
                        className="text-xs text-muted-foreground"
                      >
                        Allow cleanup actions (advanced)
                      </Label>
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
                                <span className="font-medium">
                                  {group.label}
                                </span>
                                <Badge variant="secondary">
                                  {issues.length}
                                </Badge>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent>
                              <div className="space-y-1.5">
                                {issues.map((issue, idx) => (
                                  <div
                                    key={idx}
                                    className="flex items-center gap-2 rounded-lg border border-border/40 bg-background/50 px-3 py-1.5"
                                  >
                                    <p
                                      className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
                                      title={issue.path}
                                    >
                                      {issue.message}
                                    </p>

                                    {isDesktopApp() && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() =>
                                          handleReveal(
                                            issue.fileIds[0],
                                            issue.path,
                                          )
                                        }
                                        title="Reveal in Explorer"
                                      >
                                        <Eye className="mr-1 size-3" />
                                        Reveal
                                      </Button>
                                    )}

                                    {allowCleanup &&
                                      isFolderAction &&
                                      issues.length > 0 &&
                                      idx === 0 && (
                                        <Button
                                          variant="destructive"
                                          size="sm"
                                          onClick={() =>
                                            handleDeleteFolders(
                                              issues.map((i) => i.path),
                                            )
                                          }
                                          disabled={isRemoving}
                                          className="ml-2"
                                        >
                                          Delete all
                                        </Button>
                                      )}
                                  </div>
                                ))}
                              </div>

                              {allowCleanup &&
                                allFileIds.length > 0 &&
                                !isFolderAction && (
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
                </>
              )}

              <Alert>
                <AlertDescription>
                  No files were changed. This report only shows possible cleanup
                  issues.
                </AlertDescription>
              </Alert>
            </>
          )}
        </div>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}
