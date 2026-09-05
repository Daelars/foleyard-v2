"use client";

import {
  FileInput,
  FolderOpen,
  Loader2,
  Plus,
  Trash2,
  FolderSearch,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getDesktopBridge, isDesktopApp } from "@/lib/desktop";
import {
  ExtensionFooterRow,
  ExtensionPathField,
  ExtensionSection,
  ExtensionStatusBanner,
} from "@/components/extensions/dialog-fields";

import { useLibraryGatherer } from "./use-library-gatherer";

export function LibraryGathererDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const {
    sourceFolders,
    newFolderPath,
    setNewFolderPath,
    destDir,
    setDestDir,
    isLoading,
    previewResult,
    completedResult,
    reset,
    handleAddFolder,
    handlePickFolder,
    handleRemoveFolder,
    handlePickDest,
    handlePreview,
    handleGather,
  } = useLibraryGatherer();

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          reset();
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Library Gatherer</DialogTitle>
          <DialogDescription>
            Bring scattered sound folders into one main Foleyard library.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-6 space-y-6">
          <ExtensionSection
            icon={<FolderSearch className="size-4 text-accent-text" />}
            title="Source folders"
            count={sourceFolders.length}
          >
            {sourceFolders.length > 0 && (
              <div className="space-y-1.5">
                {sourceFolders.map((folder) => (
                  <div
                    key={folder}
                    className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-1.5"
                  >
                    <p className="truncate text-sm">{folder}</p>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemoveFolder(folder)}
                    >
                      <Trash2 className="size-3" />
                      <span className="sr-only">Remove</span>
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Input
                value={newFolderPath}
                onChange={(e) => setNewFolderPath(e.target.value)}
                placeholder="/path/to/sound/folder"
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddFolder();
                }}
              />
              {isDesktopApp() && (
                <Button variant="outline" size="sm" onClick={handlePickFolder}>
                  <FolderOpen className="mr-1 size-3" />
                  Browse
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={handleAddFolder}
                disabled={!newFolderPath.trim()}
              >
                <Plus className="mr-1 size-3" />
                Add
              </Button>
            </div>
          </ExtensionSection>

          <ExtensionSection
            icon={<FolderOpen className="size-4 text-accent-text" />}
            title="Main library destination"
          >
            <ExtensionPathField
              value={destDir}
              onChange={setDestDir}
              placeholder="/path/to/main/library"
              showPick={isDesktopApp()}
              pickLabel="Choose"
              onPick={handlePickDest}
            />
          </ExtensionSection>

          {previewResult && (
            <ExtensionStatusBanner title="Gather preview">
              {previewResult.copied.toLocaleString()} files will be copied.
              {previewResult.skipped > 0 &&
                ` ${previewResult.skipped.toLocaleString()} ${
                  previewResult.skipped === 1 ? "duplicate" : "duplicates"
                } will be skipped.`}{" "}
              No originals will be moved or deleted.
            </ExtensionStatusBanner>
          )}

          {previewResult && previewResult.files.length > 0 && (
            <div className="max-h-32 space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-white/5 p-3">
              {previewResult.files.slice(0, 20).map((file, idx) => (
                <p key={idx} className="truncate font-mono text-xs text-zinc-400">
                  {file.sourcePath} → {file.outputPath}
                  {file.reason && (
                    <span className="text-zinc-600">
                      {" "}
                      ({file.reason})
                    </span>
                  )}
                </p>
              ))}
              {previewResult.files.length > 20 && (
                <p className="font-mono text-xs text-zinc-500">
                  ...and {previewResult.files.length - 20} more
                </p>
              )}
            </div>
          )}

          {completedResult && (
            <div className="space-y-3">
              <ExtensionStatusBanner title="Gather complete">
                {completedResult.copied.toLocaleString()} files copied,{" "}
                {completedResult.skipped.toLocaleString()} skipped.
                <br />
                <span className="font-mono text-xs text-zinc-500">
                  Report saved to {completedResult.reportPath}
                </span>
              </ExtensionStatusBanner>

              {isDesktopApp() && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => getDesktopBridge()?.revealPath(destDir)}
                  >
                    <FolderOpen className="mr-2 size-4" />
                    Open destination
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() =>
                      getDesktopBridge()?.revealPath(completedResult.reportPath)
                    }
                  >
                    <FileInput className="mr-2 size-4" />
                    Reveal report
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter showCloseButton={!completedResult}>
          {!completedResult ? (
            <ExtensionFooterRow>
              <Button
                variant="secondary"
                onClick={handlePreview}
                disabled={
                  isLoading || sourceFolders.length === 0 || !destDir.trim()
                }
              >
                {isLoading ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : null}
                Preview
              </Button>
              <Button
                onClick={handleGather}
                disabled={
                  isLoading || sourceFolders.length === 0 || !destDir.trim()
                }
              >
                <FileInput className="mr-2 size-4" />
                {isLoading ? "Working..." : "Gather into library"}
              </Button>
            </ExtensionFooterRow>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
