"use client";

import { FileAudio, FileText, FolderOpen, Loader2, PackagePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ExtensionDialogShell } from "@/components/extensions/ExtensionDialogShell";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { isDesktopApp } from "@/lib/desktop";
import {
  ExtensionFooterRow,
  ExtensionHintRow,
  ExtensionPathField,
  ExtensionSection,
  ExtensionStatusBanner,
} from "@/components/extensions/dialog-fields";

import {
  useMakePackV2,
  type MakePackV2Format,
  type MakePackV2Source,
} from "./use-make-pack-v2";

interface MakePackV2DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSource?: MakePackV2Source;
  initialFileIds?: string[];
}

/**
 * Make Pack v2 dialog (Application context, R8).
 *
 * Renderer-owned orchestration over the generic v2 transport: preview
 * through the review-plan channel, destination through the desktop
 * picker plus the grants route, export as a cancellable background
 * job with polling, and capability-aware reveal of the result. The
 * engine stays generic; this dialog only sequences its endpoints.
 */
export function MakePackV2Dialog({
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

  const footer =
    pack.phase === "done" ? null : (
      <ExtensionFooterRow>
        {pack.phase === "working" ? (
          <Button variant="outline" onClick={() => void pack.handleCancelJob()}>
            Cancel pack
          </Button>
        ) : (
          <>
            {pack.phase === "preview" ? (
              <Button
                onClick={() => void pack.handleStartJob()}
                disabled={pack.busy || !pack.grantId}
                title={pack.grantId ? "Start the pack as a background job" : "Choose a destination first"}
              >
                {pack.busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <PackagePlus className="mr-2 size-4" />}
                Pack {pack.preview ? `(${pack.preview.targets.fileIds.length})` : ""}
              </Button>
            ) : (
              <Button onClick={() => void pack.handlePreview()} disabled={!canPreview}>
                {pack.busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <PackagePlus className="mr-2 size-4" />}
                Preview pack
              </Button>
            )}
          </>
        )}
      </ExtensionFooterRow>
    );

  return (
    <ExtensionDialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="Make Pack v2"
      description="Turn sounds into a clean folder or zip through the v2 extension engine."
      icon={<PackagePlus className="size-4" />}
      footer={footer}
      showCloseButton={pack.phase !== "working"}
    >
      <ExtensionSection
        icon={<PackagePlus className="size-4 text-accent-text" />}
        title="Pack source"
        count={pack.source === "selection" && selectionCount > 0 ? selectionCount : undefined}
      >
        <RadioGroup
          value={pack.source}
          onValueChange={(value) => pack.setSource(value as MakePackV2Source)}
        >
          <RadioGroupItem value="selection">
            Current selection
            {selectionCount > 0 && (
              <span className="ml-1 text-xs text-zinc-400">· {selectionCount} sounds</span>
            )}
          </RadioGroupItem>
          <RadioGroupItem value="shelf">Sound Shelf</RadioGroupItem>
          <RadioGroupItem value="recent">Recently previewed</RadioGroupItem>
        </RadioGroup>
        {pack.source === "selection" && selectionCount === 0 ? (
          <p role="alert" className="mt-2 text-xs text-destructive">
            Select at least one sound to pack from the selection.
          </p>
        ) : null}
      </ExtensionSection>

      <ExtensionSection
        icon={<FileText className="size-4 text-accent-text" />}
        title="Pack details"
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Pack name</Label>
            <Input
              value={pack.packName}
              onChange={(event) => pack.setPackName(event.target.value)}
              placeholder="My Sound Pack"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Destination</Label>
            <ExtensionPathField
              value={pack.destPath}
              onChange={() => undefined}
              placeholder="/path/to/output/folder"
              showPick={isDesktopApp()}
              pickLabel={pack.busy ? "…" : "Choose"}
              onPick={() => void pack.handlePickDest()}
            />
            {!isDesktopApp() ? (
              <p className="text-xs text-zinc-500">
                Destination picker requires the desktop app.
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Output format</Label>
            <RadioGroup
              value={pack.outputFormat}
              onValueChange={(value) => pack.setOutputFormat(value as MakePackV2Format)}
            >
              <RadioGroupItem value="folder">Folder</RadioGroupItem>
              <RadioGroupItem value="zip">Zip archive</RadioGroupItem>
            </RadioGroup>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="make-pack-v2-manifest">Include manifest.json</Label>
            <Switch
              id="make-pack-v2-manifest"
              checked={pack.includeManifest}
              onCheckedChange={pack.setIncludeManifest}
            />
          </div>
        </div>
      </ExtensionSection>

      {pack.error ? (
        <ExtensionStatusBanner title="Pack failed">{pack.error}</ExtensionStatusBanner>
      ) : null}

      {pack.preview && pack.phase !== "form" ? (
        <ExtensionSection
          icon={<FileAudio className="size-4 text-accent-text" />}
          title="Preview"
        >
          <p className="text-sm text-zinc-200">{pack.preview.summary}</p>
          {pack.preview.tables.map((table) => (
            <div key={table.id} className="mt-2 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left font-mono uppercase tracking-wider text-zinc-500">
                    {table.columns.map((column) => (
                      <th key={column} className="px-2 py-1">{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row, index) => (
                    <tr key={index} className="border-t border-white/5 text-zinc-300">
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex} className="break-all px-2 py-1">{cell}</td>
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
                    ? "mt-1 text-xs text-destructive"
                    : "mt-1 text-xs text-zinc-400"
              }
            >
              {notice.message}
            </p>
          ))}
        </ExtensionSection>
      ) : null}

      {pack.phase === "working" ? (
        <ExtensionSection
          icon={<Loader2 className="size-4 animate-spin text-accent-text" />}
          title="Packing"
        >
          <p className="text-sm text-zinc-300" role="status">
            {pack.progress.total > 0
              ? `Working… ${pack.progress.completed} of ${pack.progress.total}`
              : "Starting…"}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Cancelling removes unfinished job output; finished packs and unrelated files stay.
          </p>
        </ExtensionSection>
      ) : null}

      {pack.phase === "done" && pack.result ? (
        <div className="space-y-3">
          <ExtensionStatusBanner>
            Packed {pack.result.copied} sound{pack.result.copied === 1 ? "" : "s"}
            {pack.result.outputPath ? ` to ${pack.result.outputPath}` : ""}. No originals were changed.
          </ExtensionStatusBanner>
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
            <p key={file} role="alert" className="text-xs text-destructive">
              {file}: {pack.result?.failedReasons[index] ?? "failed"}
            </p>
          ))}
          {pack.result.manifestIncluded ? (
            <p className="text-xs text-zinc-500">manifest.json included.</p>
          ) : null}
          <Button
            variant="outline"
            className="w-full"
            disabled={!isDesktopApp() || !pack.result.outputPath}
            title={
              isDesktopApp()
                ? "Reveal the pack (capability desktop:reveal)"
                : "Reveal requires the desktop app (capability desktop:reveal unavailable)"
            }
            onClick={() => void pack.handleReveal()}
          >
            <FolderOpen className="mr-2 size-4" />
            Open destination
          </Button>
        </div>
      ) : pack.phase === "form" ? (
        <ExtensionHintRow icon={<PackagePlus className="size-4 text-zinc-400" />}>
          Preview the pack, choose a destination, then start the job.
        </ExtensionHintRow>
      ) : null}
    </ExtensionDialogShell>
  );
}
