"use client"

import { useState, useCallback } from "react"
import { FileInput, FolderOpen, Loader2, Plus, Trash2, FolderSearch } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { getDesktopBridge, isDesktopApp } from "@/lib/desktop"

interface GatherFile {
  sourcePath: string
  outputPath: string
  skipped: boolean
  reason: string | null
}

interface GatherPreviewResult {
  copied: number
  skipped: number
  files: GatherFile[]
  reportPath: string
}

interface GatherCompletedResult {
  copied: number
  skipped: number
  reportPath: string
}

export function LibraryGathererDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [sourceFolders, setSourceFolders] = useState<string[]>([])
  const [newFolderPath, setNewFolderPath] = useState("")
  const [destDir, setDestDir] = useState("")
  const [copyMode, setCopyMode] = useState<"copy" | "move">("copy")
  const [isLoading, setIsLoading] = useState(false)
  const [previewResult, setPreviewResult] =
    useState<GatherPreviewResult | null>(null)
  const [completedResult, setCompletedResult] =
    useState<GatherCompletedResult | null>(null)

  const handleAddFolder = useCallback(() => {
    const path = newFolderPath.trim()
    if (!path) return

    if (sourceFolders.includes(path)) {
      toast.error("Folder already added")
      return
    }

    setSourceFolders((prev) => [...prev, path])
    setNewFolderPath("")
  }, [newFolderPath, sourceFolders])

  const handlePickFolder = useCallback(async () => {
    if (!isDesktopApp()) {
      toast.error("Folder picker requires the desktop app")
      return
    }

    const result = await getDesktopBridge()?.pickFolder()
    if (result?.ok && result.path) {
      setNewFolderPath(result.path)
    }
  }, [])

  const handleRemoveFolder = useCallback((path: string) => {
    setSourceFolders((prev) => prev.filter((p) => p !== path))
  }, [])

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

  const handlePreview = useCallback(async () => {
    if (sourceFolders.length === 0) {
      toast.error("Add at least one source folder")
      return
    }
    if (!destDir.trim()) {
      toast.error("Choose a destination directory")
      return
    }

    setIsLoading(true)
    setPreviewResult(null)
    setCompletedResult(null)

    try {
      const res = await fetch("/api/extensions/library-gatherer/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceDirectories: sourceFolders,
          destinationDirectory: destDir.trim(),
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error ?? "Preview failed")
      }

      setPreviewResult(data)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Preview failed"
      )
    } finally {
      setIsLoading(false)
    }
  }, [sourceFolders, destDir])

  const handleGather = useCallback(async () => {
    if (sourceFolders.length === 0 || !destDir.trim()) return

    setIsLoading(true)

    try {
      const res = await fetch("/api/extensions/library-gatherer/gather", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceDirectories: sourceFolders,
          destinationDirectory: destDir.trim(),
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error ?? "Gather failed")
      }

      setCompletedResult(data)
      setPreviewResult(null)
      toast.success(
        `Gathered ${data.copied} files (${data.skipped} skipped)`
      )
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Gather failed"
      )
    } finally {
      setIsLoading(false)
    }
  }, [sourceFolders, destDir])

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setPreviewResult(null)
          setCompletedResult(null)
        }
        onOpenChange(nextOpen)
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
          <section className="space-y-4 rounded-xl border border-border/40 bg-muted/30 p-4">
            <div className="flex items-center gap-2">
              <FolderSearch className="size-4 text-primary" />
              <span className="text-sm font-medium">Source folders</span>
              {sourceFolders.length > 0 && (
                <Badge variant="secondary">{sourceFolders.length}</Badge>
              )}
            </div>

            {sourceFolders.length > 0 && (
              <div className="space-y-1.5">
                {sourceFolders.map((folder) => (
                  <div
                    key={folder}
                    className="flex items-center justify-between rounded-lg border border-border/40 bg-background/50 px-3 py-1.5"
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
                  if (e.key === "Enter") handleAddFolder()
                }}
              />
              {isDesktopApp() && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePickFolder}
                >
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
          </section>

          <section className="space-y-4 rounded-xl border border-border/40 bg-muted/30 p-4">
            <div className="flex items-center gap-2">
              <FolderOpen className="size-4 text-primary" />
              <span className="text-sm font-medium">Main library destination</span>
            </div>

            <div className="flex gap-2">
              <Input
                value={destDir}
                onChange={(e) => setDestDir(e.target.value)}
                placeholder="/path/to/main/library"
                className="flex-1"
              />
              {isDesktopApp() && (
                <Button variant="outline" size="sm" onClick={handlePickDest}>
                  <FolderOpen className="mr-1 size-3" />
                  Choose
                </Button>
              )}
            </div>
          </section>

          <section className="space-y-4 rounded-xl border border-border/40 bg-muted/30 p-4">
            <div className="flex items-center gap-2">
              <FileInput className="size-4 text-primary" />
              <span className="text-sm font-medium">Copy mode</span>
            </div>

            <RadioGroup value={copyMode} onValueChange={(v) => setCopyMode(v as "copy" | "move")}>
              <RadioGroupItem value="copy">
                Copy files, keep originals
              </RadioGroupItem>
              <RadioGroupItem value="move">
                Move files after copying
                <span className="ml-1.5 text-xs text-muted-foreground">(advanced)</span>
              </RadioGroupItem>
            </RadioGroup>
          </section>

          {previewResult && (
            <Alert>
              <AlertTitle>Gather preview</AlertTitle>
              <AlertDescription>
                {previewResult.copied.toLocaleString()} files will be copied.
                {previewResult.skipped > 0 &&
                  ` ${previewResult.skipped.toLocaleString()} ${
                    previewResult.skipped === 1 ? "duplicate" : "duplicates"
                  } will be skipped.`}{" "}
                No originals will be moved or deleted.
              </AlertDescription>
            </Alert>
          )}

          {previewResult && previewResult.files.length > 0 && (
            <div className="max-h-32 space-y-1 overflow-y-auto rounded-xl border border-border/40 bg-background/50 p-3">
              {previewResult.files.slice(0, 20).map((file, idx) => (
                <p
                  key={idx}
                  className="truncate text-xs text-muted-foreground"
                >
                  {file.sourcePath} → {file.outputPath}
                  {file.reason && (
                    <span className="text-muted-foreground/60">
                      {" "}
                      ({file.reason})
                    </span>
                  )}
                </p>
              ))}
              {previewResult.files.length > 20 && (
                <p className="text-xs text-muted-foreground">
                  ...and {previewResult.files.length - 20} more
                </p>
              )}
            </div>
          )}

          {completedResult && (
            <div className="space-y-3">
              <Alert>
                <AlertTitle>Gather complete</AlertTitle>
                <AlertDescription>
                  {completedResult.copied.toLocaleString()} files copied,{" "}
                  {completedResult.skipped.toLocaleString()} skipped.
                  <br />
                  <span className="text-xs text-muted-foreground">
                    Report saved to {completedResult.reportPath}
                  </span>
                </AlertDescription>
              </Alert>

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
                    onClick={() => getDesktopBridge()?.revealPath(completedResult.reportPath)}
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
            <>
              <Button
                variant="secondary"
                onClick={handlePreview}
                disabled={
                  isLoading ||
                  sourceFolders.length === 0 ||
                  !destDir.trim()
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
                  isLoading ||
                  sourceFolders.length === 0 ||
                  !destDir.trim()
                }
              >
                <FileInput className="mr-2 size-4" />
                {isLoading ? "Working..." : "Gather into library"}
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
