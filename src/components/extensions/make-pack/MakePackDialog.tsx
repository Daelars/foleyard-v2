"use client"

import {
  FolderUp,
  FolderOpen,
  Loader2,
  PackagePlus,
  FileAudio,
  FileText,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { ExtensionDialogShell } from "@/components/extensions/ExtensionDialogShell"
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getDesktopBridge, isDesktopApp } from "@/lib/desktop"
import {
  ExtensionFooterRow,
  ExtensionHintRow,
  ExtensionPathField,
  ExtensionSection,
  ExtensionStatusBanner,
} from "@/components/extensions/dialog-fields"

import {
  useMakePack,
  type MakePackOutputFormat,
  type MakePackSource,
} from "./use-make-pack"

interface MakePackDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialSource?: MakePackSource
  initialFileIds?: string[]
  initialOutputFormat?: MakePackOutputFormat
}

export function MakePackDialog({
  open,
  onOpenChange,
  initialSource = "selection",
  initialFileIds = [],
  initialOutputFormat = "zip",
}: MakePackDialogProps) {
  const {
    source,
    setSource,
    packName,
    setPackName,
    destDir,
    setDestDir,
    outputFormat,
    setOutputFormat,
    isLoading,
    result,
    handlePickDest,
    handleMakePack,
  } = useMakePack({ open, initialSource, initialFileIds, initialOutputFormat })

  const footer = !result ? (
    <ExtensionFooterRow>
      <Button
        onClick={handleMakePack}
        disabled={
          isLoading || !destDir.trim() || !packName.trim()
        }
      >
        {isLoading ? (
          <Loader2 className="mr-2 size-4 animate-spin" />
        ) : (
          <PackagePlus className="mr-2 size-4" />
        )}
        Make Pack
      </Button>
    </ExtensionFooterRow>
  ) : null

  return (
    <ExtensionDialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="Make Pack"
      description="Turn selected sounds into a clean folder or zip."
      icon={<PackagePlus className="size-4" />}
      footer={footer}
      showCloseButton={!result}
    >
          <ExtensionSection
            icon={<PackagePlus className="size-4 text-accent-text" />}
            title="Pack source"
            count={initialFileIds.length > 0 && source === "selection" ? initialFileIds.length : undefined}
          >
            <RadioGroup
              value={source}
              onValueChange={(v) =>
                setSource(v as MakePackSource)
              }
            >
              <RadioGroupItem value="selection">
                Current selection
                {initialFileIds.length > 0 && (
                  <span className="ml-1 text-xs text-zinc-400">
                    · {initialFileIds.length} sounds
                  </span>
                )}
              </RadioGroupItem>
              <RadioGroupItem value="shelf">Sound Shelf</RadioGroupItem>
              <RadioGroupItem value="recent">Recently used</RadioGroupItem>
            </RadioGroup>
          </ExtensionSection>

          <ExtensionSection
            icon={<FileText className="size-4 text-accent-text" />}
            title="Pack details"
          >
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Pack name</Label>
                <Input
                  value={packName}
                  onChange={(e) => setPackName(e.target.value)}
                  placeholder="My Sound Pack"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Destination</Label>
                <ExtensionPathField
                  value={destDir}
                  onChange={setDestDir}
                  placeholder="/path/to/output/folder"
                  showPick={isDesktopApp()}
                  pickLabel="Choose"
                  onPick={handlePickDest}
                />
              </div>
            </div>
          </ExtensionSection>

          <ExtensionSection
            icon={<FileAudio className="size-4 text-accent-text" />}
            title="Output format"
          >
            <RadioGroup
              value={outputFormat}
              onValueChange={(v) =>
                setOutputFormat(v as MakePackOutputFormat)
              }
            >
              <RadioGroupItem value="folder">Folder</RadioGroupItem>
              <RadioGroupItem value="zip">Zip archive</RadioGroupItem>
            </RadioGroup>
          </ExtensionSection>

          {result ? (
            <div className="space-y-3">
              <ExtensionStatusBanner>
                {result.fileCount} sounds packed to {result.outputPath}.
                No originals were changed.
              </ExtensionStatusBanner>

              {isDesktopApp() && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => getDesktopBridge()?.revealPath(result.outputPath)}
                >
                  <FolderOpen className="mr-2 size-4" />
                  Open destination
                </Button>
              )}
            </div>
          ) : (
            <ExtensionHintRow icon={<FolderUp className="size-4 text-zinc-400" />}>
              Set a destination and pack name above, then click &quot;Make Pack&quot;
            </ExtensionHintRow>
          )}
    </ExtensionDialogShell>
  )
}
