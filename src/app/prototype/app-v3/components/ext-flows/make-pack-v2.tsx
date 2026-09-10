"use client";

import { FileAudio, FileText, FolderOpen, Loader2, PackagePlus } from "lucide-react";

import {
  Alert,
  Button,
  Dialog,
  DialogDescription,
  DialogDivider,
  DialogFooter,
  DialogTitle,
  Field,
  PackFormatOption,
  PackSourceOption,
  Switch,
} from "@/components/variant-i";
import { isDesktopApp } from "@/lib/desktop";

import {
  useMakePackV2,
  type MakePackV2Format,
  type MakePackV2Source,
} from "@/components/extensions/make-pack-v2/use-make-pack-v2";

interface MakePackV2DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSource?: MakePackV2Source;
  initialFileIds?: string[];
}

const TITLE_ID = "v3-make-pack-v2-title";
const DESC_ID = "v3-make-pack-v2-desc";

export function V3MakePackV2Dialog({
  open,
  onOpenChange,
  initialSource = "selection",
  initialFileIds = [],
}: MakePackV2DialogProps) {
  const pack = useMakePackV2({ open, initialSource, initialFileIds });
  const selectionCount = pack.fileIds.length;

  const canPreview =
    !pack.busy &&
    pack.phase !== "working" &&
    (pack.source !== "selection" || selectionCount > 0) &&
    pack.packName.trim().length > 0;

  const setSourceValue = (value: string) => pack.setSource(value as MakePackV2Source);
  const setFormatValue = (value: string) =>
    pack.setOutputFormat(value as MakePackV2Format);

  const footer = pack.phase === "done" ? null : (
    <>
      {pack.phase === "working" ? (
        <Button tone="secondary" onClick={() => void pack.handleCancelJob()}>
          Cancel pack
        </Button>
      ) : (
        <>
          {pack.phase === "preview" ? (
            <Button
              tone="primary"
              onClick={() => void pack.handleStartJob()}
              disabled={pack.busy || !pack.grantId}
              loading={pack.busy}
              title={
                pack.grantId
                  ? "Start the pack as a background job"
                  : "Choose a destination first"
              }
            >
              <PackagePlus />
              Pack {pack.preview ? `(${pack.preview.targets.fileIds.length})` : ""}
            </Button>
          ) : (
            <Button
              tone="primary"
              onClick={() => void pack.handlePreview()}
              disabled={!canPreview}
              loading={pack.busy}
            >
              <PackagePlus />
              Preview pack
            </Button>
          )}
        </>
      )}
    </>
  );

  return (
    <Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      labelledBy={TITLE_ID}
      describedBy={DESC_ID}
      maxWidth="max-w-lg"
    >
      <DialogTitle id={TITLE_ID}>
        <span className="inline-flex items-center gap-2">
          <PackagePlus className="size-4 text-accent-text" />
          Make Pack v2
        </span>
      </DialogTitle>
      <DialogDescription id={DESC_ID}>
        Turn sounds into a clean folder or zip through the v2 extension engine.
      </DialogDescription>
      <DialogDivider />

      <div className="vi-scroll max-h-[60vh] space-y-4 overflow-y-auto">
        <section className="space-y-4 rounded-xl border border-[var(--vi-edge)] bg-white/[0.02] p-4">
          <div className="flex items-center gap-2">
            <PackagePlus className="size-4 text-accent-text" />
            <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
              Pack source
            </span>
            {pack.source === "selection" && selectionCount > 0 && (
              <span className="shrink-0 rounded-full border border-[var(--vi-edge)] bg-black/30 px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.1em] text-zinc-400">
                {selectionCount}
              </span>
            )}
          </div>

          <div className="grid gap-2">
            <PackSourceOption
              value="selection"
              label="Current selection"
              description={
                selectionCount > 0
                  ? `${selectionCount} sounds in the selection`
                  : "Pack the current library selection"
              }
              selected={pack.source === "selection"}
              onSelect={setSourceValue}
            />
            <PackSourceOption
              value="shelf"
              label="Sound Shelf"
              description="Pack everything on the Sound Shelf"
              selected={pack.source === "shelf"}
              onSelect={setSourceValue}
            />
            <PackSourceOption
              value="recent"
              label="Recently previewed"
              description="Pack sounds you recently previewed"
              selected={pack.source === "recent"}
              onSelect={setSourceValue}
            />
          </div>
          {pack.source === "selection" && selectionCount === 0 ? (
            <p role="alert" className="text-xs text-accent-text">
              Select at least one sound to pack from the selection.
            </p>
          ) : null}
        </section>

        <section className="space-y-4 rounded-xl border border-[var(--vi-edge)] bg-white/[0.02] p-4">
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-accent-text" />
            <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
              Pack details
            </span>
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <span className="text-[13px] font-medium text-zinc-100">
                Pack name
              </span>
              <Field
                id="v3-make-pack-v2-name"
                value={pack.packName}
                onChange={(event) => pack.setPackName(event.target.value)}
                placeholder="My Sound Pack"
              />
            </div>
            <div className="space-y-1.5">
              <span className="text-[13px] font-medium text-zinc-100">
                Destination
              </span>
              <div className="flex gap-2">
                <Field
                  value={pack.destPath}
                  onChange={() => undefined}
                  placeholder="/path/to/output/folder"
                  aria-label="Destination"
                  className="flex-1"
                />
                {isDesktopApp() && (
                  <Button
                    tone="secondary"
                    size="sm"
                    onClick={() => void pack.handlePickDest()}
                  >
                    {pack.busy ? "…" : "Choose"}
                  </Button>
                )}
              </div>
              {!isDesktopApp() ? (
                <p className="text-xs text-zinc-500">
                  Destination picker requires the desktop app.
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <span className="text-[13px] font-medium text-zinc-100">
                Output format
              </span>
              <div className="flex gap-2">
                <PackFormatOption
                  value="folder"
                  label="Folder"
                  selected={pack.outputFormat === "folder"}
                  onSelect={setFormatValue}
                />
                <PackFormatOption
                  value="zip"
                  label="Zip archive"
                  selected={pack.outputFormat === "zip"}
                  onSelect={setFormatValue}
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--vi-edge)] px-3 py-2.5">
              <span className="text-[13px] font-medium text-zinc-100">
                Include manifest.json
              </span>
              <Switch
                label="Include manifest.json"
                checked={pack.includeManifest}
                onCheckedChange={pack.setIncludeManifest}
              />
            </div>
          </div>
        </section>

        {pack.error ? (
          <Alert tone="error" title="Pack failed" body={pack.error} />
        ) : null}

        {pack.preview && pack.phase !== "form" ? (
          <section className="space-y-4 rounded-xl border border-[var(--vi-edge)] bg-white/[0.02] p-4">
            <div className="flex items-center gap-2">
              <FileAudio className="size-4 text-accent-text" />
              <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
                Preview
              </span>
            </div>
            <p className="text-sm text-zinc-200">{pack.preview.summary}</p>
            {pack.preview.tables.map((table) => (
              <div key={table.id} className="vi-scroll mt-2 overflow-x-auto">
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
                    {table.rows.map((row, index) => (
                      <tr
                        key={index}
                        className="border-t border-white/5 text-zinc-300"
                      >
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex} className="break-all px-2 py-1">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            {pack.preview.notices.map((notice, index) => (
              <p
                key={index}
                role={notice.tone === "error" ? "alert" : undefined}
                className={
                  notice.tone === "warning"
                    ? "mt-1 text-xs text-amber-300"
                    : notice.tone === "error"
                      ? "mt-1 text-xs text-accent-text"
                      : "mt-1 text-xs text-zinc-400"
                }
              >
                {notice.message}
              </p>
            ))}
          </section>
        ) : null}

        {pack.phase === "working" ? (
          <section className="space-y-4 rounded-xl border border-[var(--vi-edge)] bg-white/[0.02] p-4">
            <div className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin text-accent-text" />
              <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
                Packing
              </span>
            </div>
            <p className="text-sm text-zinc-300" role="status">
              {pack.progress.total > 0
                ? `Working… ${pack.progress.completed} of ${pack.progress.total}`
                : "Starting…"}
            </p>
            <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-accent-fill shadow-[0_0_8px_color-mix(in_oklab,var(--accent-fill)_40%,transparent)] transition-[width] duration-300 ease-out"
                style={{
                  width: `${
                    pack.progress.total > 0
                      ? Math.min(
                          100,
                          (pack.progress.completed / pack.progress.total) * 100,
                        )
                      : 0
                  }%`,
                }}
              />
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              Cancelling removes unfinished job output; finished packs and
              unrelated files stay.
            </p>
          </section>
        ) : null}

        {pack.phase === "done" && pack.result ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-teal-300/25 bg-teal-300/[0.05] px-3.5 py-3">
              <p className="text-xs leading-relaxed text-zinc-400">
                Packed {pack.result.copied} sound
                {pack.result.copied === 1 ? "" : "s"}
                {pack.result.outputPath
                  ? ` to ${pack.result.outputPath}`
                  : ""}
                . No originals were changed.
              </p>
            </div>
            {pack.result.skipped.length > 0 ? (
              <p className="text-xs text-amber-300">
                Skipped (missing on disk): {pack.result.skipped.join(", ")}
              </p>
            ) : null}
            {pack.result.missing.length > 0 ? (
              <p className="text-xs text-amber-300">
                Missing from the Library: {pack.result.missing.join(", ")}
              </p>
            ) : null}
            {pack.result.failedFiles.map((file, index) => (
              <p key={file} role="alert" className="text-xs text-accent-text">
                {file}: {pack.result?.failedReasons[index] ?? "failed"}
              </p>
            ))}
            {pack.result.manifestIncluded ? (
              <p className="text-xs text-zinc-500">manifest.json included.</p>
            ) : null}
            <Button
              tone="secondary"
              className="w-full"
              disabled={!isDesktopApp() || !pack.result.outputPath}
              title={
                isDesktopApp()
                  ? "Reveal the pack (capability desktop:reveal)"
                  : "Reveal requires the desktop app (capability desktop:reveal unavailable)"
              }
              onClick={() => void pack.handleReveal()}
            >
              <FolderOpen />
              Open destination
            </Button>
          </div>
        ) : pack.phase === "form" ? (
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-[var(--vi-edge)] bg-white/[0.02] p-3">
            <PackagePlus className="size-4 text-zinc-500" />
            <p className="text-xs text-zinc-400">
              Preview the pack, choose a destination, then start the job.
            </p>
          </div>
        ) : null}
      </div>

      {pack.phase === "done" ? null : (
        <DialogFooter>
          {pack.phase !== "working" && (
            <Button tone="secondary" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          )}
          {footer}
        </DialogFooter>
      )}
    </Dialog>
  );
}