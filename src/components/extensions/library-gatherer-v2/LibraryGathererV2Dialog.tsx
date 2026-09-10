"use client";

import {
  FileInput,
  FolderOpen,
  FolderSearch,
  Loader2,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ExtensionDialogShell } from "@/components/extensions/ExtensionDialogShell";
import { isDesktopApp } from "@/lib/desktop";
import {
  ExtensionFooterRow,
  ExtensionPathField,
  ExtensionSection,
  ExtensionStatusBanner,
} from "@/components/extensions/dialog-fields";

import { useLibraryGathererV2 } from "./use-library-gatherer-v2";

interface LibraryGathererV2DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Library Gatherer v2 dialog (Application context).
 *
 * Renderer-owned orchestration over the generic v2 transport: source
 * folders through source grants, preview through the immediate
 * preview-gather command, destination through the desktop picker plus
 * the grants route, gather as a cancellable background job with
 * polling, and capability-aware reveal of the result.
 */
export function LibraryGathererV2Dialog({
  open,
  onOpenChange,
}: LibraryGathererV2DialogProps) {
  const gather = useLibraryGathererV2({ open });

  const canPreview = !gather.busy && gather.phase !== "working" && gather.sources.length > 0;
  const canGather =
    !gather.busy &&
    (gather.phase === "preview" || gather.phase === "form") &&
    gather.sources.length > 0 &&
    gather.grantId !== "";

  const footer =
    gather.phase === "done" ? null : (
      <ExtensionFooterRow>
        {gather.phase === "working" ? (
          <Button variant="outline" onClick={() => void gather.handleCancelJob()}>
            Cancel gather
          </Button>
        ) : (
          <>
            <Button onClick={() => void gather.handlePreview()} disabled={!canPreview}>
              {gather.busy && gather.phase !== "preview" ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <FolderSearch className="mr-2 size-4" />
              )}
              Preview
            </Button>
            <Button
              onClick={() => void gather.handleGather()}
              disabled={!canGather}
              title={gather.grantId ? "Start the gather as a background job" : "Choose a destination first"}
            >
              {gather.busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileInput className="mr-2 size-4" />}
              {gather.busy ? "Working..." : "Gather into library"}
            </Button>
          </>
        )}
      </ExtensionFooterRow>
    );

  return (
    <ExtensionDialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="Library Gatherer"
      description="Bring scattered sound folders into one main Foleyard library."
      icon={<FolderSearch className="size-4" />}
      footer={footer}
      showCloseButton={gather.phase !== "working"}
    >
      <ExtensionSection
        icon={<FolderSearch className="size-4 text-accent-text" />}
        title="Source folders"
        count={gather.sources.length}
      >
        {gather.sources.length > 0 && (
          <div className="space-y-1.5">
            {gather.sources.map((source) => (
              <div
                key={source.path}
                className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-1.5"
              >
                <p className="truncate text-sm">{source.path}</p>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => gather.handleRemoveFolder(source.path)}
                >
                  <Trash2 className="size-3" />
                  <span className="sr-only">Remove</span>
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          {isDesktopApp() && (
            <Button variant="outline" size="sm" onClick={() => void gather.handlePickFolder()} disabled={gather.busy}>
              <FolderOpen className="mr-1 size-3" />
              Browse
            </Button>
          )}
          <p className="flex-1 text-xs leading-relaxed text-zinc-500">
            Browse a folder to grant read access, or pick folders from the
            main library view. Source folders expire when the app restarts.
          </p>
        </div>
      </ExtensionSection>

      <ExtensionSection
        icon={<FolderOpen className="size-4 text-accent-text" />}
        title="Main library destination"
      >
        <ExtensionPathField
          value={gather.destPath}
          onChange={() => undefined}
          placeholder="/path/to/main/library"
          showPick={isDesktopApp()}
          pickLabel="Choose"
          onPick={() => void gather.handlePickDest()}
        />
      </ExtensionSection>

      {gather.error && (
        <ExtensionStatusBanner title="Gather failed">
          {gather.error}
        </ExtensionStatusBanner>
      )}

      {gather.phase === "working" && (
        <ExtensionStatusBanner title="Gathering…">
          <span className="font-mono text-xs text-zinc-500">
            {gather.progress.total > 0
              ? `${gather.progress.completed} of ${gather.progress.total}`
              : `${gather.progress.completed} files`}
          </span>
        </ExtensionStatusBanner>
      )}

      {gather.preview && (
        <ExtensionStatusBanner title="Gather preview">
          {gather.preview.candidates.toLocaleString()} files will be copied
          {gather.preview.truncated ? " (truncated at the walk bound)" : ""}. No
          originals will be moved or deleted.
        </ExtensionStatusBanner>
      )}

      {gather.preview && gather.preview.outputNames.length > 0 && (
        <div className="max-h-32 space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-white/5 p-3">
          {gather.preview.outputNames.slice(0, 20).map((name, idx) => (
            <p key={idx} className="truncate font-mono text-xs text-zinc-400">
              {name}
            </p>
          ))}
          {gather.preview.outputNames.length > 20 && (
            <p className="font-mono text-xs text-zinc-500">
              ...and {gather.preview.outputNames.length - 20} more
            </p>
          )}
        </div>
      )}

      {gather.result && (
        <ExtensionStatusBanner title="Gather complete">
          {gather.result.copied.toLocaleString()} files copied,{" "}
          {gather.result.skipped.toLocaleString()} skipped.
          <br />
          <span className="font-mono text-xs text-zinc-500">
            {gather.result.inserted} new library records.
          </span>
        </ExtensionStatusBanner>
      )}

      {gather.result && isDesktopApp() && (
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => void gather.handleReveal(gather.destPath)}>
            <FolderOpen className="mr-2 size-4" />
            Open destination
          </Button>
        </div>
      )}
    </ExtensionDialogShell>
  );
}