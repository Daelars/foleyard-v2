"use client";

import {
  FileInput,
  FolderOpen,
  FolderSearch,
  Loader2,
  Trash2,
} from "lucide-react";

import {
  Alert,
  Button,
  Dialog,
  DialogDescription,
  DialogDivider,
  DialogFooter,
  DialogTitle,
  Progress,
  SettingRow,
} from "@/components/variant-i";
import { isDesktopApp } from "@/lib/desktop";

import {
  useLibraryGathererV2,
} from "@/components/extensions/library-gatherer-v2/use-library-gatherer-v2";

const TITLE_ID = "v3-library-gatherer-title";
const DESC_ID = "v3-library-gatherer-desc";

/**
 * app-v3 adapter for the Library Gatherer v2 dialog: same I-styled
 * construction as the other extension flows, driven by the v2 gatherer
 * hook (source grants, immediate preview, destination grant, job).
 */
export function V3LibraryGathererDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const gather = useLibraryGathererV2({ open });

  const handleClose = () => {
    onOpenChange(false);
  };

  const canPreview = !gather.busy && gather.phase !== "working" && gather.sources.length > 0;
  const canGather =
    !gather.busy &&
    (gather.phase === "preview" || gather.phase === "form") &&
    gather.sources.length > 0 &&
    gather.grantId !== "";

  return (
    <Dialog open={open} onClose={handleClose} labelledBy={TITLE_ID} describedBy={DESC_ID} maxWidth="max-w-lg">
      <DialogTitle id={TITLE_ID}>Library Gatherer</DialogTitle>
      <DialogDescription id={DESC_ID}>
        Bring scattered sound folders into one main Foleyard library.
      </DialogDescription>

      <SettingRow
        title="Source folders"
        description={gather.sources.length === 0 ? "Browse a folder to grant read access." : undefined}
      >
        {gather.sources.length > 0 && (
          <div className="grid gap-1.5">
            {gather.sources.map((source) => (
              <div
                key={source.path}
                className="flex items-center justify-between gap-2 rounded-lg border border-[var(--vi-edge)] bg-black/25 px-3 py-1.5"
              >
                <p className="min-w-0 flex-1 truncate text-sm text-zinc-100">{source.path}</p>
                <Button
                  tone="ghost"
                  size="icon"
                  className="size-6 shrink-0 [&_svg]:size-3"
                  aria-label={`Remove ${source.path}`}
                  onClick={() => gather.handleRemoveFolder(source.path)}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        )}
        {isDesktopApp() && (
          <Button
            tone="secondary"
            size="sm"
            className="mt-2 gap-1.5"
            onClick={() => void gather.handlePickFolder()}
            loading={gather.busy}
          >
            <FolderOpen className="size-3.5" />
            Browse
          </Button>
        )}
      </SettingRow>

      <SettingRow title="Main library destination">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-400">
            {gather.destPath || "No destination chosen"}
          </p>
          {isDesktopApp() && (
            <Button
              tone="secondary"
              size="sm"
              onClick={() => void gather.handlePickDest()}
              loading={gather.busy}
            >
              Choose
            </Button>
          )}
        </div>
      </SettingRow>

      {gather.error && <Alert tone="error" title="Gather failed" body={gather.error} />}

      {gather.phase === "working" && (
        <Progress
          percent={
            gather.progress.total > 0
              ? Math.round((gather.progress.completed / gather.progress.total) * 100)
              : 0
          }
          top="Gathering"
          bottom={`${gather.progress.completed} of ${gather.progress.total} files`}
        />
      )}

      {gather.preview && (
        <SettingRow title="Gather preview">
          <p className="text-[13px] text-zinc-300">
            {gather.preview.candidates.toLocaleString()} files will be copied
            {gather.preview.truncated ? " (truncated at the walk bound)" : ""}. No
            originals will be moved or deleted.
          </p>
          {gather.preview.outputNames.length > 0 && (
            <div className="vi-scroll mt-2 grid max-h-32 gap-1 overflow-y-auto">
              {gather.preview.outputNames.slice(0, 20).map((name, idx) => (
                <p key={idx} className="truncate font-mono text-[11px] text-zinc-500">
                  {name}
                </p>
              ))}
              {gather.preview.outputNames.length > 20 && (
                <p className="font-mono text-[11px] text-zinc-600">
                  ...and {gather.preview.outputNames.length - 20} more
                </p>
              )}
            </div>
          )}
        </SettingRow>
      )}

      {gather.result && (
        <SettingRow title="Gather complete">
          <p className="text-[13px] text-zinc-300">
            {gather.result.copied.toLocaleString()} files copied,{" "}
            {gather.result.skipped.toLocaleString()} skipped.
          </p>
          <p className="mt-1 font-mono text-[10px] text-zinc-600">
            {gather.result.inserted} new library records.
          </p>
          {isDesktopApp() && (
            <div className="mt-2 flex gap-2">
              <Button
                tone="secondary"
                size="sm"
                className="flex-1 gap-1.5"
                onClick={() => void gather.handleReveal(gather.destPath)}
              >
                <FolderOpen className="size-3.5" />
                Open destination
              </Button>
            </div>
          )}
        </SettingRow>
      )}

      <DialogDivider />
      <DialogFooter>
        {gather.phase === "working" ? (
          <Button tone="secondary" size="sm" onClick={() => void gather.handleCancelJob()}>
            Cancel gather
          </Button>
        ) : gather.phase === "done" ? null : (
          <>
            <Button tone="secondary" size="sm" onClick={() => void gather.handlePreview()} disabled={!canPreview} loading={gather.busy}>
              {gather.busy ? null : <FolderSearch className="size-3.5" />}
              Preview
            </Button>
            <Button
              tone="primary"
              size="sm"
              onClick={() => void gather.handleGather()}
              disabled={!canGather}
              title={gather.grantId ? "Start the gather as a background job" : "Choose a destination first"}
            >
              {gather.busy ? <Loader2 className="animate-spin motion-reduce:[animation:none]" /> : <FileInput className="size-3.5" />}
              {gather.busy ? "Working..." : "Gather into library"}
            </Button>
          </>
        )}
      </DialogFooter>
    </Dialog>
  );
}