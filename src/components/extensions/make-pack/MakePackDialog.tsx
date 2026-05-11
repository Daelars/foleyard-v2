"use client"

import { useState, useCallback, useEffect } from "react"
import {
  FolderUp,
  FolderOpen,
  Loader2,
  PackagePlus,
  FileAudio,
  FileJson,
  FileText,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { ExtensionDialogShell } from "@/components/extensions/ExtensionDialogShell"
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { getDesktopBridge, isDesktopApp } from "@/lib/desktop"

interface MakePackDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialSource?: "selection" | "shelf" | "recent"
  initialFileIds?: string[]
}

export function MakePackDialog({
  open,
  onOpenChange,
  initialSource = "selection",
  initialFileIds = [],
}: MakePackDialogProps) {
  const [source, setSource] = useState<"selection" | "shelf" | "recent">(
    initialSource
  )
  const [packName, setPackName] = useState("")
  const [destDir, setDestDir] = useState("")
  const [outputFormat, setOutputFormat] = useState<"folder" | "zip">("zip")
  const [includeTracklist, setIncludeTracklist] = useState(true)
  const [includeMetadata, setIncludeMetadata] = useState(true)
  const [cleanFilenames, setCleanFilenames] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<{
    fileCount: number
    outputPath: string
  } | null>(null)

  // Reset extension-local workflow state each time this modal opens.
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSource(initialSource)
      setPackName(
        initialSource === "selection"
          ? "Selected Sounds Pack"
          : initialSource === "shelf"
            ? "Shelf Pack"
            : "Recent Sounds Pack"
      )
      setDestDir("")
      setOutputFormat("zip")
      setIncludeTracklist(true)
      setIncludeMetadata(true)
      setCleanFilenames(true)
      setResult(null)
    }
  }, [open, initialSource])

  const handlePickDest = useCallback(async () => {
    if (!isDesktopApp()) {
      toast.error("Folder picker requires the desktop app")
      return
    }

    const result = await getDesktopBridge()?.pickFolder()
    if (result?.ok && result.path) {
      setDestDir(result.path)
    }
  }, [])

  const handleMakePack = useCallback(async () => {
    if (!destDir.trim()) {
      toast.error("Choose a destination folder")
      return
    }
    if (!packName.trim()) {
      toast.error("Enter a pack name")
      return
    }

    setIsLoading(true)

    try {
      const body: Record<string, unknown> = {
        source,
        fileIds: initialFileIds,
        destinationDirectory: destDir.trim(),
        packName: packName.trim(),
        outputFormat,
        includeTracklist,
        includeMetadata,
        cleanFilenames,
      }

      const res = await fetch("/api/extensions/make-pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to make pack")
      }

      setResult(data)
      toast.success(`Packed ${data.fileCount} sounds`)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to make pack"
      )
    } finally {
      setIsLoading(false)
    }
  }, [
    source,
    initialFileIds,
    destDir,
    packName,
    outputFormat,
    includeTracklist,
    includeMetadata,
    cleanFilenames,
  ])

  const footer = !result ? (
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
          <section className="space-y-4 rounded-xl border border-border/40 bg-muted/30 p-4">
            <div className="flex items-center gap-2">
              <PackagePlus className="size-4 text-primary" />
              <span className="text-sm font-medium">Pack source</span>
              {initialFileIds.length > 0 && source === "selection" && (
                <Badge variant="secondary">{initialFileIds.length}</Badge>
              )}
            </div>

            <RadioGroup
              value={source}
              onValueChange={(v) =>
                setSource(v as "selection" | "shelf" | "recent")
              }
            >
              <RadioGroupItem value="selection">
                Current selection
                {initialFileIds.length > 0 && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    · {initialFileIds.length} sounds
                  </span>
                )}
              </RadioGroupItem>
              <RadioGroupItem value="shelf">Sound Shelf</RadioGroupItem>
              <RadioGroupItem value="recent">Recently used</RadioGroupItem>
            </RadioGroup>
          </section>

          <section className="space-y-4 rounded-xl border border-border/40 bg-muted/30 p-4">
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-primary" />
              <span className="text-sm font-medium">Pack details</span>
            </div>

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
                <div className="flex gap-2">
                  <Input
                    value={destDir}
                    onChange={(e) => setDestDir(e.target.value)}
                    placeholder="/path/to/output/folder"
                    className="flex-1"
                  />
                  {isDesktopApp() && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePickDest}
                    >
                      <FolderOpen className="mr-1 size-3" />
                      Choose
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-xl border border-border/40 bg-muted/30 p-4">
            <div className="flex items-center gap-2">
              <FileAudio className="size-4 text-primary" />
              <span className="text-sm font-medium">Output format</span>
            </div>

            <RadioGroup
              value={outputFormat}
              onValueChange={(v) =>
                setOutputFormat(v as "folder" | "zip")
              }
            >
              <RadioGroupItem value="folder">Folder</RadioGroupItem>
              <RadioGroupItem value="zip">Zip archive</RadioGroupItem>
            </RadioGroup>
          </section>

          <section className="space-y-3 rounded-xl border border-border/40 bg-muted/30 p-4">
            <div className="flex items-center gap-2">
              <FileJson className="size-4 text-primary" />
              <span className="text-sm font-medium">Pack options</span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div>
                <Label
                  htmlFor="include-tracklist"
                  className="text-sm font-normal"
                >
                  Include tracklist
                </Label>
                <p className="text-xs text-muted-foreground">
                  Add a markdown tracklist file
                </p>
              </div>
              <Switch
                id="include-tracklist"
                checked={includeTracklist}
                onCheckedChange={setIncludeTracklist}
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <div>
                <Label
                  htmlFor="include-metadata"
                  className="text-sm font-normal"
                >
                  Include metadata JSON
                </Label>
                <p className="text-xs text-muted-foreground">
                  Export file metadata as JSON
                </p>
              </div>
              <Switch
                id="include-metadata"
                checked={includeMetadata}
                onCheckedChange={setIncludeMetadata}
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <div>
                <Label
                  htmlFor="clean-filenames"
                  className="text-sm font-normal"
                >
                  Clean filenames
                </Label>
                <p className="text-xs text-muted-foreground">
                  Normalize whitespace and special chars
                </p>
              </div>
              <Switch
                id="clean-filenames"
                checked={cleanFilenames}
                onCheckedChange={setCleanFilenames}
              />
            </div>
          </section>

          {result ? (
            <div className="space-y-3">
              <Alert>
                <AlertDescription>
                  {result.fileCount} sounds packed to {result.outputPath}.
                  No originals were changed.
                </AlertDescription>
              </Alert>

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
            <div className="flex items-center gap-2 rounded-xl border border-dashed border-border/40 bg-muted/30 p-3">
              <FolderUp className="size-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                Set a destination and pack name above, then click &quot;Make Pack&quot;
              </p>
            </div>
          )}
    </ExtensionDialogShell>
  )
}
